import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
  DiarizedUtterance,
} from '../../AIProvider';

/**
 * Deepgram Provider — speech-to-text specialist, used two ways in this app:
 *
 *  1. As a selectable provider in Settings (like AssemblyAI) — BYO Deepgram
 *     key, transcription-only (no chat/summary — Deepgram has no LLM).
 *
 *  2. As an automatic FALLBACK for live transcription batches when the
 *     active provider's Whisper call fails (401, rate limit, network error,
 *     etc). See TranscriptionManager's fallback wiring — this lets a
 *     transient OpenAI/Groq failure recover via Deepgram instead of losing
 *     that batch's audio and showing a bare "Transcript error".
 *
 * Endpoint: POST https://api.deepgram.com/v1/listen
 * Auth: `Authorization: Token <key>` (not "Bearer")
 * Diarization: `diarize=true&punctuate=true&utterances=true` query params
 *   return `results.utterances[]`, each with speaker/transcript/start/end —
 *   confirmed against Deepgram's own documentation.
 */
export class DeepgramProvider implements AIProvider {
  private config?: ProviderConfig;
  private readonly BASE_URL = 'https://api.deepgram.com/v1/listen';
  private readonly MODELS = ['nova-3', 'nova-2', 'base'];
  private lastUtterances: DiarizedUtterance[] = [];

  initialize(config: ProviderConfig): void {
    this.config = config;
  }

  private get apiKey(): string {
    // Defensive trim: a key with a stray leading/trailing newline or space
    // (e.g. from clipboard paste, or loaded from a pre-trim-fix saved value)
    // makes the Authorization header value invalid, which causes fetch() to
    // throw "TypeError: Failed to fetch" BEFORE the request is even sent —
    // indistinguishable from a network error, and easy to misread as "my
    // key must be wrong" when the key content itself is actually correct.
    return (this.config?.apiKey ?? '').trim();
  }

  private get model(): string {
    return this.config?.defaultModel ?? 'nova-3';
  }

  private mapError(status: number, body: string): Error {
    let msg = '';
    try { msg = JSON.parse(body)?.err_msg ?? ''; } catch { /**/ }
    if (status === 401 || status === 403) return new Error('Invalid Deepgram API key. Please check your credentials.');
    if (status === 429) return new Error('Deepgram quota exceeded. Please wait and try again.');
    if (status >= 500) return new Error('Deepgram service error. Try again later.');
    return new Error(`Deepgram error ${status}: ${msg || 'Unknown error.'}`);
  }

