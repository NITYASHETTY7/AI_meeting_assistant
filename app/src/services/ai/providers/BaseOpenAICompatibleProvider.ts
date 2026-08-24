import type { ProviderConfig, AuthenticationResult, LiveTranscriptionOptions, SpeakerTrack } from '../AIProvider';
import type { AttributedSegment } from '../../audio/AudioSourceAttribution';
import { useAppStore } from '../../../store/useAppStore';

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

  protected async ensureAuthHeader(): Promise<Record<string, string>> {
    const providerName = this.getProviderName();
    let key = this.config?.apiKey || useAppStore.getState().apiKeys[providerName];
    if (!key && window.electronAPI?.loadCredential) {
      try {
        const cred = await window.electronAPI.loadCredential(providerName);
        if (cred.ok && cred.secret) {
          key = cred.secret;
          if (this.config) this.config.apiKey = cred.secret;
          useAppStore.getState().setApiKeyForProvider(providerName, cred.secret);
        }
      } catch { /* ignore */ }
    }
    if (!key) {
      console.error(`[${providerName}] ⚠️ API key is EMPTY — all requests will return 401/404. Go to Settings and save your API key.`);
    }
    return {
      Authorization: `Bearer ${key || ''}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  /** GET a JSON endpoint, returning the parsed body or throwing with a clean message */
  protected async getJson<T>(path: string): Promise<T> {
    const authHeaders = await this.ensureAuthHeader();
    const url = `${this.buildBaseUrl()}${path}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: authHeaders,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw this.parseHttpError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  /** POST JSON, returning the parsed body or throwing with a clean message */
  protected async postJson<T>(path: string, body: unknown): Promise<T> {
    const authHeaders = await this.ensureAuthHeader();
    const url = `${this.buildBaseUrl()}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders,
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
      401: `Invalid or expired API key — ${apiMessage || 'check your credentials.'}`,
      403: `Access denied — ${apiMessage || 'check permissions.'}`,
      404: `Model or endpoint not found — ${apiMessage || 'check your model name or base URL.'}`,
      429: `Rate limit or quota exceeded — ${apiMessage || 'please wait and try again.'}`,
      500: `Provider server error — ${apiMessage || 'try again in a moment.'}`,
      503: `Provider temporarily unavailable — ${apiMessage || 'try again later.'}`,
    };

    const error = new Error(messages[status] || `HTTP ${status}: ${apiMessage || 'Unknown error.'}`);

    // Providers like Groq include the exact wait time in the error message
    // itself (e.g. "Please try again in 9.8475s") rather than a Retry-After
    // header. Parsing it lets callers back off for precisely as long as the
    // provider asked, instead of guessing or failing immediately on a 429
    // that would have succeeded a few seconds later.
    if (status === 429) {
      const retryMatch = apiMessage.match(/try again in\s+([\d.]+)\s*s/i);
      if (retryMatch) {
        (error as Error & { retryAfterMs?: number }).retryAfterMs = Math.ceil(parseFloat(retryMatch[1]) * 1000);
      }
      (error as Error & { isRateLimit?: boolean }).isRateLimit = true;
    }

    return error;
  }

  protected async fetchModelList(): Promise<string[]> {
    try {
      const data = await this.getJson<{ data: { id: string }[] }>('/models');
      const ids = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
      const filtered = this.filterModels(ids);
      if (filtered.length > 0) return filtered;
    } catch (err) {
      console.warn(`[${this.getProviderName()}] Failed to fetch model list from /models:`, err);
    }
    const fallback = this.filterModels([]);
    return fallback.length > 0 ? fallback : ['default-model'];
  }

  protected resolveModel(): string {
    return this.config?.defaultModel || useAppStore.getState().model || '';
  }

  // ── Chat completions ──────────────────────────────────────────────────────

  /** Single-turn chat call returning the assistant's reply text */
  async chat(messages: unknown[]): Promise<string> {
    const candidates = [
      this.resolveModel(),
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
      'gpt-4o',
      'gpt-4o-mini',
    ].filter((m): m is string => !!m && !m.includes('gemma') && !m.includes('mixtral') && !m.includes('qwen'));

    const uniqueCandidates = [...new Set(candidates)];
    let lastError: Error | null = null;

    for (const model of uniqueCandidates) {
      try {
        const data = await this.postJson<{ choices: { message: { content: string } }[] }>(
          '/chat/completions',
          { model, messages, temperature: 0.3 }
        );
        return data.choices?.[0]?.message?.content?.trim() ?? '';
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message.toLowerCase();
        if (
          msg.includes('404') ||
          msg.includes('400') ||
          msg.includes('decommissioned') ||
          msg.includes('deprecated') ||
          msg.includes('does not exist') ||
          msg.includes('access to it') ||
          msg.includes('not found')
        ) {
          console.warn(`[BaseOpenAICompatibleProvider] Model ${model} unavailable/decommissioned, trying fallback candidate...`);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error('No compatible chat model found on this provider.');
  }

  // ── AI extraction helpers (used by all sub-classes) ───────────────────────

  private async extractFromTranscript(transcript: string, instruction: string): Promise<string> {
    const candidates = [
      this.resolveModel(),
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
      'gpt-4o',
      'gpt-4o-mini',
    ].filter((m): m is string => !!m && !m.includes('gemma') && !m.includes('mixtral') && !m.includes('qwen'));

    const uniqueCandidates = [...new Set(candidates)];
    let lastError: Error | null = null;
    const MAX_RATE_LIMIT_RETRIES = 4;

    for (const model of uniqueCandidates) {
      let rateLimitRetries = 0;

      while (true) {
        try {
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
                    'Be concise and structured. Only return the requested output — no preamble. ' +
                    'Do not use any markdown syntax: no **bold**, no _italic_, no ## headers, ' +
                    'no `code` backticks, and no * or + bullet markers. Write plain text only ' +
                    '— use a hyphen "-" for list items if needed, and plain sentences otherwise.',
                },
                { role: 'user', content: `${instruction}\n\nTranscript:\n${transcript}` },
              ],
            }
          );
          return data.choices?.[0]?.message?.content?.trim() ?? '';
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const msg = lastError.message.toLowerCase();

          // Check if error is rate limit (429 or TPM limit message)
          const isRateLimit = (lastError as Error & { isRateLimit?: boolean }).isRateLimit || msg.includes('rate limit') || msg.includes('429');
          if (isRateLimit && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
            let retryAfterMs = (lastError as Error & { retryAfterMs?: number }).retryAfterMs;
            if (!retryAfterMs) {
              const match = msg.match(/try again in\s+([\d.]+)\s*s/i);
              retryAfterMs = match ? Math.ceil(parseFloat(match[1]) * 1000) : (rateLimitRetries + 1) * 3000;
            }
            // Add 1000ms safety buffer
            retryAfterMs += 1000;
            rateLimitRetries++;
            console.warn(
              `[BaseOpenAICompatibleProvider] Rate limited on ${model}, retrying in ${retryAfterMs}ms ` +
              `(attempt ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})...`
            );
            await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
            continue;
          }

          if (
            msg.includes('404') ||
            msg.includes('400') ||
            msg.includes('decommissioned') ||
            msg.includes('deprecated') ||
            msg.includes('does not exist') ||
            msg.includes('access to it') ||
            msg.includes('not found')
          ) {
            console.warn(`[BaseOpenAICompatibleProvider] Model ${model} unavailable/decommissioned, trying fallback candidate...`);
            break;
          }
          throw lastError;
        }
      }
    }
    throw lastError || new Error('Failed to generate extraction from transcript.');
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
      'Extract all action items, tasks, commitments, and next steps from the transcript. ' +
      'If specific owners are not mentioned, list the concrete next steps. Return each item on its own line starting with "- ".'
    );
    return raw
      .split('\n')
      .map((l) => l.replace(/^[-*•]\s*/, '').trim())
      .filter((l) => Boolean(l) && !l.toLowerCase().includes('no action item') && !l.toLowerCase().includes('none identified'));
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

  async transcribeAudioChunk(_chunk: Float32Array, _speakerTrack?: SpeakerTrack, _attribution?: AttributedSegment): Promise<void> {
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
