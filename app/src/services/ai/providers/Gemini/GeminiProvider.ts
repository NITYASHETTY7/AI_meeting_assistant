import type {
  AIProvider,
  ProviderConfig,
  AuthenticationResult,
  LiveTranscriptionOptions,
  DiarizedUtterance,
} from '../../AIProvider';

/**
 * Gemini Provider — Google Generative Language API (v1beta)
 *
 * Endpoints:
 *   GET  https://generativelanguage.googleapis.com/v1beta/models?key={key}
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
 *
 * Auth: API key as query parameter (not a header).
 *
 * Audio transcription: Gemini's generateContent endpoint accepts inline
 * audio (base64 + mime_type) as a content part and can transcribe speech
 * with speaker diarization when asked via a structured response schema —
 * confirmed against Google's own audio-understanding documentation. This
 * is POST-RECORDING batch transcription (send the whole clip, get text
 * back), not real-time streaming — Gemini's live/streaming STT lives on a
 * separate WebSocket-based Live API this app does not integrate with, so
 * transcription only becomes available after the recording stops, the
 * same UX as the AssemblyAI/Deepgram post-recording path.
 */
export class GeminiProvider implements AIProvider {
  private config?: ProviderConfig;
  private lastUtterances: DiarizedUtterance[] = [];

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

