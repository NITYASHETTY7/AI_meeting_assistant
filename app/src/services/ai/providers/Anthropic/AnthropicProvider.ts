import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
} from '../../AIProvider';

/**
 * Anthropic Provider — Claude Messages API
 *
 * Endpoints:
 *   GET  https://api.anthropic.com/v1/models   → model list
 *   POST https://api.anthropic.com/v1/messages → inference
 *
 * Auth: x-api-key header + anthropic-version header.
 * No audio transcription support.
 */
export class AnthropicProvider implements AIProvider {
  private config?: ProviderConfig;

  private readonly BASE_URL = 'https://api.anthropic.com/v1';
  private readonly ANTHROPIC_VERSION = '2023-06-01';
  private readonly MAX_TOKENS = 4096;

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config?.apiKey ?? '';
  }

  private get model(): string {
    return this.config?.defaultModel ?? 'claude-3-5-haiku-20241022';
  }

  private buildHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': this.ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    };
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.BASE_URL}${path}`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw this.mapError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.BASE_URL}${path}`, {
      method: 'POST',
      headers: this.buildHeaders(),
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
    try { apiMsg = JSON.parse(body)?.error?.message ?? ''; } catch { /**/ }
    if (status === 401) return new Error('Invalid or expired Anthropic API key. Please check your credentials.');
    if (status === 403) return new Error('Access denied. Your account may not have permission for this resource.');
    if (status === 429) return new Error('Anthropic rate limit or quota exceeded. Please wait and try again.');
    if (status === 500 || status === 529) return new Error('Anthropic service temporarily overloaded. Try again later.');
    return new Error(`Anthropic API error ${status}: ${apiMsg || 'Unknown error.'}`);
  }

  // ── Messages helper ─────────────────────────────────────────────────────────

  /**
   * Core inference via /messages. 'system' is a top-level field in the Anthropic API.
   */
  private async sendMessage(
    userContent: string,
    systemPrompt?: string
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.MAX_TOKENS,
      messages: [{ role: 'user', content: userContent }],
    };
    if (systemPrompt) body.system = systemPrompt;

    const data = await this.postJson<{
      content: { type: string; text: string }[];
    }>('/messages', body);

    return data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();
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
        message: 'Anthropic API Key is missing.',
        providerInfo: { name: 'Anthropic' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }

    try {
      const data = await this.getJson<{ data: { id: string }[] }>('/models');
      const models = data.data
        .map((m) => m.id)
        .filter((id) => id.startsWith('claude-'))
        .sort((a, b) => b.localeCompare(a)); // newest first

      const defaultModel =
        models.find((m) => m.includes('haiku')) ??
        models.find((m) => m.includes('sonnet')) ??
        models[0] ?? '';

      return {
        success: true,
        message: `Anthropic Claude authenticated. ${models.length} model(s) available.`,
        providerInfo: { name: 'Anthropic', version: this.ANTHROPIC_VERSION },
        models,
        defaultModel,
        capabilities: {
          chat: true,
          speech_to_text: false,
          audio_generation: false,
          realtime: false,
          vision: true,
          embeddings: false,
          function_calling: true,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: msg,
        providerInfo: { name: 'Anthropic' },
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
    return this.sendMessage(
      `Write a concise professional meeting summary covering the main topics, key points, and outcome.\n\nTranscript:\n${transcript}`,
      this.plainTextSystemPrompt('Provide structured, professional summaries.')
    );
  }

  async generateMeetingTitle(transcript: string): Promise<string> {
    const raw = await this.sendMessage(
      `Generate a short professional meeting title (5 words or fewer). Return only the title.\n\nTranscript:\n${transcript}`,
      this.plainTextSystemPrompt('Return only the title text, nothing else.')
    );
    return raw.replace(/^["']|["']$/g, '').trim();
  }

  async extractActionItems(transcript: string): Promise<string[]> {
    const raw = await this.sendMessage(
      `Extract all action items, tasks, commitments, and next steps from this meeting. If owners are not explicitly mentioned, list the concrete next steps. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`,
      this.plainTextSystemPrompt('Extract structured lists from meeting transcripts.')
    );
    return this.parseLines(raw).filter((l) => !l.toLowerCase().includes('no action item') && !l.toLowerCase().includes('none identified'));
  }

  async extractDecisions(transcript: string): Promise<string[]> {
    const raw = await this.sendMessage(
      `Extract all decisions made in this meeting. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`,
      this.plainTextSystemPrompt('Extract structured lists from meeting transcripts.')
    );
    return this.parseLines(raw);
  }

  async extractFollowUps(transcript: string): Promise<string[]> {
    const raw = await this.sendMessage(
      `Extract all follow-up items, open questions, and next steps. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`,
      this.plainTextSystemPrompt('Extract structured lists from meeting transcripts.')
    );
    return this.parseLines(raw);
  }

  /**
   * Shared plain-text constraint appended to every extraction system prompt.
   * Models frequently emit markdown (**bold**, ## headers) even when told to
   * use "plain text" in isolation — this output is rendered as-is in a plain
   * textarea and copied verbatim into email shares, so it must be explicit
   * and give concrete examples of what NOT to do, not just a vague hint.
   * AIGenerationService also strips any markdown that slips through as a
   * final guarantee, but a stronger prompt reduces how often that's needed.
   */
  private plainTextSystemPrompt(role: string): string {
    return (
      `You are an expert meeting assistant. ${role} ` +
      'Do not use any markdown syntax: no **bold**, no _italic_, no ## headers, ' +
      'no `code` backticks, and no * or + bullet markers. Write plain text only ' +
      '— use a hyphen "-" for list items if needed, and plain sentences otherwise.'
    );
  }

  async chat(messages: unknown[]): Promise<string> {
    type OAIMsg = { role: string; content: string };
    const msgs = messages as OAIMsg[];
    const system = msgs.find((m) => m.role === 'system')?.content;
    const anthropicMessages = msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.MAX_TOKENS,
      messages: anthropicMessages,
    };
    if (system) body.system = system;

    const data = await this.postJson<{
      content: { type: string; text: string }[];
    }>('/messages', body);

    return data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();
  }

  // ── Unsupported audio ───────────────────────────────────────────────────────

  async speechToText(_: unknown): Promise<string> {
    throw new Error('Anthropic does not support audio transcription.');
  }

  async transcribeAudio(_: unknown): Promise<string> {
    throw new Error('Anthropic does not support audio transcription.');
  }

  async transcribeAudioFile(_: unknown): Promise<string> {
    throw new Error('Anthropic does not support audio transcription.');
  }

  // No-op live transcription stubs — recording must NEVER fail because
  // transcription is unavailable. TranscriptionManager checks capabilities
  // first so these are only called defensively.
  async startLiveTranscription(_options: LiveTranscriptionOptions): Promise<void> { /* no-op */ }
  async stopLiveTranscription(): Promise<void> { /* no-op */ }
  async transcribeAudioChunk(_chunk: Float32Array): Promise<void> { /* no-op */ }
}
