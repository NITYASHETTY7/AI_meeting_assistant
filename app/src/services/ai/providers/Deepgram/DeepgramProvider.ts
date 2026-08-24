import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
  DiarizedUtterance,
  SpeakerTrack,
} from '../../AIProvider';
import type { AttributedSegment } from '../../../audio/AudioSourceAttribution';
import { LiveTranscriptionEngine } from '../../LiveTranscriptionEngine';

/**
 * Minimum derived per-utterance confidence to keep. Deepgram doesn't
 * reliably expose a single top-level utterance confidence field, so this is
 * computed by averaging the confidence of words whose timestamps fall
 * inside the utterance range (falling back to the overall channel
 * confidence) — see transcribeBlob(). Utterances below this are dropped as
 * likely misrecognized/noise segments before they ever reach the
 * transcript.
 */
const MIN_UTTERANCE_CONFIDENCE = 0.4;

/**
 * Deepgram Provider — speech-to-text specialist with live streaming
 * and post-recording diarization.
 */
export class DeepgramProvider implements AIProvider {
  private config?: ProviderConfig;
  private readonly BASE_URL = 'https://api.deepgram.com/v1/listen';
  private readonly MODELS = ['nova-3', 'nova-2', 'base'];
  private lastUtterances: DiarizedUtterance[] = [];
  private liveEngine: LiveTranscriptionEngine;

  constructor() {
    this.liveEngine = new LiveTranscriptionEngine(
      async (blob: Blob) => {
        const text = await this.transcribeBlob(blob);
        return { text };
      },
      44100
    );
  }

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
   * segments when diarization succeeds (getLastUtterances()), each carrying
   * a derived confidence score.
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
        channels?: {
          alternatives?: {
            transcript?: string;
            confidence?: number;
            words?: { word: string; start: number; end: number; confidence?: number }[];
          }[];
        }[];
        utterances?: { speaker: number; transcript: string; start: number; end: number; confidence?: number }[];
      };
    };

    // Deepgram's utterance objects don't reliably carry their own top-level
    // confidence — the real per-token signal lives in
    // channels[0].alternatives[0].words[].confidence. Average the word
    // confidences whose [start, end] falls inside each utterance's time
    // range to get a per-utterance score; fall back to the utterance's own
    // confidence field if a future API version adds one, then to the
    // overall alternative confidence if neither is available.
    const words = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
    const overallConfidence = data.results?.channels?.[0]?.alternatives?.[0]?.confidence;

    this.lastUtterances = (data.results?.utterances ?? []).map((u) => {
      const wordsInRange = words.filter((w) => w.start >= u.start && w.end <= u.end && w.confidence !== undefined);
      const derivedConfidence = wordsInRange.length > 0
        ? wordsInRange.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / wordsInRange.length
        : (u.confidence ?? overallConfidence);

      return {
        speaker: String(u.speaker),
        text: u.transcript,
        start: Math.round(u.start * 1000),
        end: Math.round(u.end * 1000),
        confidence: derivedConfidence,
      };
    }).filter((u) => u.confidence === undefined || u.confidence >= MIN_UTTERANCE_CONFIDENCE);

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
      // Send a minimal valid 44-byte silent WAV header so Deepgram returns 200 OK
      // without throwing a 400 Bad Request in the DevTools console.
      const silentWav = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
        0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
        0x80, 0x3e, 0x00, 0x00, 0x00, 0x7d, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
        0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
      ]);

      const res = await fetch(`${this.BASE_URL}?model=nova-3`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'audio/wav',
        },
        body: silentWav,
      });
      if (!res.ok) {
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
  async startLiveTranscription(options: LiveTranscriptionOptions): Promise<void> {
    await this.liveEngine.start(options);
  }

  async stopLiveTranscription(): Promise<void> {
    await this.liveEngine.stop();
  }

  async transcribeAudioChunk(
    chunk: Float32Array,
    speakerTrack?: SpeakerTrack,
    attribution?: AttributedSegment
  ): Promise<void> {
    await this.liveEngine.processChunk(chunk, speakerTrack, attribution);
  }
}