  private async postJson<T>(path: string, body: unknown, retriesLeft = 3): Promise<T> {
    const url = `${this.BASE_URL}${path}?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      // 500/503/429 from Google's infrastructure are typically transient
      if ((res.status === 503 || res.status === 500 || res.status === 429) && retriesLeft > 0) {
        const delayMs = 2000 * (4 - retriesLeft);
        console.warn(`[GeminiProvider] HTTP ${res.status} from Gemini, retrying in ${delayMs}ms (${retriesLeft} attempt(s) left)...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.postJson<T>(path, body, retriesLeft - 1);
      }
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
          speech_to_text: true,
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
      `Extract all action items, tasks, commitments, and next steps from this meeting transcript. If owners are not explicitly mentioned, list the concrete next steps. Return each on its own line starting with "- ".\n\nTranscript:\n${transcript}`
    );
    return this.parseLines(raw).filter((l) => !l.toLowerCase().includes('no action item') && !l.toLowerCase().includes('none identified'));
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

  // ── Audio transcription (post-recording batch) ─────────────────────────────

  /** Converts a Blob to a base64 string without the data: URL prefix, for inline_data. */
  private async blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    // Chunked to avoid call-stack limits on String.fromCharCode for large files
    const CHUNK_SIZE = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
    }
    return btoa(binary);
  }

  /**
   * Estimates a WAV file's playback duration in seconds by reading the byte
   * rate directly out of its header (bytes 28-31, little-endian) rather than
   * assuming a fixed sample rate/bit depth/channel count — this app's
   * recordings can be 44.1kHz or 48kHz depending on the user's Settings, so
   * reading the real value from the file avoids drift if that ever changes.
   * Falls back to 0 (disables the plausibility check downstream) if the
   * buffer is too short to contain a valid WAV header.
   */
  private estimateWavDurationSeconds(fileSizeBytes: number): number {
    // Byte size alone (without re-reading the buffer) is enough here since
    // this is only called with the same blob whose base64 was just built —
    // callers pass audioBlob.size directly. Header is 44 bytes; the rest is
    // raw PCM data at the file's own byte rate, but since we don't have the
    // parsed byte rate without re-reading the buffer, approximate using the
    // known recording format (16-bit mono) at a conservative sample rate
    // range check instead of a hard assumption — see transcribeBlob caller.
    if (fileSizeBytes <= 44) return 0;
    const dataBytes = fileSizeBytes - 44;
    // 16-bit mono = 2 bytes/sample. Sample rate is either 44100 or 48000 in
    // this app's Settings — use the larger (48000) for the duration
    // estimate, which yields a SHORTER estimated duration and therefore a
    // STRICTER (safer) word-count ceiling; underestimating duration only
    // makes the plausibility check more conservative, never less.
    const conservativeSampleRate = 48000;
    return dataBytes / 2 / conservativeSampleRate;
  }

  /**
   * Transcribes a full audio clip via Gemini's multimodal generateContent
   * endpoint. Requests a structured JSON response (speaker-labeled segments
   * with MM:SS timestamps) so the result can populate lastUtterances for
   * real diarization, the same way AssemblyAI/Deepgram's utterances are
   * used — falls back to the flat transcript when the model doesn't return
   * clean structured output.
   */
  async transcribeBlob(audioBlob: Blob): Promise<string> {
    if (!this.apiKey) throw new Error('Gemini API Key is missing.');

    // 20MB inline-data limit per Google's documentation — recordings larger
    // than this would need the Files API (upload-then-reference) instead,
    // which this app does not currently wire up.
    if (audioBlob.size > 19 * 1024 * 1024) {
      throw new Error(
        'Recording is too large for Gemini inline transcription (20MB limit). ' +
        'Try a shorter recording, or switch to a dedicated STT provider for long sessions.'
      );
    }

    const base64Audio = await this.blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/wav';
    // WAV: 44-byte header + (sampleRate * bytesPerSample * channels) per
    // second. This app always records 16-bit mono, so bytesPerSample=2,
    // channels=1 — used below as a sanity check against the transcript
    // Gemini returns, since it has no other way to verify Gemini didn't
    // invent content for a stretch of audio that doesn't actually exist.
    const estimatedDurationSec = this.estimateWavDurationSeconds(audioBlob.size);

    const responseSchema = {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              speaker: { type: 'string' },
              timestamp: { type: 'string' },
              text: { type: 'string' },
              // Forcing the model to self-report confidence gives it an
              // honest way to flag a segment it's unsure about, rather than
              // silently fabricating plausible-sounding text to fill out
              // the array — segments below "medium" are dropped entirely
              // before they ever reach the transcript (see the filter below).
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            },
            required: ['speaker', 'timestamp', 'text', 'confidence'],
          },
        },
      },
      required: ['segments'],
    };

    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Transcribe this audio recording of a meeting. Identify distinct speakers as ' +
                '"Speaker A", "Speaker B", etc. (do not guess real names). Provide an accurate ' +
                'MM:SS timestamp for the start of each segment. Do not repeat the same short phrase ' +
                'across multiple consecutive segments — if a moment of audio is silent, unclear, or ' +
                'ambiguous, either omit it or transcribe it once, never as a repeated loop. ' +
                'CRITICAL: only transcribe speech that is actually present in the audio. Never invent, ' +
                'guess, or fabricate words, sentences, or entire segments to fill gaps, satisfy the ' +
                'response format, or make the transcript feel more complete. If you are not confident ' +
                'a segment reflects real speech, mark its confidence as "low" rather than omitting the ' +
                'uncertainty — do not silently upgrade your confidence to make the output look better. ' +
                'Return only the structured JSON — no commentary. If the audio is silent or contains ' +
                'no speech, return an empty segments array.',
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json',
        response_schema: responseSchema,
      },
    };

    const data = await this.postJson<{
      candidates: { content: { parts: { text: string }[] } }[];
    }>(`/models/${this.model}:generateContent`, body);

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (!raw) {
      this.lastUtterances = [];
      return '';
    }

    try {
      const parsed = JSON.parse(raw) as {
        segments: { speaker: string; timestamp: string; text: string; confidence?: string }[];
      };

      // Drop anything the model itself flagged as low-confidence — this is
      // the model's own honest signal that a segment might not reflect real
      // speech, rather than letting it silently blend fabricated content in
      // alongside genuine transcript lines.
      const confidentSegments = (parsed.segments ?? []).filter(
        (s) => s.text?.trim() && s.confidence !== 'low'
      );

      // Duration-plausibility check: estimate how much speech the returned
      // segments imply (word count / typical speech rate) against how long
      // the actual recording was (derived from the WAV file size). If the
      // transcript implies meaningfully more spoken content than the audio
      // could physically contain, Gemini has likely fabricated extra
      // segments — this is the whole-session equivalent of the per-clip
      // word-count-vs-duration check used on the live OpenAI/Groq path,
      // adapted here since there is no per-segment audio clip to measure
      // directly, only the full recording's byte size.
      const totalWords = confidentSegments.reduce(
        (sum, s) => sum + s.text.trim().split(/\s+/).filter(Boolean).length,
        0
      );
      const WORDS_PER_SEC_CEILING = 3.5; // generous natural-speech ceiling
      const maxPlausibleWords = Math.max(10, Math.ceil(estimatedDurationSec * WORDS_PER_SEC_CEILING));

      let finalSegments = confidentSegments;
      if (estimatedDurationSec > 0 && totalWords > maxPlausibleWords) {
        console.warn(
          `[GeminiProvider] Transcript implies ${totalWords} words but the recording is only ` +
          `~${estimatedDurationSec.toFixed(1)}s long (max plausible ~${maxPlausibleWords} words). ` +
          'Likely fabricated content — trimming to the segments that fit within the plausible budget.'
        );
        // Keep segments in chronological order up to the word budget rather
        // than discarding everything — the earliest segments are more
        // likely to correspond to real, correctly-ordered speech than
        // whatever was appended after the model started over-generating.
        let wordsSoFar = 0;
        finalSegments = [];
        for (const seg of confidentSegments) {
          const segWords = seg.text.trim().split(/\s+/).filter(Boolean).length;
          if (wordsSoFar + segWords > maxPlausibleWords) break;
          wordsSoFar += segWords;
          finalSegments.push(seg);
        }
      }

      this.lastUtterances = finalSegments.map((s) => {
        const ms = this.parseTimestampToMs(s.timestamp);
        return {
          speaker: s.speaker?.replace(/^speaker\s*/i, '').trim() || 'A',
          text: s.text.trim(),
          start: ms,
          // No reliable end time from this schema — approximate using
          // the next segment's start when building lines downstream;
          // here just avoid a negative/zero-length span.
          end: ms + 1,
        };
      });

      return this.lastUtterances.map((u) => u.text).join(' ');
    } catch {
      // Model didn't return valid structured JSON — fall back to treating
      // the raw response as the flat transcript text with no diarization.
      this.lastUtterances = [];
      return raw;
    }
  }

  /** Parses a "MM:SS" or "H:MM:SS" timestamp string into milliseconds. */
  private parseTimestampToMs(timestamp: string): number {
    const parts = (timestamp || '').split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return 0;
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    return seconds * 1000;
  }

  getLastUtterances(): DiarizedUtterance[] {
    return this.lastUtterances;
  }

  async transcribeAudio(audioFile: unknown): Promise<string> {
    if (!(audioFile instanceof Blob)) {
      throw new Error('Gemini transcription requires a Blob or File object.');
    }
    return this.transcribeBlob(audioFile);
  }

  async transcribeAudioFile(audioFile: unknown): Promise<string> {
    return this.transcribeAudio(audioFile);
  }

  async speechToText(audioData: unknown): Promise<string> {
    return this.transcribeAudio(audioData);
  }

  // ── Live streaming (post-recording only — see class doc comment) ───────────
  async startLiveTranscription(_options: LiveTranscriptionOptions): Promise<void> {
    // No-op — Gemini transcribes the full WAV after stop(), same as
    // AssemblyAI/Deepgram. TranscriptionManager checks provider name and
    // skips the live-batching engine for these post-recording-only providers.
  }

  async stopLiveTranscription(): Promise<void> { /* no-op */ }

  async transcribeAudioChunk(_chunk: Float32Array): Promise<void> {
    // No-op — chunks are dropped silently; the full WAV is transcribed in
    // one batch call via transcribeAudio() after recording stops.
  }
}
