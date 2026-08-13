import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
} from '../../AIProvider';

/**
 * AWS Bedrock Provider
 *
 * Endpoints:
 *   GET  https://bedrock.{region}.amazonaws.com/foundation-models  → model list
 *   POST https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke → inference
 *
 * Auth: AWS SigV4 signature (HMAC-SHA256), computed in the browser using SubtleCrypto.
 * No audio transcription support via Bedrock (Transcribe is a separate service).
 *
 * Supported model families: Claude (Anthropic), Llama (Meta), Titan (Amazon).
 */

// ── SigV4 helpers ─────────────────────────────────────────────────────────────

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuffer = key instanceof Uint8Array ? key.buffer as ArrayBuffer : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface SigV4Params {
  method: string;
  url: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  body: string;
  contentType: string;
}

async function sigV4Headers(p: SigV4Params): Promise<Record<string, string>> {
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzdate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const urlObj = new URL(p.url);
  const host = urlObj.host;
  const canonicalUri = urlObj.pathname;
  const canonicalQuerystring = urlObj.search.slice(1);

  const payloadHash = await sha256Hex(p.body);

  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalHeaders =
    `content-type:${p.contentType}\n` +
    `host:${host}\n` +
    `x-amz-date:${amzdate}\n`;

  const canonicalRequest = [
    p.method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${datestamp}/${p.region}/${p.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzdate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // Derive signing key
  const kDate = await hmacSha256(
    new TextEncoder().encode(`AWS4${p.secretKey}`),
    datestamp
  );
  const kRegion = await hmacSha256(kDate, p.region);
  const kService = await hmacSha256(kRegion, p.service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = bufToHex(await hmacSha256(kSigning, stringToSign));

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${p.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Content-Type': p.contentType,
    'x-amz-date': amzdate,
    Authorization: authorizationHeader,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class AWSBedrockProvider implements AIProvider {
  private config?: ProviderConfig;

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  private get region(): string { return this.config?.awsRegion ?? 'us-east-1'; }
  private get accessKey(): string { return this.config?.awsAccessKeyId ?? ''; }
  private get secretKey(): string { return this.config?.awsSecretAccessKey ?? ''; }
  private get modelId(): string { return this.config?.defaultModel ?? 'anthropic.claude-3-haiku-20240307-v1:0'; }

  // ── Signed fetch ────────────────────────────────────────────────────────────

  private async signedPost<T>(service: string, path: string, payload: unknown): Promise<T> {
    const body = JSON.stringify(payload);
    const url = `https://${service}.${this.region}.amazonaws.com${path}`;
    const headers = await sigV4Headers({
      method: 'POST',
      url,
      region: this.region,
      service: service.replace(`-runtime`, '').replace('bedrock', 'bedrock'),
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      body,
      contentType: 'application/json',
    });

    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      let apiMsg = '';
      try { apiMsg = JSON.parse(errBody)?.message ?? errBody; } catch { /**/ }
      if (res.status === 403) throw new Error('Invalid AWS credentials or insufficient Bedrock permissions.');
      if (res.status === 429) throw new Error('AWS Bedrock throttling limit reached. Try again later.');
      if (res.status === 404) throw new Error('AWS Bedrock model not found. Check your model ID and region.');
      throw new Error(`AWS Bedrock error ${res.status}: ${apiMsg.slice(0, 200) || 'Request failed.'}`);
    }
    return res.json() as Promise<T>;
  }

  private async signedGet<T>(service: string, path: string): Promise<T> {
    const url = `https://${service}.${this.region}.amazonaws.com${path}`;
    const headers = await sigV4Headers({
      method: 'GET',
      url,
      region: this.region,
      service: 'bedrock',
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      body: '',
      contentType: 'application/json',
    });

    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Invalid AWS credentials or insufficient Bedrock permissions.');
      throw new Error(`AWS Bedrock error ${res.status}: Request failed.`);
    }
    return res.json() as Promise<T>;
  }

  // ── InvokeModel — Claude (Anthropic on Bedrock) ────────────────────────────

  /**
   * Bedrock wraps each foundation model with its own request/response schema.
   * We support Anthropic Claude (most common) and Titan/Llama as fallback.
   */
  private async invokeClaude(prompt: string, system?: string): Promise<string> {
    const messages = [{ role: 'user', content: prompt }];
    const payload: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages,
    };
    if (system) payload.system = system;

    const data = await this.signedPost<{
      content: { type: string; text: string }[];
    }>('bedrock-runtime', `/model/${this.modelId}/invoke`, payload);

    return data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim();
  }

  private async invokeModel(prompt: string, system?: string): Promise<string> {
    const id = this.modelId.toLowerCase();

    if (id.includes('claude')) {
      return this.invokeClaude(prompt, system);
    }

    if (id.includes('llama')) {
      // Llama 3 Instruct format
      const fullPrompt = system
        ? `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${system}<|eot_id|>\n<|start_header_id|>user<|end_header_id|>\n${prompt}<|eot_id|>\n<|start_header_id|>assistant<|end_header_id|>\n`
        : `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n${prompt}<|eot_id|>\n<|start_header_id|>assistant<|end_header_id|>\n`;

      const data = await this.signedPost<{ generation: string }>(
        'bedrock-runtime',
        `/model/${this.modelId}/invoke`,
        { prompt: fullPrompt, max_gen_len: 2048, temperature: 0.2 }
      );
      return (data.generation ?? '').trim();
    }

    // Amazon Titan fallback
    const data = await this.signedPost<{
      results: { outputText: string }[];
    }>('bedrock-runtime', `/model/${this.modelId}/invoke`, {
      inputText: system ? `${system}\n\n${prompt}` : prompt,
      textGenerationConfig: { maxTokenCount: 2048, temperature: 0.2 },
    });
    return (data.results?.[0]?.outputText ?? '').trim();
  }

  private parseLines(raw: string): string[] {
    return raw.split('\n').map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(Boolean);
  }

  // ── AIProvider interface ────────────────────────────────────────────────────

  async authenticate(): Promise<AuthenticationResult> {
    if (!this.accessKey) return this.fail('AWS Access Key ID is missing.');
    if (!this.secretKey) return this.fail('AWS Secret Access Key is missing.');
    if (!this.region) return this.fail('AWS Region is missing.');

    try {
      // List foundation models to verify credentials
      const data = await this.signedGet<{
        modelSummaries: { modelId: string; modelName: string; providerName: string }[];
      }>('bedrock', '/foundation-models');

      const preferredProviders = ['Anthropic', 'Meta', 'Amazon'];
      const models = (data.modelSummaries ?? [])
        .filter((m) => preferredProviders.includes(m.providerName) &&
          m.modelId.toLowerCase().includes(m.providerName.toLowerCase().slice(0, 4)))
        .map((m) => m.modelId);

      const defaultModel =
        models.find((id) => id.includes('claude-3-haiku')) ??
        models.find((id) => id.includes('claude')) ??
        models[0] ?? '';

      return {
        success: true,
        message: `AWS Bedrock connected in ${this.region}. ${models.length} foundation model(s) available.`,
        providerInfo: { name: 'AWS Bedrock', version: 'v1' },
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
      return this.fail(msg);
    }
  }

  private fail(message: string): AuthenticationResult {
    return {
      success: false,
      message,
      providerInfo: { name: 'AWS Bedrock' },
      models: [],
      defaultModel: '',
      capabilities: {
        chat: false, speech_to_text: false, audio_generation: false,
        realtime: false, vision: false, embeddings: false, function_calling: false,
      },
    };
  }

  async generateSummary(transcript: string): Promise<string> {
    return this.invokeModel(
      `Write a concise professional meeting summary for this transcript:\n\n${transcript}`,
      'You are an expert meeting assistant. Be concise and structured.'
    );
  }

  async generateMeetingTitle(transcript: string): Promise<string> {
    const raw = await this.invokeModel(
      `Generate a short meeting title (5 words or fewer). Return only the title.\n\nTranscript:\n${transcript}`
    );
    return raw.replace(/^["']|["']$/g, '').trim();
  }

  async extractActionItems(transcript: string): Promise<string[]> {
    const raw = await this.invokeModel(
      `Extract all action items. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw);
  }

  async extractDecisions(transcript: string): Promise<string[]> {
    const raw = await this.invokeModel(
      `Extract all decisions made. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw);
  }

  async extractFollowUps(transcript: string): Promise<string[]> {
    const raw = await this.invokeModel(
      `Extract all follow-up items and next steps. List each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw);
  }

  async chat(messages: unknown[]): Promise<string> {
    type Msg = { role: string; content: string };
    const msgs = messages as Msg[];
    const system = msgs.find((m) => m.role === 'system')?.content;
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
    return this.invokeModel(lastUser, system);
  }

  // ── Unsupported audio ───────────────────────────────────────────────────────
  async speechToText(_: unknown): Promise<string> {
    throw new Error('AWS Bedrock does not support audio transcription.');
  }
  async transcribeAudio(_: unknown): Promise<string> {
    throw new Error('AWS Bedrock does not support audio transcription.');
  }
  async transcribeAudioFile(_: unknown): Promise<string> {
    throw new Error('AWS Bedrock does not support audio transcription.');
  }

  // No-op live transcription stubs — recording must NEVER fail because
  // transcription is unavailable. TranscriptionManager checks capabilities
  // first so these are only called defensively.
  async startLiveTranscription(_: LiveTranscriptionOptions): Promise<void> { /* no-op */ }
  async stopLiveTranscription(): Promise<void> { /* no-op */ }
  async transcribeAudioChunk(_: Float32Array): Promise<void> { /* no-op */ }
}
