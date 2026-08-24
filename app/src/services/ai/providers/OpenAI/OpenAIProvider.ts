import type { AuthenticationResult, LiveTranscriptionOptions, SpeakerTrack } from '../../AIProvider';
import type { AttributedSegment } from '../../../audio/AudioSourceAttribution';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';
import { LiveTranscriptionEngine, type TranscribeResult } from '../../LiveTranscriptionEngine';
import { useAppStore } from '../../../../store/useAppStore';

/**
 * OpenAI Provider — reference implementation.
 *
 * Endpoints used:
 *   GET  https://api.openai.com/v1/models              → model discovery
 *   POST https://api.openai.com/v1/chat/completions    → all text generation
 *   POST https://api.openai.com/v1/audio/transcriptions → Whisper STT (live + file)
 *
 * Live transcription uses LiveTranscriptionEngine which batches PCM chunks into
 * short WAV clips on natural speech pauses and sends them to Whisper. No mock
 * data is generated.
 */
export class OpenAIProvider extends BaseOpenAICompatibleProvider {
  /** LiveTranscriptionEngine wired to this provider's Whisper endpoint */
  private liveEngine: LiveTranscriptionEngine;

  constructor() {
    super();
    // Inject the actual Whisper transcription function into the engine.
    // Arrow function captures `this` so `buildHeaders()` / `buildBaseUrl()` work correctly.
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob, promptContext?: string) => this.whisperTranscribe(blob, promptContext),
      44100
    );
  }

  protected getProviderName() { return 'OpenAI'; }
  protected buildBaseUrl() { return 'https://api.openai.com/v1'; }

  protected buildHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config?.apiKey ?? ''}` };
  }

  protected validateConfig(): string | null {
    if (!this.config?.apiKey) return 'OpenAI API Key is missing.';
    return null;
  }

  protected getCapabilities(): AuthenticationResult['capabilities'] {
    return {
      chat: true,
      speech_to_text: true,
      audio_generation: false,
      realtime: false,
      vision: true,
      embeddings: true,
      function_calling: true,
    };
  }

  /** Surface only GPT / o-series chat models */
  protected filterModels(ids: string[]): string[] {
    return ids
      .filter(
        (id) =>
          (id.startsWith('gpt-') ||
            id.startsWith('o1') ||
            id.startsWith('o3') ||
            id.startsWith('o4')) &&
          !id.includes('instruct') &&
          !id.includes('realtime')
      )
      .sort((a, b) => {
        const score = (id: string) =>
          id.includes('4o') ? 0 : id.includes('4') ? 1 : 2;
        return score(a) - score(b) || a.localeCompare(b);
      });
  }

  protected pickDefaultModel(ids: string[]): string {
    return (
      ids.find((id) => id === 'gpt-4o-mini') ??
      ids.find((id) => id.startsWith('gpt-4o')) ??
      ids[0] ??
      ''
    );
  }

  // ── Whisper transcription ─────────────────────────────────────────────────

  /**
   * Core Whisper call — used by both live batching and file transcription.
   * Sends a WAV Blob to /v1/audio/transcriptions and returns the transcript
   * text plus a derived confidence score.
   *
   * Uses response_format=verbose_json instead of plain text. Per OpenAI's
   * own docs, segment-level timestamps/metadata add no additional latency
   * (only word-level timestamps do, which we don't request) — so this adds
   * zero delay to live transcript display while unlocking avg_logprob /
   * no_speech_prob, Whisper's actual model-reported confidence signals,
   * which the previous plain-"text" format discarded entirely.
   *
   * `promptContext`, when provided, is passed as Whisper's `prompt` field —
   * this rides on the same request that was already being made, so it also
   * adds no extra latency, but gives the model the immediately preceding
   * transcript as context. This measurably improves continuity across
   * clip boundaries (names, acronyms, mid-sentence continuations) instead
   * of transcribing every ~1-8s clip cold.
   */
  private async whisperTranscribe(audioBlob: Blob, promptContext?: string): Promise<TranscribeResult> {
    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');

    if (promptContext) {
      form.append('prompt', promptContext);
    }

    // Default to 'en' or user configured language to prevent random multi-lingual guessing
    const language = useAppStore.getState().transcriptionLanguage;
    if (language && language !== 'auto') {
      form.append('language', language);
    } else {
      form.append('language', 'en');
    }

    const data = await this.postFormData<{
      text: string;
      segments?: { avg_logprob: number; no_speech_prob: number }[];
    }>('/audio/transcriptions', form);

    const text = (data.text ?? '').trim();
    const confidence = this.deriveConfidence(data.segments);

    return { text, confidence };
  }

  /**
   * Converts Whisper's per-segment avg_logprob (log probability, typically
   * in roughly [-1, 0] for confident speech, more negative for garbled/
   * uncertain audio) and no_speech_prob (0-1 chance the segment is actually
   * silence) into a single 0-1 confidence score.
   *
   * avg_logprob is converted via exp() to get a rough linear probability-
   * like value, then discounted by no_speech_prob so a segment Whisper
   * itself suspects is silence scores low even if the text it emitted looks
   * fluent — this is exactly the class of hallucination (confident-sounding
   * text generated over silence) that a plain word-count/pattern heuristic
   * cannot detect on its own.
   */
  private deriveConfidence(segments?: { avg_logprob: number; no_speech_prob: number }[]): number | undefined {
    if (!segments || segments.length === 0) return undefined;

    let logprobSum = 0;
    let noSpeechMax = 0;
    for (const seg of segments) {
      logprobSum += seg.avg_logprob;
      if (seg.no_speech_prob > noSpeechMax) noSpeechMax = seg.no_speech_prob;
    }
    const avgLogprob = logprobSum / segments.length;

    const logprobConfidence = Math.max(0, Math.min(1, Math.exp(avgLogprob)));
    // Discount by the worst no_speech_prob seen across segments in this clip.
    return Math.max(0, logprobConfidence * (1 - noSpeechMax));
  }

  // ── AIProvider live transcription interface ───────────────────────────────

  override async startLiveTranscription(options: LiveTranscriptionOptions): Promise<void> {
    // Re-create engine with current config (sampleRate may have changed)
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob, promptContext?: string) => this.whisperTranscribe(blob, promptContext),
      44100
    );
    return this.liveEngine.start(options);
  }

  override async stopLiveTranscription(): Promise<void> {
    return this.liveEngine.stop();
  }

  override async transcribeAudioChunk(chunk: Float32Array, speakerTrack?: SpeakerTrack, attribution?: AttributedSegment): Promise<void> {
    return this.liveEngine.processChunk(chunk, speakerTrack, attribution);
  }

  // ── File transcription ────────────────────────────────────────────────────

  override async transcribeAudio(audioFile: unknown): Promise<string> {
    if (!(audioFile instanceof Blob)) {
      throw new Error('OpenAI transcription requires a Blob or File object.');
    }
    return (await this.whisperTranscribe(audioFile)).text;
  }

  override async transcribeAudioFile(audioFile: unknown): Promise<string> {
    return this.transcribeAudio(audioFile);
  }

  override async speechToText(audioData: unknown): Promise<string> {
    return this.transcribeAudio(audioData);
  }
}
