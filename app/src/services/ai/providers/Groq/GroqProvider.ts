import type { AuthenticationResult, LiveTranscriptionOptions } from '../../AIProvider';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';
import { LiveTranscriptionEngine } from '../../LiveTranscriptionEngine';
import { useAppStore } from '../../../../store/useAppStore';

/**
 * Groq Provider — OpenAI-compatible inference with Whisper transcription
 *
 * Endpoints:
 *   GET  https://api.groq.com/openai/v1/models                → model list
 *   POST https://api.groq.com/openai/v1/chat/completions      → text generation
 *   POST https://api.groq.com/openai/v1/audio/transcriptions  → Whisper STT
 *
 * Live transcription uses LiveTranscriptionEngine with whisper-large-v3.
 */
export class GroqProvider extends BaseOpenAICompatibleProvider {
  private liveEngine: LiveTranscriptionEngine;

  constructor() {
    super();
    this.liveEngine = new LiveTranscriptionEngine(
      (blob: Blob) => this.whisperTranscribe(blob),
      44100
    );
  }

  protected getProviderName() { return 'Groq'; }
  protected buildBaseUrl() { return 'https://api.groq.com/openai/v1'; }

  protected buildHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config?.apiKey ?? ''}` };
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
    const chat = ids.filter(
      (id) =>
        (id.startsWith('llama') ||
          id.startsWith('mixtral') ||
          id.startsWith('gemma')) &&
        !id.includes('whisper')
    );
    return chat.sort((a, b) => {
      const score = (id: string) =>
        id.startsWith('llama') ? 0 : id.startsWith('mixtral') ? 1 : 2;
      return score(a) - score(b) || a.localeCompare(b);
    });
  }

  protected pickDefaultModel(ids: string[]): string {
    return (
      ids.find((id) => id === 'llama-3.3-70b-versatile') ??
      ids.find((id) => id.startsWith('llama')) ??
      ids[0] ??
      ''
    );
  }

  // ── Whisper transcription ─────────────────────────────────────────────────

  private async whisperTranscribe(audioBlob: Blob): Promise<string> {
    const form = new FormData();
    form.append('file', audioBlob, 'audio.wav');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'text');

    // Language hint from Settings > Language > Transcription language.
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

  // ── Live transcription ────────────────────────────────────────────────────

  override async startLiveTranscription(options: LiveTranscriptionOptions): Promise<void> {
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
      throw new Error('Groq transcription requires a Blob or File object.');
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
