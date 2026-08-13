import type { LiveTranscriptionOptions, TranscriptEvent } from './AIProvider';
import { ProviderManager } from './ProviderManager';

/** How many seconds of audio to batch before sending to Whisper */
const BATCH_SECONDS = 6;

/**
 * Minimum RMS level to consider a chunk as "containing speech".
 * Raised from an earlier, too-sensitive 0.005 — that level let faint mic
 * hiss/room hum through, and Whisper reliably hallucinates fluent-sounding
 * text (repeated syllables, stock phrases like "Thank you.") on silent or
 * near-silent audio. This is a well-documented Whisper failure mode, not
 * specific to this app — see OpenAI's own community forum on the topic.
 */
const SPEECH_THRESHOLD = 0.012;

/** Common short phrases Whisper hallucinates on silence/noise, independent of language. */
const HALLUCINATION_PHRASES = [
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  "you're welcome",
  '감사합니다', // "thank you" (Korean) — appears in the observed hallucination log
  '안녕히 계세요', // "goodbye" (Korean)
];

/**
 * LiveTranscriptionEngine
 *
 * Replaces MockStreamEngine for providers that support real speech-to-text.
 *
 * Strategy:
 *  - Collects PCM Float32 chunks from the AudioCapture ScriptProcessorNode.
 *  - Every BATCH_SECONDS, encodes the buffered samples as a WAV Blob.
 *  - Sends the Blob to the provider's transcription endpoint.
 *  - Emits a TranscriptEvent for each completed batch.
 *  - Errors on individual batches are logged but never stop recording.
 *
 * This engine is PASSIVE — it never touches MediaStream directly.
 * The RecordingController feeds raw Float32Array chunks via processChunk().
 *
 * Providers that use this engine:
 *   OpenAI  → /v1/audio/transcriptions  (whisper-1)
 *   Groq    → /openai/v1/audio/transcriptions  (whisper-large-v3)
 *
 * Non-STT providers (Gemini, Anthropic, AWS, OpenRouter, Ollama, Custom)
 * keep their existing no-op / throw implementations — this engine is not used.
 */
export class LiveTranscriptionEngine {
  private options?: LiveTranscriptionOptions;
  private pendingChunks: Float32Array[] = [];
  private sampleRate = 44100;
  private batchIntervalId: ReturnType<typeof setInterval> | null = null;
  private sequenceId = 0;
  private sessionStartMs = 0;
  private isRunning = false;

  /** Tracks the last accepted transcript text + how many consecutive batches
   *  produced an identical (or near-identical) result — repeated identical
   *  short phrases across consecutive silent batches is a hallucination
   *  signature (e.g. "Thank you." on every batch during a silent stretch). */
  private lastAcceptedText = '';
  private consecutiveRepeatCount = 0;

  /** The actual API call — injected so OpenAI and Groq can provide their own impl */
  private transcribeFn?: (blob: Blob) => Promise<string>;

  /**
   * @param transcribeFn  Function that accepts a WAV Blob and returns transcript text.
   *                      Implemented per-provider in OpenAIProvider / GroqProvider.
   * @param sampleRate    Audio sample rate (default 44100)
   */
  constructor(
    transcribeFn?: (blob: Blob) => Promise<string>,
    sampleRate = 44100
  ) {
    this.transcribeFn = transcribeFn;
    this.sampleRate = sampleRate;
  }

  // ── Public API (matches the interface used by providers) ─────────────────

