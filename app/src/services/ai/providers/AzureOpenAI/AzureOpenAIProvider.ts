import type { AuthenticationResult } from '../../AIProvider';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';

/**
 * Azure OpenAI Provider — Azure-hosted OpenAI deployments
 *
 * Endpoints (deployment-scoped):
 *   GET  {endpoint}/openai/deployments?api-version={ver}
 *   POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={ver}
 *   POST {endpoint}/openai/deployments/{deployment}/audio/transcriptions?api-version={ver}
 *
 * Auth: api-key header.
 * The user configures: endpoint URL, deployment name, api-version.
 *
 * NOTE: Azure exposes a flat deployment list, not /models.
 * We override authenticate() to call the deployments list endpoint and override
 * the chat/summary methods to insert the correct deployment path.
 */
export class AzureOpenAIProvider extends BaseOpenAICompatibleProvider {
  protected getProviderName() { return 'Azure OpenAI'; }

  protected buildBaseUrl(): string {
    // Base URL includes the endpoint and the OpenAI path prefix
    const endpoint = (this.config?.azureEndpoint ?? '').replace(/\/$/, '');
    return `${endpoint}/openai/deployments/${this.config?.azureDeploymentName ?? 'gpt-4o'}`;
  }

  protected buildHeaders(): Record<string, string> {
    return {
      'api-key': this.config?.apiKey ?? '',
    };
  }

  protected validateConfig(): string | null {
    if (!this.config?.azureEndpoint) return 'Azure Endpoint URL is missing.';
    if (!this.config?.apiKey) return 'Azure API Key is missing.';
    if (!this.config?.azureDeploymentName) return 'Azure Deployment Name is missing.';
    if (!this.config?.azureApiVersion) return 'Azure API Version is missing.';
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

  private get apiVersion(): string {
    return this.config?.azureApiVersion ?? '2024-02-15-preview';
  }

  private get deploymentName(): string {
    return this.config?.azureDeploymentName ?? '';
  }

  /** Azure uses ?api-version= query param on every request */
  private appendVersion(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}api-version=${this.apiVersion}`;
  }

  /**
   * Override authenticate() — Azure doesn't have a /models endpoint.
   * We probe the deployment's chat/completions endpoint with a tiny request.
   */
  override async authenticate(): Promise<AuthenticationResult> {
    const missing = this.validateConfig();
    if (missing) return this.failResult(missing);

    try {
      // Probe: minimal chat completions call to verify connectivity
      const endpoint = this.buildBaseUrl();
      const url = `${endpoint}/chat/completions${this.appendVersion('?')}`;

      const res = await fetch(url.replace('?api-version', `?api-version`), {
        method: 'POST',
        headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });

      // 401 = bad key, 404 = bad deployment/endpoint, 200 = success
      if (!res.ok && res.status === 401) throw new Error('Invalid or expired Azure API key.');
      if (!res.ok && res.status === 404) throw new Error('Azure deployment or endpoint not found. Check your configuration.');
      if (!res.ok) {
        const b = await res.text().catch(() => '');
        let msg = '';
        try { msg = JSON.parse(b)?.error?.message ?? ''; } catch { /**/ }
        throw new Error(`Azure error ${res.status}: ${msg || 'Connection test failed.'}`);
      }

      // Surface the configured deployment as the single "model"
      const deploymentId = this.deploymentName;
      return {
        success: true,
        message: `Azure OpenAI deployment "${deploymentId}" verified.`,
        providerInfo: { name: 'Azure OpenAI', version: this.apiVersion },
        models: [deploymentId],
        defaultModel: deploymentId,
        capabilities: this.getCapabilities(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.failResult(msg);
    }
  }

  /**
   * Azure chat/completions path includes the deployment and api-version.
   * Override the base class postJson path construction.
   */
  private async azurePost<T>(path: string, body: unknown): Promise<T> {
    const versionedPath = path.includes('?')
      ? `${path}&api-version=${this.apiVersion}`
      : `${path}?api-version=${this.apiVersion}`;

    const url = `${this.buildBaseUrl()}${versionedPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      let apiMsg = '';
      try { apiMsg = JSON.parse(errBody)?.error?.message ?? ''; } catch { /**/ }
      if (res.status === 401) throw new Error('Invalid or expired Azure API key.');
      if (res.status === 404) throw new Error('Azure deployment or endpoint not found.');
      if (res.status === 429) throw new Error('Azure rate limit exceeded. Please wait and try again.');
      throw new Error(`Azure error ${res.status}: ${apiMsg || 'Request failed.'}`);
    }
    return res.json() as Promise<T>;
  }

  /** Override chat to use the Azure-versioned endpoint */
  override async chat(messages: unknown[]): Promise<string> {
    const data = await this.azurePost<{ choices: { message: { content: string } }[] }>(
      '/chat/completions',
      { messages, temperature: 0.3 }
    );
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  /** Override each generation method to use azurePost */
  private async azureExtract(transcript: string, instruction: string): Promise<string> {
    const data = await this.azurePost<{ choices: { message: { content: string } }[] }>(
      '/chat/completions',
      {
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'You are an expert meeting assistant. Be concise and structured.' },
          { role: 'user', content: `${instruction}\n\nTranscript:\n${transcript}` },
        ],
      }
    );
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  override async generateSummary(transcript: string): Promise<string> {
    return this.azureExtract(transcript, 'Write a concise professional meeting summary covering main topics, key points, and outcome.');
  }

  override async generateMeetingTitle(transcript: string): Promise<string> {
    const raw = await this.azureExtract(transcript, 'Generate a short professional meeting title (5 words or fewer). Return only the title.');
    return raw.replace(/^["']|["']$/g, '').trim();
  }

  override async extractActionItems(transcript: string): Promise<string[]> {
    const raw = await this.azureExtract(transcript, 'Extract all action items. List each on its own line starting with "- ".');
    return raw.split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  }

  override async extractDecisions(transcript: string): Promise<string[]> {
    const raw = await this.azureExtract(transcript, 'Extract all decisions made. List each on its own line starting with "- ".');
    return raw.split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  }

  override async extractFollowUps(transcript: string): Promise<string[]> {
    const raw = await this.azureExtract(transcript, 'Extract all follow-ups and next steps. List each on its own line starting with "- ".');
    return raw.split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  }

  /** Azure Whisper via deployment endpoint */
  override async transcribeAudio(audioFile: unknown): Promise<string> {
    if (!(audioFile instanceof Blob)) throw new Error('Azure transcription requires a Blob or File.');

    const form = new FormData();
    form.append('file', audioFile, 'audio.wav');
    form.append('response_format', 'text');

    const url = `${this.buildBaseUrl()}/audio/transcriptions?api-version=${this.apiVersion}`;
    const headers = { ...this.buildHeaders() }; // No Content-Type for multipart
    const res = await fetch(url, { method: 'POST', headers, body: form });
    if (!res.ok) throw new Error(`Azure transcription failed: HTTP ${res.status}`);
    const data = await res.json() as string | { text: string };
    return typeof data === 'string' ? data.trim() : (data as { text: string }).text.trim();
  }

  override async transcribeAudioFile(audioFile: unknown): Promise<string> {
    return this.transcribeAudio(audioFile);
  }

  override async speechToText(audioData: unknown): Promise<string> {
    return this.transcribeAudio(audioData);
  }

  // fetchModelList not used for Azure (overrides authenticate())
  protected filterModels(ids: string[]): string[] { return ids; }
}