  /**
   * Core transcription call — sends a WAV Blob and returns the flat
   * transcript text. Also populates lastUtterances with speaker-labeled
   * segments when diarization succeeds (getLastUtterances()).
   *
   * Public (not private) so TranscriptionManager can call it directly as a
   * fallback path without swapping the entire active provider.
   */
  async transcribeBlob(audioBlob: Blob): Promise<string> {
    if (!this.apiKey) throw new Error('Deepgram API Key is missing.');

    const params = new URLSearchParams({
      model: this.model,
      smart_format: 'true',
      punctuate: 'true',
      diarize: 'true',
      utterances: 'true',
    });

    const res = await fetch(`${this.BASE_URL}?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'audio/wav',
      },
      body: audioBlob,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw this.mapError(res.status, body);
    }

    const data = await res.json() as {
      results?: {
        channels?: { alternatives?: { transcript?: string }[] }[];
        utterances?: { speaker: number; transcript: string; start: number; end: number }[];
      };
    };

    this.lastUtterances = (data.results?.utterances ?? []).map((u) => ({
      speaker: String(u.speaker),
      text: u.transcript,
      start: Math.round(u.start * 1000),
      end: Math.round(u.end * 1000),
    }));

    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  }

  getLastUtterances(): DiarizedUtterance[] {
    return this.lastUtterances;
  }

  // ── AIProvider interface ────────────────────────────────────────────────────

  async authenticate(): Promise<AuthenticationResult> {
    if (!this.apiKey) {
      return {
        success: false,
        message: 'Deepgram API Key is missing.',
        providerInfo: { name: 'Deepgram' },
        models: [],
        defaultModel: '',
        capabilities: {
          chat: false, speech_to_text: false, audio_generation: false,
          realtime: false, vision: false, embeddings: false, function_calling: false,
        },
      };
    }

    try {
      // IMPORTANT: /v1/projects (Deepgram's management API) does NOT return
      // CORS headers for browser-origin requests — calling it from Electron's
      // renderer throws a generic "TypeError: Failed to fetch" with no
      // useful status code, which is indistinguishable from a real network
      // failure and easy to misdiagnose as "the key must be wrong".
      // Confirmed via direct testing: /v1/projects returns 405 on OPTIONS
      // preflight and no access-control-allow-origin header, while /v1/listen
      // (the actual transcription endpoint) correctly reflects the request
      // origin in access-control-allow-origin. Use /v1/listen with an empty
      // body for the auth check instead — a bad key returns 401 with
      // "Invalid credentials." in the body, same signal, but CORS-safe.
      const res = await fetch(`${this.BASE_URL}?model=nova-3`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'audio/wav',
        },
        body: new Uint8Array(0),
      });
      // A 400 (empty/invalid audio body) still means the key was accepted —
      // only 401/403 indicate an auth failure. Any other status is treated
      // as "reachable and authenticated" for the purposes of this check.
      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => '');
        throw this.mapError(res.status, body);
      }
      return {
        success: true,
        message: 'Deepgram API key verified. Speech models available.',
        providerInfo: { name: 'Deepgram', version: 'v1' },
        models: this.MODELS,
        defaultModel: 'nova-3',
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
      // "Failed to fetch" here would mean something is blocking the request
      // before Deepgram responds at all (e.g. no internet, or a corporate
      // proxy/firewall) — the CORS-incompatible endpoint that used to cause
      // this exact symptom for a perfectly valid key has been replaced.
      const friendlyMsg = msg === 'Failed to fetch'
        ? 'Could not reach Deepgram. Check your internet connection and try again.'
        : msg;
      return {
        success: false,
        message: friendlyMsg,
        providerInfo: { name: 'Deepgram' },
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
      throw new Error('Deepgram transcription requires a Blob or File object.');
    }
    return this.transcribeBlob(audioFile);
  }

  async transcribeAudioFile(audioFile: unknown): Promise<string> {
    return this.transcribeAudio(audioFile);
  }

  async speechToText(audioData: unknown): Promise<string> {
    return this.transcribeAudio(audioData);
  }

  // Deepgram has no conversational LLM or text-generation capability —
  // it is speech-to-text only, same positioning as AssemblyAI in this app.
  async generateSummary(transcript: string): Promise<string> {
    return `[Deepgram] Transcript:\n${transcript}`;
  }
  async generateMeetingTitle(_transcript: string): Promise<string> {
    return 'Meeting Transcript';
  }
  async extractActionItems(_transcript: string): Promise<string[]> {
    return [];
  }
  async extractDecisions(_transcript: string): Promise<string[]> {
    return [];
  }
  async extractFollowUps(_transcript: string): Promise<string[]> {
    return [];
  }
  async chat(_messages: unknown[]): Promise<string> {
    throw new Error('Deepgram does not support conversational chat. It is a speech-to-text platform.');
  }

  // ── Live streaming ──────────────────────────────────────────────────────────
  // Deepgram's real-time streaming uses a WebSocket endpoint. Not wired into
  // this app's renderer-side batching engine — used only for post-recording
  // batch transcription (both as a selectable provider and as the automatic
  // fallback for other providers' failed live batches).
  async startLiveTranscription(_options: LiveTranscriptionOptions): Promise<void> { /* no-op */ }
  async stopLiveTranscription(): Promise<void> { /* no-op */ }
  async transcribeAudioChunk(_chunk: Float32Array): Promise<void> { /* no-op */ }
}
