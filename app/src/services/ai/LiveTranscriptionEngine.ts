import type { LiveTranscriptionOptions, TranscriptEvent, SpeakerTrack } from './AIProvider';
import { ProviderManager } from './ProviderManager';

/**
 * Minimum RMS level to consider a chunk as "containing speech".
 * This is a floor only — actual speech onset also requires the chunk to
 * clear the adaptive noise floor (see NOISE_FLOOR_MARGIN below), so real
 * ambient noise levels above this constant don't cause false triggers.
 */
const SPEECH_THRESHOLD = 0.012;

/**
 * How far above the rolling ambient noise floor a chunk's RMS must be to
 * count as real speech onset, expressed as a multiplier. Fixed thresholds
 * fail differently for every room/mic (too loose in noisy rooms, too tight
 * in quiet ones); tracking the actual noise floor and requiring a clear
 * margin above it is far more robust to sustained background noise (fans,
 * hum, HVAC) that would otherwise flicker across a fixed RMS constant.
 */
const NOISE_FLOOR_MARGIN = 2.2;

/** Silence chunks before triggering sentence flush (7 chunks * ~93ms ≈ 650ms) */
const SILENCE_LIMIT_CHUNKS = 7;

/**
 * Minimum speech chunks required to trigger a sentence (4 chunks * ~93ms ≈ 370ms).
 * Kept short for responsiveness — hallucination on noise is now primarily guarded
 * against by the adaptive noise-floor gate at speech onset (NOISE_FLOOR_MARGIN)
 * and the peak-energy check in hasSpeech(), rather than by delaying every flush.
 */
const MIN_SPEECH_CHUNKS = 4;

/** Maximum speech chunks before forced flush (85 chunks * ~93ms ≈ 8.0s) */
const MAX_SPEECH_CHUNKS = 85;

/** Number of pre-roll chunks to prepend to avoid cutting off the first syllable */
const PRE_ROLL_CHUNKS = 3;

/**
 * Result shape every provider's transcribeFn now returns, instead of a bare
 * string. `confidence` is the provider's own model-reported confidence for
 * the clip (Whisper: derived from avg_logprob/no_speech_prob; Deepgram/
 * AssemblyAI: their native per-word/utterance confidence). Optional because
 * a provider that genuinely has no confidence signal can omit it — the
 * gate below only activates when a number is actually present, so it never
 * makes filtering stricter for a provider that can't supply the signal.
 */
export interface TranscribeResult {
  text: string;
  confidence?: number;
}

/**
 * Minimum model-reported confidence to accept a transcribed clip. Below
 * this, the clip is dropped the same way a pattern-matched hallucination
 * is — this is a strictly *additional* signal on top of the existing
 * heuristics, not a replacement, since not every provider/clip will have a
 * usable confidence value.
 */
const MIN_ACCEPT_CONFIDENCE = 0.20;

/** Max characters of prior transcript kept as rolling context for the next Whisper call */
const PROMPT_CONTEXT_MAX_CHARS = 200;

/** Common short phrases Whisper hallucinates on silence/noise across languages */
const HALLUCINATION_PHRASES = [
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  "you're welcome",
  'grazie a tutti',
  'grazie',
  'obrigado',
  'obrigada',
  '감사합니다',
  '안녕히 계세요',
  'subtitles by',
  'subtitle by',
  'translated by',
  'watching',
];

interface TrackVADState {
  speakerLabel: SpeakerTrack;
  preRollBuffer: Float32Array[];
  speechBuffer: Float32Array[];
  isSpeaking: boolean;
  speechChunksCount: number;
  silenceChunksCount: number;
  /**
   * Rolling estimate of ambient noise RMS, updated only while idle (not
   * speaking). Speech onset requires a chunk's RMS to clear both the fixed
   * SPEECH_THRESHOLD floor AND noiseFloor * NOISE_FLOOR_MARGIN, so the
   * detector self-calibrates to the room's actual noise level instead of
   * relying solely on one constant that's wrong for most environments.
   */
  noiseFloor: number;
}

