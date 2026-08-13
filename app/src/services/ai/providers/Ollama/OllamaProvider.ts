import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
} from '../../AIProvider';

/**
 * Ollama Provider — local model inference server
 *
 * Endpoints:
 *   GET  {baseUrl}/api/tags        → list installed models
 *   POST {baseUrl}/api/chat        → chat generation (OpenAI-compatible messages)
 *
 * Auth: none (local server).
 * No audio transcription support.
 */
export class OllamaProvider implements AIProvider {
  private config?: ProviderConfig;

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  private get baseUrl(): string {
    return (this.config?.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
  }

  private get model(): string {
    return this.config?.defaultModel ?? 'llama3.2';
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'GET' });
    if (!res.ok) throw this.mapError(res.status);
    return res.json() as Promise<T>;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw this.mapError(res.status);
    return res.json() as Promise<T>;
  }

  private mapError(status: number): Error {
    if (status === 404) return new Error('Ollama model not found. Make sure the model is pulled (ollama pull <model>).');
    if (status === 500) return new Error('Ollama server error. Check that the server is running correctly.');
    return new Error(`Could not connect to Ollama at ${this.baseUrl}. Make sure Ollama is running.`);
  }

  // ── AIProvider interface ────────────────────────────────────────────────────

  async authenticate(): Promise<AuthenticationResult> {
    if (!this.config?.baseUrl) {
      return {
        success: false,
        message: 'Ollama Base URL is missing.',
        providerInfo: { name: 'Ollama' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }

    try {
      const data = await this.getJson<{ models: { name: string }[] }>('/api/tags');
      const models = (data.models ?? []).map((m) => m.name);

      if (models.length === 0) {
        return {
          success: false,
          message: 'Ollama is running but no models are installed. Run: ollama pull llama3.2',
          providerInfo: { name: 'Ollama' },
          models: [],
          defaultModel: '',
          capabilities: {
            chat: false, speech_to_text: false, audio_generation: false,
            realtime: false, vision: false, embeddings: false, function_calling: false,
          },
        };
      }

      const defaultModel =
        models.find((m) => m.startsWith('llama3')) ??
        models.find((m) => m.startsWith('mistral')) ??
        models[0];

      return {
        success: true,
        message: `Ollama connected at ${this.baseUrl}. ${models.length} model(s) installed.`,
        providerInfo: { name: 'Ollama (Local)', version: 'local' },
        models,
        defaultModel,
        capabilities: {
          chat: true,
          speech_to_text: false,
          audio_generation: false,
          realtime: false,
          vision: false,
          embeddings: true,
          function_calling: false,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: msg,
        providerInfo: { name: 'Ollama' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }
  }

  private async generate(messages: { role: string; content: string }[]): Promise<string> {
    // Ollama /api/chat with stream:false returns the full response at once
    const data = await this.postJson<{ message: { content: string } }>('/api/chat', {
      model: this.model,
      messages,
      stream: false,
      options: { temperature: 0.2 },
    });
    return (data.message?.content ?? '').trim();
  }

  private parseLines(raw: string): string[] {
    return raw.split('\n').map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(Boolean);
  }

  async generateSummary(transcript: string): Promise<string> {
    return this.generate([
      { role: 'system', content: 'You are an expert meeting assistant. Be concise and professional.' },
      { role: 'user', content: `Write a concise meeting summary covering main topics, key points, and outcome.\n\nTranscript:\n${transcript}` },
    ]);
  }

  async generateMeetingTitle(transcript: string): Promise<string> {
    const raw = await this.generate([
      { role: 'user', content: `Generate a short meeting title (5 words or fewer). Return only the title.\n\nTranscript:\n${transcript}` },
    ]);
    return raw.replace(/^["']|["']$/g, '').trim();
  }

  async extractActionItems(transcript: string): Promise<string[]> {
    const raw = await this.generate([
      { role: 'user', content: `Extract all action items. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}` },
    ]);
    return this.parseLines(raw);
  }

  async extractDecisions(transcript: string): Promise<string[]> {
    const raw = await this.generate([
      { role: 'user', content: `Extract all decisions made. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}` },
    ]);
    return this.parseLines(raw);
  }

  async extractFollowUps(transcript: string): Promise<string[]> {
    const raw = await this.generate([
      { role: 'user', content: `Extract all follow-up items and next steps. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}` },
    ]);
    return this.parseLines(raw);
  }

  async chat(messages: unknown[]): Promise<string> {
    return this.generate(messages as { role: string; content: string }[]);
  }

  async speechToText(_: unknown): Promise<string> {
    throw new Error('Ollama does not support audio transcription.');
  }
  async transcribeAudio(_: unknown): Promise<string> {
    throw new Error('Ollama does not support audio transcription.');
  }
  async transcribeAudioFile(_: unknown): Promise<string> {
    throw new Error('Ollama does not support audio transcription.');
  }

  // No-op live transcription stubs — recording must NEVER fail because
  // transcription is unavailable. TranscriptionManager checks capabilities
  // first so these are only called defensively.
  async startLiveTranscription(_: LiveTranscriptionOptions): Promise<void> { /* no-op */ }
  async stopLiveTranscription(): Promise<void> { /* no-op */ }
  async transcribeAudioChunk(_: Float32Array): Promise<void> { /* no-op */ }
}
