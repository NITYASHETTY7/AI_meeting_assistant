import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
} from '../../AIProvider';

/**
 * Gemini Provider — Google Generative Language API (v1beta)
 *
 * Endpoints:
 *   GET  https://generativelanguage.googleapis.com/v1beta/models?key={key}
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
 *
 * Auth: API key as query parameter (not a header).
 * No audio transcription support.
 */
export class GeminiProvider implements AIProvider {
  private config?: ProviderConfig;

  private readonly BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config?.apiKey ?? '';
  }

  private get model(): string {
    return this.config?.defaultModel ?? 'gemini-2.0-flash';
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.BASE_URL}${path}?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw this.mapError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.BASE_URL}${path}?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw this.mapError(res.status, errBody);
    }
    return res.json() as Promise<T>;
  }

  private mapError(status: number, body: string): Error {
    let apiMsg = '';
    try {
      apiMsg = JSON.parse(body)?.error?.message ?? '';
    } catch { /**/ }

    if (status === 400) return new Error(`Bad request — ${apiMsg || 'check your parameters.'}`);
    if (status === 401 || status === 403) return new Error('Invalid or expired Gemini API key. Please check your credentials.');
    if (status === 429) return new Error('Gemini quota exceeded. Please wait and try again.');
    if (status === 500 || status === 503) return new Error('Google AI service temporarily unavailable. Try again later.');
    return new Error(`Gemini API error ${status}: ${apiMsg || 'Unknown error.'}`);
  }

  // ── Model list ──────────────────────────────────────────────────────────────

  private async fetchModels(): Promise<string[]> {
    const data = await this.getJson<{ models: { name: string; supportedGenerationMethods?: string[] }[] }>('/models');
    return data.models
      .filter((m) => {
        const name = m.name.replace('models/', '');
        return (
          name.startsWith('gemini-') &&
          (m.supportedGenerationMethods?.includes('generateContent') ?? true)
        );
      })
      .map((m) => m.name.replace('models/', ''));
  }

  // ── generateContent helper ──────────────────────────────────────────────────

  private async generate(
    userPrompt: string,
    systemInstruction?: string,
  ): Promise<string> {
    type Content = { role: string; parts: { text: string }[] };
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] } as Content],
      generationConfig: { temperature: 0.2 },
    };
    if (systemInstruction) {
      body.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const data = await this.postJson<{
      candidates: { content: { parts: { text: string }[] } }[];
    }>(`/models/${this.model}:generateContent`, body);

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  }

  private parseLines(raw: string): string[] {
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
      .filter(Boolean);
  }

  // ── AIProvider interface ────────────────────────────────────────────────────

  async authenticate(): Promise<AuthenticationResult> {
    if (!this.apiKey) {
      return {
        success: false,
        message: 'Gemini API Key is missing.',
        providerInfo: { name: 'Gemini' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }

    try {
      const models = await this.fetchModels();
      if (models.length === 0) {
        return {
          success: false,
          message: 'No Gemini models returned. Check your API key permissions.',
          providerInfo: { name: 'Gemini' },
          models: [],
          defaultModel: '',
          capabilities: {
            chat: false, speech_to_text: false, audio_generation: false,
            realtime: false, vision: false, embeddings: false, function_calling: false,
          },
        };
      }

      const defaultModel =
        models.find((m) => m.includes('gemini-2.0-flash')) ??
        models.find((m) => m.includes('gemini-1.5-flash')) ??
        models[0];

      return {
        success: true,
        message: `Google Gemini authenticated. ${models.length} model(s) available.`,
        providerInfo: { name: 'Google Gemini', version: 'v1beta' },
        models,
        defaultModel,
        capabilities: {
          chat: true,
          speech_to_text: false,
          audio_generation: false,
          realtime: false,
          vision: true,
          embeddings: true,
          function_calling: true,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: msg,
        providerInfo: { name: 'Gemini' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }
  }

  async generateSummary(transcript: string): Promise<string> {
    return this.generate(
      `Write a concise professional meeting summary covering main topics, key points, and outcomes.\n\nTranscript:\n${transcript}`,
      'You are an expert meeting assistant. Provide structured, professional summaries.'
    );
  }

  async generateMeetingTitle(transcript: string): Promise<string> {
    const raw = await this.generate(
      `Generate a short professional meeting title (5 words or fewer) for this transcript.\nReturn only the title.\n\nTranscript:\n${transcript}`
    );
    return raw.replace(/^["']|["']$/g, '').trim();
  }

  async extractActionItems(transcript: string): Promise<string[]> {
    const raw = await this.generate(
      `Extract all action items from this meeting transcript. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw);
  }

  async extractDecisions(transcript: string): Promise<string[]> {
    const raw = await this.generate(
      `Extract all decisions made in this meeting. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw);
  }

  async extractFollowUps(transcript: string): Promise<string[]> {
    const raw = await this.generate(
      `Extract all follow-up items, open questions, and next steps. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw);
  }

  async chat(messages: unknown[]): Promise<string> {
    // Convert OpenAI-style messages to Gemini contents format
    type OAIMsg = { role: string; content: string };
    const msgs = messages as OAIMsg[];

    const systemMsg = msgs.find((m) => m.role === 'system')?.content;
    const contents = msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Gemini requires the last turn to be 'user'
    if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
      contents.push({ role: 'user', parts: [{ text: 'Continue.' }] });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.3 },
    };
    if (systemMsg) {
      body.system_instruction = { parts: [{ text: systemMsg }] };
    }

    const data = await this.postJson<{
      candidates: { content: { parts: { text: string }[] } }[];
    }>(`/models/${this.model}:generateContent`, body);

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  }

  // ── Unsupported audio ───────────────────────────────────────────────────────

  async speechToText(_audioData: unknown): Promise<string> {
    throw new Error('Audio transcription is not supported by the Gemini provider.');
  }

  async transcribeAudio(_audioFile: unknown): Promise<string> {
    throw new Error('Audio transcription is not supported by the Gemini provider.');
  }

  async transcribeAudioFile(_audioFile: unknown): Promise<string> {
    throw new Error('Audio transcription is not supported by the Gemini provider.');
  }

  // ── Live streaming (Gemini does not support live batch STT in this config) ──
  async startLiveTranscription(_options: LiveTranscriptionOptions): Promise<void> {
    // Gemini does not support live speech-to-text in this configuration.
    // Recording continues — TranscriptionManager checks capabilities first.
  }

  async stopLiveTranscription(): Promise<void> { /**/ }

  async transcribeAudioChunk(_chunk: Float32Array): Promise<void> {
    // No-op — chunks are dropped silently
  }
}
