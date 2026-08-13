import type { AuthenticationResult, LiveTranscriptionOptions } from '../../AIProvider';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';
import { LiveTranscriptionEngine } from '../../LiveTranscriptionEngine';
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
 * 6-second WAV blobs and sends them to Whisper. No mock data is generated.
 */
export class OpenAIProvider extends BaseOpenAICompatibleProvider {
  /** LiveTranscriptionEngine wired to this provider's Whisper endpoint */
  private liveEngine: LiveTranscriptionEngine;

  constructor() {
    super();
    // Inject the actual Whisper transcription function into the engine.
    // Arrow function captures `this` so `buildHeaders()` / `buildBaseUrl()` work correctly.
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob) => this.whisperTranscribe(blob),
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
   * Sends a WAV Blob to /v1/audio/transcriptions and returns the transcript text.
   */
  private async whisperTranscribe(audioBlob: Blob): Promise<string> {
    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
    form.append('model', 'whisper-1');
    form.append('response_format', 'text');

    // Language hint from Settings > Language > Transcription language.
    // 'auto' omits the param entirely, letting Whisper auto-detect.
    const language = useAppStore.getState().transcriptionLanguage;
    if (language && language !== 'auto') {
      form.append('language', language);
    }

    const data = await this.postFormData<string | { text: string }>(
      '/audio/transcriptions',
      form
    );
    return (typeof data === 'string' ? data : data.text).trim();
  }

  // ── AIProvider live transcription interface ───────────────────────────────

  override async startLiveTranscription(options: LiveTranscriptionOptions): Promise<void> {
    // Re-create engine with current config (sampleRate may have changed)
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob) => this.whisperTranscribe(blob),
      44100
    );
    return this.liveEngine.start(options);
  }

  override async stopLiveTranscription(): Promise<void> {
    return this.liveEngine.stop();
  }

  override async transcribeAudioChunk(chunk: Float32Array): Promise<void> {
    return this.liveEngine.processChunk(chunk);
  }

  // ── File transcription ────────────────────────────────────────────────────

  override async transcribeAudio(audioFile: unknown): Promise<string> {
    if (!(audioFile instanceof Blob)) {
      throw new Error('OpenAI transcription requires a Blob or File object.');
    }
    return this.whisperTranscribe(audioFile);
  }

  override async transcribeAudioFile(audioFile: unknown): Promise<string> {
    return this.transcribeAudio(audioFile);
  }

  override async speechToText(audioData: unknown): Promise<string> {
    return this.transcribeAudio(audioData);
  }
}