/**
 * LiveTranscriptionEngine
 *
 * Implements intelligent Dual-Track VAD (Voice Activity Detection) for live speech:
 *  - Track 1 (Microphone): Tagged as 'You'
 *  - Track 2 (Desktop Loopback): Tagged as 'Speaker' (Other Participants)
 *  - Utterances are dynamically flushed on natural sentence pauses (650ms silence).
 */
export class LiveTranscriptionEngine {
  private options?: LiveTranscriptionOptions;
  private sampleRate = 44100;
  private sequenceId = 0;
  private sessionStartMs = 0;
  private isRunning = false;

  private micTrack: TrackVADState = {
    speakerLabel: 'You',
    preRollBuffer: [],
    speechBuffer: [],
    isSpeaking: false,
    speechChunksCount: 0,
    silenceChunksCount: 0,
    noiseFloor: SPEECH_THRESHOLD,
  };

  private systemTrack: TrackVADState = {
    speakerLabel: 'Speaker',
    preRollBuffer: [],
    speechBuffer: [],
    isSpeaking: false,
    speechChunksCount: 0,
    silenceChunksCount: 0,
    noiseFloor: SPEECH_THRESHOLD,
  };

  /**
   * Per-speaker last-accepted-text state for Pattern 3 below. Previously this
   * was two flat fields shared across BOTH tracks — since the mic ("You") and
   * system ("Speaker") tracks run as fully independent VAD state machines and
   * their flushes interleave in delivery order, a shared single "last text"
   * meant a repeat from one speaker could mask (or fail to catch) a genuine
   * repeat from the other. This is especially relevant without headphones,
   * where mic/system cross-talk bleed increases the odds of near-simultaneous
   * near-duplicate text arriving from both tracks.
   */
  private lastAcceptedTextBySpeaker = new Map<string, string>();
  private consecutiveRepeatCountBySpeaker = new Map<string, number>();

  /**
   * Rolling context passed to Whisper's `prompt` field on the NEXT call, so
   * each ~1-8s clip is no longer transcribed with zero memory of what was
   * just said. This costs nothing extra — it rides along on the same single
   * request that was already going to be made, so it adds no latency to
   * live transcript display. Capped in length (see acceptPromptContext)
   * since Whisper only uses the prompt's final ~224 tokens anyway and a
   * longer string just costs upload bytes for no benefit.
   */
  private promptContext = '';

  /** The actual API call injected by OpenAIProvider / GroqProvider */
  private transcribeFn?: (blob: Blob, promptContext?: string) => Promise<TranscribeResult>;

  constructor(
    transcribeFn?: (blob: Blob, promptContext?: string) => Promise<TranscribeResult>,
    sampleRate = 44100
  ) {
    this.transcribeFn = transcribeFn;
    this.sampleRate = sampleRate;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(options: LiveTranscriptionOptions): Promise<void> {
    if (this.isRunning) return;
    this.options = options;
    this.sequenceId = 0;
    this.sessionStartMs = Date.now();
    this.isRunning = true;
    this.lastAcceptedTextBySpeaker.clear();
    this.consecutiveRepeatCountBySpeaker.clear();
    this.promptContext = '';

    this.resetTrack(this.micTrack);
    this.resetTrack(this.systemTrack);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    // Flush any pending speech buffers on stop
    await this.flushTrackIfSpeech(this.micTrack);
    await this.flushTrackIfSpeech(this.systemTrack);
    this.resetTrack(this.micTrack);
    this.resetTrack(this.systemTrack);
  }

  /**
   * Process a PCM audio chunk through the VAD state machine for the given speaker track.
   */
  async processChunk(chunk: Float32Array, speakerTrack: SpeakerTrack = 'You'): Promise<void> {
    if (!this.isRunning) return;

    const track = speakerTrack === 'Speaker' ? this.systemTrack : this.micTrack;

    // Calculate RMS volume level for this 93ms chunk
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i];
    }
    const rms = Math.sqrt(sum / chunk.length);