  async start(options: LiveTranscriptionOptions): Promise<void> {
    if (this.isRunning) return;
    this.options = options;
    this.pendingChunks = [];
    this.sequenceId = 0;
    this.sessionStartMs = Date.now();
    this.isRunning = true;
    this.lastAcceptedText = '';
    this.consecutiveRepeatCount = 0;

    // Flush whatever has been buffered every BATCH_SECONDS
    this.batchIntervalId = setInterval(
      () => this.flushBatch(),
      BATCH_SECONDS * 1000
    );
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.batchIntervalId !== null) {
      clearInterval(this.batchIntervalId);
      this.batchIntervalId = null;
    }
    // Flush any remaining audio that hasn't been sent yet
    if (this.pendingChunks.length > 0) {
      await this.flushBatch();
    }
    this.pendingChunks = [];
  }

  /**
   * Receive a PCM chunk from AudioCapture's ScriptProcessorNode.
   * Called on every onaudioprocess event (4096 samples ≈ 93ms at 44100Hz).
   */
  async processChunk(chunk: Float32Array): Promise<void> {
    if (!this.isRunning) return;
    this.pendingChunks.push(chunk);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async flushBatch(): Promise<void> {
    if (!this.options || this.pendingChunks.length === 0) return;

    // Snapshot and clear the buffer atomically
    const chunks = this.pendingChunks.splice(0);

    // Skip if entirely silent (below speech threshold)
    if (!this.hasSpeech(chunks)) return;

    try {
      const blob = this.encodePcmToWav(chunks, this.sampleRate);
      const text = (await this.callTranscription(blob)).trim();

      if (!text) return;

      if (this.looksLikeHallucination(text)) {
        console.warn('[LiveTranscriptionEngine] Discarded likely hallucinated text:', text);
        return;
      }

      // Calculate elapsed time for the timestamp badge
      const elapsedMs = Date.now() - this.sessionStartMs;
      const totalSec = Math.floor(elapsedMs / 1000);
      const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const ss = (totalSec % 60).toString().padStart(2, '0');
      const timestamp = `${mm}:${ss}`;

      const event: TranscriptEvent = {
        text: text.trim(),
        speaker: 'You',          // Speaker diarisation is not available in Whisper batch mode
        timestamp,
        isPartial: false,
        confidence: 0.95,
        segmentId: `seg-${Date.now()}-${this.sequenceId}`,
        sequenceId: this.sequenceId++,
        audioStartTime: Math.max(0, totalSec - BATCH_SECONDS),
        audioEndTime: totalSec,
      };

      this.options.onTranscriptUpdate(event);
    } catch (err) {
      // Log but never propagate — recording must continue even if a batch fails
      console.warn('[LiveTranscriptionEngine] Batch transcription failed (recording continues):', err);
      this.options.onError(err);
    }
  }

  private async callTranscription(blob: Blob): Promise<string> {
    if (this.transcribeFn) {
      try {
        return await this.transcribeFn(blob);
      } catch (primaryError) {
        // Automatic fallback: if the active provider's transcription call
        // fails for ANY reason (invalid/expired key, rate limit, transient
        // network error, etc), retry this exact batch through Deepgram
        // before giving up — but only if the user has saved a Deepgram key.
        // Silently does nothing extra if no Deepgram key exists, so users
        // who haven't opted in see the original error exactly as before.
        const deepgram = ProviderManager.getFallbackDeepgramProvider();
        if (!deepgram) throw primaryError;

        console.warn(
          '[LiveTranscriptionEngine] Primary provider transcription failed, retrying via Deepgram fallback:',
          primaryError
        );
        try {
          return await deepgram.transcribeAudio(blob);
        } catch (fallbackError) {
          console.warn('[LiveTranscriptionEngine] Deepgram fallback also failed:', fallbackError);
          // Surface the ORIGINAL error, not the fallback's — the user's
          // active provider is what they expect to see diagnostics for.
          throw primaryError;
        }
      }
    }
    // Should not reach here — only called when transcribeFn is provided
    throw new Error('No transcription function configured.');
  }

  /** Returns true if the chunk array contains audio above the speech threshold */
  private hasSpeech(chunks: Float32Array[]): boolean {
    for (const chunk of chunks) {
      let sum = 0;
      for (let i = 0; i < chunk.length; i++) {
        sum += chunk[i] * chunk[i];
      }
      const rms = Math.sqrt(sum / chunk.length);
      if (rms > SPEECH_THRESHOLD) return true;
    }
    return false;
  }

  /**
   * Heuristic check for Whisper's well-documented hallucination patterns on
   * silent/near-silent audio: repeated single syllables ("바-바-바-바-..."),
   * or the same short stock phrase repeating across consecutive batches
   * ("Thank you." on batch after batch with nothing actually said).
   *
   * This is a heuristic, not a guarantee — it targets the specific patterns
   * observed in practice rather than attempting general hallucination
   * detection (which even dedicated research models struggle with).
   */
  private looksLikeHallucination(text: string): boolean {
    const normalized = text.toLowerCase().trim();

    // Pattern 1: repeated syllable/word chains like "바-바-바-바-바..." or
    // "la la la la la" — a single short token (≤4 chars) repeated 5+ times,
    // optionally separated by hyphens or spaces.
    const repeatedTokenMatch = normalized.match(/^([\p{L}]{1,4})([\s-]+\1){4,}/u);
    if (repeatedTokenMatch) {
      this.lastAcceptedText = '';
      this.consecutiveRepeatCount = 0;
      return true;
    }

    // Pattern 2: the exact same short (<=6 word) phrase repeating across
    // consecutive batches — legitimate speech almost never repeats verbatim
    // batch after batch, but silence-triggered hallucinations often do.
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    const isShortPhrase = wordCount > 0 && wordCount <= 6;
    const isKnownFillerPhrase = HALLUCINATION_PHRASES.some((p) => normalized === p || normalized === p + '.');

    if (isShortPhrase && normalized === this.lastAcceptedText) {
      this.consecutiveRepeatCount++;
      // Allow the phrase through once (people do say "Thank you." for real),
      // but suppress the 2nd+ consecutive identical occurrence — and suppress
      // immediately if it's also a known filler phrase Whisper favours.
      if (this.consecutiveRepeatCount >= 1 && isKnownFillerPhrase) return true;
      if (this.consecutiveRepeatCount >= 2) return true;
    } else {
      this.consecutiveRepeatCount = 0;
    }

    this.lastAcceptedText = normalized;
    return false;
  }

  // ── WAV encoder ───────────────────────────────────────────────────────────

  /**
   * Concatenate all Float32 chunks and encode as a 16-bit PCM mono WAV Blob.
   * This matches the format expected by Whisper's /audio/transcriptions endpoint.
   */
  private encodePcmToWav(chunks: Float32Array[], sampleRate: number): Blob {
    // Concatenate
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const samples = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      samples.set(c, offset);
      offset += c.length;
    }

    // Build WAV header
    const byteLen = samples.length * 2;
    const buffer = new ArrayBuffer(44 + byteLen);
    const view = new DataView(buffer);

    const write32 = (off: number, v: number) => view.setUint32(off, v, true);
    const write16 = (off: number, v: number) => view.setUint16(off, v, true);
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    write32(4, 36 + byteLen);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    write32(16, 16);        // PCM
    write16(20, 1);         // PCM format
    write16(22, 1);         // Mono
    write32(24, sampleRate);
    write32(28, sampleRate * 2);
    write16(32, 2);         // Block align
    write16(34, 16);        // Bits per sample
    writeStr(36, 'data');
    write32(40, byteLen);

    // Convert Float32 → Int16
    let writeOffset = 44;
    for (let i = 0; i < samples.length; i++, writeOffset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(writeOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
