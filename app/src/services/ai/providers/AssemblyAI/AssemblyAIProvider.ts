import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
} from '../../AIProvider';

/**
 * AssemblyAI Provider — Audio Intelligence Platform
 *
 * Endpoints:
 *   POST https://api.assemblyai.com/v2/transcript            → submit transcription job
 *   GET  https://api.assemblyai.com/v2/transcript/{id}       → poll for completion
 *   POST https://api.assemblyai.com/lemur/v3/task            → LeMUR text analysis
 *
 * Auth: Authorization header (no "Bearer" prefix).
 *
 * AssemblyAI is a speech-first platform. It does not offer a conversational LLM.
 * Text extraction (summary, action items, etc.) uses LeMUR over the transcript.
 * The "model" in our context is the AssemblyAI speech model (best/nano/conformer-en).
 *
 * Because AssemblyAI requires a publicly accessible audio URL for file transcription
 * (it cannot receive raw binary in the standard API), we use the upload endpoint
 * when given a Blob, then submit for transcription.
 */
export class AssemblyAIProvider implements AIProvider {
  private config?: ProviderConfig;

  private readonly BASE_URL = 'https://api.assemblyai.com';
  private readonly MODELS = ['best', 'nano'];
  private lastTranscriptId: string | null = null;

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config?.apiKey ?? '';
  }

  private get speechModel(): string {
    return this.config?.defaultModel ?? 'best';
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: this.apiKey,
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
    let msg = '';
    try { msg = JSON.parse(body)?.error ?? ''; } catch { /**/ }
    if (status === 401 || status === 403) return new Error('Invalid AssemblyAI API key. Please check your credentials.');
    if (status === 429) return new Error('AssemblyAI quota exceeded. Please wait and try again.');
    if (status === 500) return new Error('AssemblyAI service error. Try again later.');
    return new Error(`AssemblyAI error ${status}: ${msg || 'Unknown error.'}`);
  }

  // ── Transcription helpers ───────────────────────────────────────────────────

  /**
   * Upload a raw audio Blob to AssemblyAI's upload endpoint.
   * Returns the upload URL that can then be submitted for transcription.
   */
  private async uploadAudio(audioBlob: Blob): Promise<string> {
    const res = await fetch(`${this.BASE_URL}/v2/upload`, {
      method: 'POST',
      headers: { Authorization: this.apiKey, 'Content-Type': 'application/octet-stream' },
      body: audioBlob,
    });
    if (!res.ok) throw new Error(`AssemblyAI upload failed: HTTP ${res.status}`);
    const data = await res.json() as { upload_url: string };
    return data.upload_url;
  }

  /** A single diarized speech segment returned by AssemblyAI when speaker_labels is enabled. */
  private lastUtterances: { speaker: string; text: string; start: number; end: number }[] = [];

  /** Submit a transcription job and poll until complete. Returns transcript text + speaker-labeled utterances. */
  private async transcribeUrl(audioUrl: string): Promise<{ id: string; text: string }> {
    // Submit — speaker_labels: true enables real speaker diarization via
    // AssemblyAI's native support. The response then contains an
    // `utterances` array (each with speaker "A"/"B"/etc, text, start, end)
    // instead of only a flat `text` blob.
    const submit = await this.postJson<{ id: string; status: string }>('/v2/transcript', {
      audio_url: audioUrl,
      speech_model: this.speechModel,
      speaker_labels: true,
    });

    const id = submit.id;
    this.lastTranscriptId = id;

    // Poll with exponential backoff (max ~60s total)
    let delay = 2000;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 8000);

      const poll = await this.getJson<{
        id: string;
        status: string;
        text?: string;
        error?: string;
        utterances?: { speaker: string; text: string; start: number; end: number }[];
      }>(`/v2/transcript/${id}`);

      if (poll.status === 'completed') {
        this.lastUtterances = poll.utterances ?? [];
        return { id, text: poll.text ?? '' };
      }
      if (poll.status === 'error') throw new Error(`AssemblyAI transcription error: ${poll.error ?? 'Unknown.'}`);
    }

    throw new Error('AssemblyAI transcription timed out. Try again with a shorter audio clip.');
  }

  /**
   * Returns the speaker-labeled utterances from the most recently completed
   * transcription. Empty if diarization returned no utterances (e.g. a
   * single speaker with too little speech to diarize, per AssemblyAI's
   * documented minimum of ~30s continuous speech per speaker for reliable
   * separation) — callers should fall back to the flat transcript text.
   */
  getLastUtterances(): { speaker: string; text: string; start: number; end: number }[] {
    return this.lastUtterances;
  }

  // ── LeMUR ───────────────────────────────────────────────────────────────────

  /**
   * Run a LeMUR task against a previously completed transcript.
   * Falls back to working directly with the transcript text if no transcript ID.
   */
  private async lemur(transcriptId: string, prompt: string): Promise<string> {
    const data = await this.postJson<{ response: string }>('/lemur/v3/task', {
      transcript_ids: [transcriptId],
      prompt,
      final_model: 'anthropic/claude-3-5-haiku',
    });
    return (data.response ?? '').trim();
  }

  private parseLines(raw: string): string[] {
    return raw.split('\n').map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(Boolean);
  }

  // ── AIProvider interface ────────────────────────────────────────────────────

  async authenticate(): Promise<AuthenticationResult> {
    if (!this.apiKey) {
      return {
        success: false,
        message: 'AssemblyAI API Key is missing.',
        providerInfo: { name: 'AssemblyAI' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }

    try {
      // Simple auth check: list recent transcripts (lightweight endpoint)
      await this.getJson<unknown>('/v2/transcript?limit=1');
      return {
        success: true,
        message: 'AssemblyAI API key verified. Speech models available.',
        providerInfo: { name: 'AssemblyAI Audio Intelligence', version: 'v2' },
        models: this.MODELS,
        defaultModel: 'best',
        capabilities: {
          chat: false,
          speech_to_text: true,
          audio_generation: false,
          realtime: true,
          vision: false,
          embeddings: false,
          function_calling: false,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: msg,
        providerInfo: { name: 'AssemblyAI' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }
  }

  async transcribeAudio(audioFile: unknown): Promise<string> {
    if (!(audioFile instanceof Blob)) {
      throw new Error('AssemblyAI transcription requires a Blob or File object.');
    }
    const uploadUrl = await this.uploadAudio(audioFile);
    const result = await this.transcribeUrl(uploadUrl);
    return result.text;
  }

  async transcribeAudioFile(audioFile: unknown): Promise<string> {
    return this.transcribeAudio(audioFile);
  }

  async speechToText(audioData: unknown): Promise<string> {
    return this.transcribeAudio(audioData);
  }

  /**
   * For LeMUR-based generation, we need a transcript ID.
   * If we have one from a recent transcription, use it.
   * Otherwise, treat the input as plain text and do a simple summarisation stub.
   */
  async generateSummary(transcript: string): Promise<string> {
    if (this.lastTranscriptId) {
      return this.lemur(this.lastTranscriptId, 'Write a concise professional meeting summary.');
    }
    // No transcript ID: return the raw transcript as the summary (AssemblyAI is STT-first)
    return `[AssemblyAI] Transcript:\n${transcript}`;
  }

  async generateMeetingTitle(_transcript: string): Promise<string> {
    if (this.lastTranscriptId) {
      const raw = await this.lemur(
        this.lastTranscriptId,
        'Generate a short meeting title (5 words or fewer). Return only the title.'
      );
      return raw.replace(/^["']|["']$/g, '').trim();
    }
    return 'Meeting Transcript';
  }

  async extractActionItems(_transcript: string): Promise<string[]> {
    if (this.lastTranscriptId) {
      const raw = await this.lemur(
        this.lastTranscriptId,
        'Extract all action items. List each on its own line starting with "- ".'
      );
      return this.parseLines(raw);
    }
    return [];
  }

  async extractDecisions(_transcript: string): Promise<string[]> {
    if (this.lastTranscriptId) {
      const raw = await this.lemur(
        this.lastTranscriptId,
        'Extract all decisions made. List each on its own line starting with "- ".'
      );
      return this.parseLines(raw);
    }
    return [];
  }

  async extractFollowUps(_transcript: string): Promise<string[]> {
    if (this.lastTranscriptId) {
      const raw = await this.lemur(
        this.lastTranscriptId,
        'Extract all follow-up items and next steps. List each on its own line starting with "- ".'
      );
      return this.parseLines(raw);
    }
    return [];
  }

  async chat(_messages: unknown[]): Promise<string> {
    throw new Error('AssemblyAI does not support conversational chat. It is a speech-to-text platform.');
  }

  // ── Live streaming ──────────────────────────────────────────────────────────
  // AssemblyAI real-time streaming (wss://api.assemblyai.com/v2/realtime/ws)
  // requires a Node.js WebSocket which is not available in the renderer process.
  // capabilities.speech_to_text is true so the user can transcribe after recording
  // via transcribeAudio() using the upload + poll workflow.
  async startLiveTranscription(_options: LiveTranscriptionOptions): Promise<void> {
    // No live transcription in renderer context — use post-recording file upload instead
  }

  async stopLiveTranscription(): Promise<void> { /**/ }

  async transcribeAudioChunk(_chunk: Float32Array): Promise<void> {
    // No-op — chunks are not forwarded to AssemblyAI in live mode
  }
}