    // Speech onset requires clearing BOTH the fixed floor and a clear margin
    // above the rolling noise floor. While already speaking, a slightly
    // lower bar (no margin) is used so a real sentence's natural volume dips
    // don't get chopped into fragments — only the onset decision needs to be
    // strict, since the noise floor is exactly what we're trying to reject
    // at the point where a false trigger would start a whole clip.
    const onsetThreshold = Math.max(SPEECH_THRESHOLD, track.noiseFloor * NOISE_FLOOR_MARGIN);
    const hasVoice = track.isSpeaking ? rms >= SPEECH_THRESHOLD : rms >= onsetThreshold;

    if (hasVoice) {
      if (!track.isSpeaking) {
        // Speech onset: include pre-roll chunks so the first consonant isn't clipped
        track.isSpeaking = true;
        track.speechBuffer = [...track.preRollBuffer, chunk];
        track.speechChunksCount = 1;
        track.silenceChunksCount = 0;
      } else {
        track.speechBuffer.push(chunk);
        track.speechChunksCount++;
        track.silenceChunksCount = 0;

        // Long speech cap: if continuous talking exceeds MAX_SPEECH_CHUNKS (~8.0s), flush sentence
        if (track.speechBuffer.length >= MAX_SPEECH_CHUNKS) {
          await this.flushTrack(track);
        }
      }
    } else {
      if (track.isSpeaking) {
        track.silenceChunksCount++;
        track.speechBuffer.push(chunk); // keep natural trail

        // Natural pause detected (e.g. ~650ms of silence after speaking)
        if (track.silenceChunksCount >= SILENCE_LIMIT_CHUNKS) {
          if (track.speechChunksCount >= MIN_SPEECH_CHUNKS) {
            await this.flushTrack(track);
          } else {
            // Below min speech length (e.g. short click or mic tap) — discard
            track.speechBuffer = [];
            track.isSpeaking = false;
            track.speechChunksCount = 0;
            track.silenceChunksCount = 0;
          }
        }
      } else {
        // Idle: this chunk is genuinely ambient noise (below the fixed
        // floor already, or it would have triggered onset above) — use it
        // to slowly calibrate the rolling noise floor to the room's actual
        // level. Exponential moving average smooths out one-off spikes
        // (a door closing, a single cough) so they don't permanently raise
        // the floor and make the detector deaf to real speech afterward.
        const NOISE_FLOOR_EMA_ALPHA = 0.05;
        track.noiseFloor = track.noiseFloor + NOISE_FLOOR_EMA_ALPHA * (rms - track.noiseFloor);

        // Idle: update rolling pre-roll buffer
        track.preRollBuffer.push(chunk);
        if (track.preRollBuffer.length > PRE_ROLL_CHUNKS) {
          track.preRollBuffer.shift();
        }
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private resetTrack(track: TrackVADState): void {
    track.preRollBuffer = [];
    track.speechBuffer = [];
    track.isSpeaking = false;
    track.speechChunksCount = 0;
    track.silenceChunksCount = 0;
  }

  private async flushTrackIfSpeech(track: TrackVADState): Promise<void> {
    if (track.speechBuffer.length >= MIN_SPEECH_CHUNKS) {
      await this.flushTrack(track);
    }
  }

  private async flushTrack(track: TrackVADState): Promise<void> {
    if (!this.options || track.speechBuffer.length === 0) return;

    const chunks = track.speechBuffer.splice(0);
    track.isSpeaking = false;
    track.speechChunksCount = 0;
    track.silenceChunksCount = 0;

    if (!this.hasSpeech(chunks, track.noiseFloor)) return;

    // Approximate real audio duration of this clip — used to sanity-check
    // whether the returned text is even plausible for how much audio was sent.
    const clipDurationSec = chunks.length * 0.093;

    try {
      const blob = this.encodePcmToWav(chunks, this.sampleRate);
      const result = await this.callTranscription(blob, this.promptContext);
      const text = result.text.trim();

      if (!text) return;

      // Model-reported confidence gate — only enforced when the provider
      // actually supplied a value. This runs before the pattern-based
      // hallucination check since a low-confidence clip is often exactly
      // the kind of noise/silence artifact that check exists to catch, and
      // rejecting on the model's own signal is more reliable than pattern
      // matching when it's available.
      if (result.confidence !== undefined && result.confidence < MIN_ACCEPT_CONFIDENCE) {
        console.warn(
          `[LiveTranscriptionEngine] Discarded low-confidence clip for [${track.speakerLabel}] ` +
          `(confidence=${result.confidence.toFixed(2)}):`, text
        );
        return;
      }

      if (this.looksLikeHallucination(text, track.speakerLabel, clipDurationSec)) {
        console.warn(`[LiveTranscriptionEngine] Discarded hallucination for [${track.speakerLabel}]:`, text);
        return;
      }

      // Feed this accepted text forward as context for the NEXT Whisper
      // call on this session (shared across both tracks — it's just prior
      // conversational context, not per-speaker state). Capped so the
      // prompt doesn't grow unbounded across a long meeting; Whisper only
      // attends to the tail of a long prompt anyway.
      this.promptContext = `${this.promptContext} ${text}`.trim().slice(-PROMPT_CONTEXT_MAX_CHARS);

      // Calculate elapsed time for the timestamp badge
      const elapsedMs = Date.now() - this.sessionStartMs;
      const totalSec = Math.floor(elapsedMs / 1000);
      const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const ss = (totalSec % 60).toString().padStart(2, '0');
      const timestamp = `${mm}:${ss}`;

      const event: TranscriptEvent = {
        text: text.trim(),
        speaker: track.speakerLabel,
        timestamp,
        isPartial: false,
        confidence: result.confidence ?? 0.95,
        segmentId: `seg-${Date.now()}-${this.sequenceId}`,
        sequenceId: this.sequenceId++,
        audioStartTime: Math.max(0, totalSec - Math.floor(chunks.length * 0.093)),
        audioEndTime: totalSec,
      };

      this.options.onTranscriptUpdate(event);
    } catch (err) {
      console.warn(`[LiveTranscriptionEngine] VAD transcription failed for [${track.speakerLabel}]:`, err);
      this.options.onError(err);
    }
  }

  private async callTranscription(blob: Blob, promptContext: string): Promise<TranscribeResult> {
    if (this.transcribeFn) {
      try {
        return await this.transcribeFn(blob, promptContext);
      } catch (primaryError) {
        const deepgram = ProviderManager.getFallbackDeepgramProvider();
        if (!deepgram) throw primaryError;

        console.warn(
          '[LiveTranscriptionEngine] Primary provider transcription failed, retrying via Deepgram fallback:',
          primaryError
        );
        try {
          const text = await deepgram.transcribeAudio(blob);
          return { text };
        } catch (fallbackError) {
          console.warn('[LiveTranscriptionEngine] Deepgram fallback also failed:', fallbackError);
          throw primaryError;
        }
      }
    }
    throw new Error('No transcription function configured.');
  }

  private hasSpeech(chunks: Float32Array[], noiseFloor: number): boolean {
    let speechCount = 0;
    let peakRms = 0;
    for (const chunk of chunks) {
      let sum = 0;
      for (let i = 0; i < chunk.length; i++) {
        sum += chunk[i] * chunk[i];
      }
      const rms = Math.sqrt(sum / chunk.length);
      if (rms >= SPEECH_THRESHOLD) {
        speechCount++;
      }
      if (rms > peakRms) peakRms = rms;
    }
    // Must contain at least MIN_SPEECH_CHUNKS (~370ms) of active voice audio...
    if (speechCount < MIN_SPEECH_CHUNKS) return false;
    // ...AND at least one chunk that clearly peaks above the room's actual
    // noise floor. Sustained background noise (fan, HVAC, hum) can drift
    // above the fixed SPEECH_THRESHOLD constant for a stretch without ever
    // producing a real, sharp speech-like peak — this rejects that clip
    // before it ever reaches Whisper, rather than relying on Whisper to
    // recognize silence/noise on its own (it rarely does).
    return peakRms >= noiseFloor * NOISE_FLOOR_MARGIN;
  }

  private looksLikeHallucination(text: string, speakerLabel: string, clipDurationSec?: number): boolean {
    const normalized = text.toLowerCase().trim();

    // Pattern 0: implausible length for how much audio was actually sent.
    // Natural speech runs at roughly 2-3 words/second; a real 700ms clip
    // cannot legitimately contain a fluent multi-clause sentence. When
    // Whisper is fed a short or ambiguous clip it will often "fill in" a
    // plausible-sounding, fabricated sentence rather than return little/no
    // text — this catches that class of hallucination even when the wording
    // looks coherent and isn't a known filler phrase.
    if (clipDurationSec !== undefined) {
      const wordCount = normalized.split(/\s+/).filter(Boolean).length;
      const maxPlausibleWords = Math.max(3, Math.ceil(clipDurationSec * 3.5));
      if (wordCount > maxPlausibleWords) {
        return true;
      }
    }

    // Pattern 1: repeated single syllable / word chains (e.g. "la la la la la", "thank you thank you")
    const repeatedTokenMatch = normalized.match(/^([\p{L}]{1,4})([\s-]+\1){4,}/u);
    if (repeatedTokenMatch) {
      this.lastAcceptedTextBySpeaker.set(speakerLabel, '');
      this.consecutiveRepeatCountBySpeaker.set(speakerLabel, 0);
      return true;
    }

    // Pattern 2: known single filler phrases (e.g. "Thank you.", "Grazie a tutti.", "Obrigado.")
    const cleanPunctuation = normalized.replace(/[.,!?;:]/g, '').trim();
    const isKnownFillerPhrase = HALLUCINATION_PHRASES.some((p) => cleanPunctuation === p || cleanPunctuation.startsWith(p));
    if (isKnownFillerPhrase) {
      return true;
    }

    // Pattern 3: the exact same short phrase repeating across consecutive
    // utterances FROM THE SAME SPEAKER TRACK. Tracked per-speaker (not
    // globally) since the mic and system tracks are independent state
    // machines whose flushes interleave — a shared "last text" could miss a
    // real repeat from one speaker sandwiched between unrelated text from
    // the other, or wrongly suppress a legitimate short repeated word said
    // by a different speaker right after the first speaker said it.
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    const isShortPhrase = wordCount > 0 && wordCount <= 6;
    const lastAcceptedText = this.lastAcceptedTextBySpeaker.get(speakerLabel) ?? '';

    if (isShortPhrase && normalized === lastAcceptedText) {
      const nextCount = (this.consecutiveRepeatCountBySpeaker.get(speakerLabel) ?? 0) + 1;
      this.consecutiveRepeatCountBySpeaker.set(speakerLabel, nextCount);
      if (nextCount >= 1) return true;
    } else {
      this.consecutiveRepeatCountBySpeaker.set(speakerLabel, 0);
    }

    this.lastAcceptedTextBySpeaker.set(speakerLabel, normalized);
    return false;
  }

  // ── WAV encoder ───────────────────────────────────────────────────────────

  private encodePcmToWav(chunks: Float32Array[], sampleRate: number): Blob {
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const samples = new Float32Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      samples.set(c, offset);
      offset += c.length;
    }

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
