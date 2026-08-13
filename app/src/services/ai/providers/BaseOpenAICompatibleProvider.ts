import type { ProviderConfig, AuthenticationResult, LiveTranscriptionOptions } from '../AIProvider';

/**
 * BaseOpenAICompatibleProvider
 *
 * Shared implementation for every provider that speaks the OpenAI REST protocol:
 *   OpenAI · Azure OpenAI · Groq · OpenRouter · Custom OpenAI-Compatible
 *
 * Sub-classes override:
 *   - buildHeaders()      → provider-specific auth headers
 *   - buildBaseUrl()      → endpoint base URL
 *   - getProviderName()   → display name
 *   - validateConfig()    → pre-flight config checks
 *   - getCapabilities()   → which capabilities are supported
 *   - filterModels()      → which model IDs to surface in the UI
 *
 * All HTTP calls use the global `fetch` so they work in the Electron renderer
 * without any Node.js HTTP libraries.
 */
export abstract class BaseOpenAICompatibleProvider {
  protected config?: ProviderConfig;

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  // ── Abstract helpers sub-classes must implement ────────────────────────────

  protected abstract getProviderName(): string;
  protected abstract buildBaseUrl(): string;
  protected abstract buildHeaders(): Record<string, string>;
  /** Return a human-readable error if config is missing required fields, or null if OK */
  protected abstract validateConfig(): string | null;
  protected abstract getCapabilities(): AuthenticationResult['capabilities'];
  /** Sub-classes may filter or sort the raw /models list */
  protected filterModels(ids: string[]): string[] { return ids; }
  /** Which model ID to suggest as the default */
  protected pickDefaultModel(ids: string[]): string { return ids[0] ?? ''; }

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  /** GET a JSON endpoint, returning the parsed body or throwing with a clean message */
  protected async getJson<T>(path: string): Promise<T> {
    const url = `${this.buildBaseUrl()}${path}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw this.parseHttpError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  /** POST JSON, returning the parsed body or throwing with a clean message */
  protected async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.buildBaseUrl()}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw this.parseHttpError(res.status, errBody);
    }
    return res.json() as Promise<T>;
  }

  /** POST multipart/form-data (for audio file uploads) */
  protected async postFormData<T>(path: string, formData: FormData): Promise<T> {
    const url = `${this.buildBaseUrl()}${path}`;
    // Do NOT set Content-Type — browser sets it with boundary automatically
    const headers = { ...this.buildHeaders() };
    const res = await fetch(url, { method: 'POST', headers, body: formData });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw this.parseHttpError(res.status, errBody);
    }
    // Whisper's /audio/transcriptions endpoint returns plain text when
    // response_format is "text" (not JSON) — always read as text first and
    // only JSON-parse when the server actually says it sent JSON. Calling
    // res.json() unconditionally throws "Unexpected token" on every
    // successful transcription and gets misreported as a transcription error.
    const raw = await res.text();
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    }
    return raw as unknown as T;
  }

  private parseHttpError(status: number, body: string): Error {
    // Try to extract the API's own error message
    let apiMessage = '';
    try {
      const parsed = JSON.parse(body);
      apiMessage =
        parsed?.error?.message ||
        parsed?.message ||
        parsed?.error ||
        '';
    } catch {
      apiMessage = body.slice(0, 200);
    }

    const messages: Record<number, string> = {
      400: `Bad request — ${apiMessage || 'check your parameters.'}`,
      401: 'Invalid or expired API key. Please check your credentials.',
      403: 'Access denied. Your account may not have permission for this resource.',
      404: 'Endpoint not found. Check your base URL or deployment name.',
      429: 'Rate limit or quota exceeded. Please wait and try again.',
      500: 'Provider server error. Try again in a moment.',
      503: 'Provider is temporarily unavailable. Try again later.',
    };

    return new Error(messages[status] || `HTTP ${status}: ${apiMessage || 'Unknown error.'}`);
  }

  // ── Standard OpenAI /models list ──────────────────────────────────────────

  protected async fetchModelList(): Promise<string[]> {
    const data = await this.getJson<{ data: { id: string }[] }>('/models');
    const ids = data.data.map((m) => m.id);
    return this.filterModels(ids);
  }

  // ── Chat completions ──────────────────────────────────────────────────────

  /** Single-turn chat call returning the assistant's reply text */
  async chat(messages: unknown[]): Promise<string> {
    const model = this.config?.defaultModel;
    if (!model) throw new Error('No model selected. Please authenticate and choose a model first.');

    const data = await this.postJson<{ choices: { message: { content: string } }[] }>(
      '/chat/completions',
      { model, messages, temperature: 0.3 }
    );
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  // ── AI extraction helpers (used by all sub-classes) ───────────────────────

  private async extractFromTranscript(transcript: string, instruction: string): Promise<string> {
    const model = this.config?.defaultModel;
    if (!model) throw new Error('No model selected.');

    const data = await this.postJson<{ choices: { message: { content: string } }[] }>(
      '/chat/completions',
      {
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are an AI assistant that processes meeting transcripts. ' +
              'Be concise and structured. Only return the requested output — no preamble.',
          },
          { role: 'user', content: `${instruction}\n\nTranscript:\n${transcript}` },
        ],
      }
    );
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  async generateSummary(transcript: string): Promise<string> {
    return this.extractFromTranscript(
      transcript,
      'Write a concise professional meeting summary covering the main topics discussed, ' +
      'key points raised, and the overall outcome. Use plain text paragraphs.'
    );
  }

  async generateMeetingTitle(transcript: string): Promise<string> {
    return this.extractFromTranscript(
      transcript,
      'Generate a short, professional meeting title (5 words or fewer) that describes ' +
      'the meeting topic. Return only the title, nothing else.'
    );
  }

  async extractActionItems(transcript: string): Promise<string[]> {
    const raw = await this.extractFromTranscript(
      transcript,
      'Extract all action items from the transcript. ' +
      'Return each item on its own line starting with "- ". Include the owner if mentioned.'
    );
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  }

  async extractDecisions(transcript: string): Promise<string[]> {
    const raw = await this.extractFromTranscript(
      transcript,
      'Extract all decisions made during the meeting. ' +
      'Return each decision on its own line starting with "- ".'
    );
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  }

  async extractFollowUps(transcript: string): Promise<string[]> {
    const raw = await this.extractFromTranscript(
      transcript,
      'Extract all follow-up items, open questions, and next steps. ' +
      'Return each on its own line starting with "- ".'
    );
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  }

  // ── No-op speech / transcription stubs (overridden by providers that support it) ──

  async speechToText(_audioData: unknown): Promise<string> {
    throw new Error(`${this.getProviderName()} speech-to-text is not supported in this configuration.`);
  }

  async transcribeAudio(_audioFile: unknown): Promise<string> {
    throw new Error(`${this.getProviderName()} does not support audio file transcription.`);
  }

  async transcribeAudioFile(_audioFile: unknown): Promise<string> {
    throw new Error(`${this.getProviderName()} does not support audio file transcription.`);
  }

  // ── Live streaming stubs (STT providers override these with LiveTranscriptionEngine) ──
  // Non-STT providers do NOT generate mock data. They are silent no-ops so that
  // recording continues correctly even when transcription is unavailable.

  async startLiveTranscription(_options: LiveTranscriptionOptions): Promise<void> {
    // Default: no live transcription available for this provider.
    // The TranscriptionManager checks capabilities.speech_to_text before calling this,
    // so this stub is only reached if a provider misconfigures its capabilities.
  }

  async stopLiveTranscription(): Promise<void> {
    // No-op for providers without live transcription
  }

  async transcribeAudioChunk(_chunk: Float32Array): Promise<void> {
    // No-op for providers without live transcription.
    // Chunks are dropped silently so recording is not affected.
  }

  // ── authenticate() — shared implementation ────────────────────────────────

  async authenticate(): Promise<AuthenticationResult> {
    const missing = this.validateConfig();
    if (missing) {
      return this.failResult(missing);
    }

    try {
      const models = await this.fetchModelList();
      if (models.length === 0) {
        return this.failResult('No models returned by the API. Check your account permissions.');
      }

      const defaultModel = this.pickDefaultModel(models);
      const caps = this.getCapabilities();

      return {
        success: true,
        message: `${this.getProviderName()} authenticated. ${models.length} model(s) available.`,
        providerInfo: { name: this.getProviderName(), version: 'v1' },
        models,
        defaultModel,
        capabilities: caps,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.failResult(msg);
    }
  }

  protected failResult(message: string): AuthenticationResult {
    return {
      success: false,
      message,
      providerInfo: { name: this.getProviderName() },
      models: [],
      defaultModel: '',
      capabilities: {
        chat: false, speech_to_text: false, audio_generation: false,
        realtime: false, vision: false, embeddings: false, function_calling: false,
      },
    };
  }
}
