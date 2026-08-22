import type { AuthenticationResult, LiveTranscriptionOptions, SpeakerTrack } from '../../AIProvider';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';
import { LiveTranscriptionEngine, type TranscribeResult } from '../../LiveTranscriptionEngine';
import { useAppStore } from '../../../../store/useAppStore';

/**
 * Groq Provider — OpenAI-compatible inference with Whisper transcription
 *
 * Endpoints:
 *   GET  https://api.groq.com/openai/v1/models                → model list
 *   POST https://api.groq.com/openai/v1/chat/completions      → text generation
 *   POST https://api.groq.com/openai/v1/audio/transcriptions  → Whisper STT
 *
 * Live transcription uses LiveTranscriptionEngine with whisper-large-v3-turbo.
 */
export class GroqProvider extends BaseOpenAICompatibleProvider {
  private liveEngine: LiveTranscriptionEngine;

  constructor() {
    super();
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob, promptContext?: string) => this.whisperTranscribe(blob, promptContext),
      44100
    );
  }

  protected getProviderName() { return 'Groq'; }
  protected buildBaseUrl() { return 'https://api.groq.com/openai/v1'; }

  protected buildHeaders(): Record<string, string> {
    const key = this.config?.apiKey || useAppStore.getState().apiKeys['Groq'] || '';
    return { Authorization: `Bearer ${key}` };
  }

  protected validateConfig(): string | null {
    if (!this.config?.apiKey) return 'Groq API Key is missing.';
    return null;
  }

  protected getCapabilities(): AuthenticationResult['capabilities'] {
    return {
      chat: true,
      speech_to_text: true,
      audio_generation: false,
      realtime: false,
      vision: false,
      embeddings: false,
      function_calling: true,
    };
  }

  protected filterModels(ids: string[]): string[] {
    // Filter out audio-only and TTS models — keep only chat-capable models
    const AUDIO_ONLY = ['whisper', 'orpheus', 'guard', 'tts', 'speech'];
    const chatModels = ids.filter(
      (id) => !AUDIO_ONLY.some((skip) => id.toLowerCase().includes(skip))
    );

    if (chatModels.length === 0) {
      return ['groq/compound-mini', 'groq/compound'];
    }

    // Sort: compound-mini first (Groq's recommended fast model), compound second,
    // llama third (if available on the plan), everything else after
    return chatModels.sort((a, b) => {
      const score = (id: string) =>
        id === 'groq/compound-mini' ? 0
        : id === 'groq/compound' ? 1
        : id.includes('llama') ? 2
        : 3;
      return score(a) - score(b);
    });
  }

  protected override resolveModel(): string {
    const raw = this.config?.defaultModel || useAppStore.getState().model;
    // Block known-decommissioned models
    if (raw && !raw.includes('gemma') && !raw.includes('mixtral') && !raw.includes('qwen')) {
      return raw;
    }
    return 'groq/compound-mini';
  }

  protected pickDefaultModel(ids: string[]): string {
    return (
      ids.find((id) => id === 'groq/compound-mini') ??
      ids.find((id) => id === 'groq/compound') ??
      ids.find((id) => id.includes('llama')) ??
      ids[0] ??
      'groq/compound-mini'
    );
  }

  // ── Whisper transcription ─────────────────────────────────────────────────

  /**
   * Sends a WAV Blob to Groq's Whisper endpoint and returns transcript text
   * plus a derived confidence score.
   *
   * Uses response_format=verbose_json (Groq mirrors OpenAI's Whisper API
   * shape, including avg_logprob/no_speech_prob per segment) instead of
   * plain text — same JSON payload size class as before, no extra request,
   * so this adds no latency to live transcript display.
   *
   * `promptContext`, when provided, rides on the same request as Whisper's
   * `prompt` field, giving the model the immediately preceding transcript
   * as context for better continuity across clip boundaries.
   */
  private async whisperTranscribe(audioBlob: Blob, promptContext?: string): Promise<TranscribeResult> {
    if (!this.config?.apiKey && window.electronAPI?.loadCredential) {
      try {
        const cred = await window.electronAPI.loadCredential('Groq');
        if (cred.ok && cred.secret) {
          if (this.config) this.config.apiKey = cred.secret;
          useAppStore.getState().setApiKeyForProvider('Groq', cred.secret);
        }
      } catch { /* ignore */ }
    }

    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
    form.append('model', 'whisper-large-v3-turbo');
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

  /** Same avg_logprob/no_speech_prob → 0-1 confidence conversion as OpenAIProvider. */
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
    return Math.max(0, logprobConfidence * (1 - noSpeechMax));
  }

  // ── Live transcription ────────────────────────────────────────────────────

  override async startLiveTranscription(options: LiveTranscriptionOptions): Promise<void> {
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob, promptContext?: string) => this.whisperTranscribe(blob, promptContext),
      44100
    );
    return this.liveEngine.start(options);
  }

  override async stopLiveTranscription(): Promise<void> {
    return this.liveEngine.stop();
  }

  override async transcribeAudioChunk(chunk: Float32Array, speakerTrack?: SpeakerTrack): Promise<void> {
    return this.liveEngine.processChunk(chunk, speakerTrack);
  }

  // ── File transcription ────────────────────────────────────────────────────

  override async transcribeAudio(audioFile: unknown): Promise<string> {
    if (!(audioFile instanceof Blob)) {
      throw new Error('Groq transcription requires a Blob or File object.');
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
