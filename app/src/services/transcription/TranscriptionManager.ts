import { useAppStore } from '../../store/useAppStore';
import { ProviderManager } from '../ai/ProviderManager';
import type { TranscriptEvent, DiarizedUtterance, SpeakerTrack } from '../ai/AIProvider';
import type { AttributedSegment } from '../audio/AudioSourceAttribution';

/**
 * TranscriptionManager — the single owner of all transcription lifecycle.
 *
 * Responsibilities:
 *  1. start(meetingId)  — open live transcription session with the active provider
 *  2. feedChunk()       — forward raw PCM from AudioCapture to the provider engine
 *  3. pause()           — suspend chunk forwarding (recording paused by user)
 *  4. resume()          — resume chunk forwarding
 *  5. stop(wavBlob?)    — flush pending audio, close session, optionally post-process WAV
 *  6. cancel()          — discard everything immediately
 *
 * Two transcription modes:
 *
 *  LIVE (STT providers: OpenAI, Groq)
 *    Chunks → LiveTranscriptionEngine → WAV batch → Whisper API → TranscriptEvent
 *    Transcript lines appear during recording.
 *
 *  POST-RECORDING (AssemblyAI, Deepgram, Gemini)
 *    No live transcript during recording.
 *    After stop(wavBlob): the full WAV is uploaded and transcribed in one batch call.
 *    Resulting lines are appended to the meeting after processing completes.
 *    The recording NEVER fails because this is entirely post-recording.
 *    Gemini transcribes via generateContent with inline audio data — real
 *    transcription, not live/streaming (that would require Gemini's separate
 *    Live API, which this app does not integrate with).
 *
 *  NO-OP (non-STT providers: Anthropic, AWS, OpenRouter, Ollama, Custom)
 *    No transcription at all. Recording continues cleanly.
 *    The user can still generate a summary from whatever notes exist.
 *
 * Deduplication:
 *   Each segment is tracked by segmentId. Duplicate events (same segmentId or
 *   identical text+timestamp within the same batch) are silently dropped.
 */

/**
 * Providers whose speech_to_text capability is real but batch/post-recording
 * only — no live streaming during the call. TranscriptionManager skips the
 * live-batching engine entirely for these and instead uploads the full WAV
 * in stop(). Exported so Settings can show an accurate capability message
 * right after a successful connection test, instead of a generic "Connected"
 * that doesn't tell the user when to expect their transcript.
 */
export const POST_RECORDING_ONLY_PROVIDERS = ['AssemblyAI', 'Deepgram', 'Gemini'];

export class TranscriptionManager {
  private static startTime = 0;
  private static isPaused = false;
  private static sessionActive = false;
  /** The meeting ID that all transcript lines will be appended to */
  private static activeMeetingId: string | null = null;
  /** Tracks already-seen segment IDs to prevent duplicates across batches */
  private static seenSegmentIds = new Set<string>();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * @param meetingId  The meeting that was created at recording start.
   *                   TranscriptionManager will append all transcript lines here.
   */
  static async start(meetingId: string): Promise<void> {
    const store = useAppStore.getState();
    this.isPaused = false;
    this.startTime = Date.now();
    this.sessionActive = true;
    this.activeMeetingId = meetingId;
    this.seenSegmentIds = new Set();

    if (!store.capabilities.speech_to_text) {
      // Provider doesn't support STT — show informational state, don't fail
      store.setTranscriptionStatus('idle');
      store.setStreamState('disconnected');
      console.info(
        `[TranscriptionManager] ${store.provider} does not support live transcription. ` +
        'Recording continues without live transcript.'
      );
      return;
    }

    // Post-recording-only providers: capabilities.speech_to_text = true but
    // live mode is batch-after-stop. Their startLiveTranscription() is a
    // no-op. We skip the engine startup and will upload the full WAV in stop().
    if (POST_RECORDING_ONLY_PROVIDERS.includes(store.provider)) {
      store.setTranscriptionStatus('idle');
      store.setStreamState('disconnected');
      console.info(`[TranscriptionManager] ${store.provider}: will transcribe after recording stops.`);
      return;
    }

    try {
      store.setStreamState('connecting');
      store.setTranscriptionStatus('processing');

      const provider = ProviderManager.getActiveProvider();

      await provider.startLiveTranscription({
        onTranscriptUpdate: (event: TranscriptEvent) => {
          const current = useAppStore.getState();

          // Ignore stale events arriving after recording has stopped
          if (current.recordingStatus !== 'recording') return;

          current.setLastTranscriptTime(Date.now());

          // Deduplicate by segmentId — Whisper can re-emit previous segments
          if (this.seenSegmentIds.has(event.segmentId)) return;
          this.seenSegmentIds.add(event.segmentId);

          const targetMeetingId = this.activeMeetingId ?? current.activeMeetingId ?? '';
          if (!targetMeetingId) return;

          const line = {
            time: event.timestamp,
            speaker: event.speaker,
            text: event.text,
            attributionSource: event.attributionSource,
            attributionSpeaker: event.attributionSpeaker,
            attributionConfidence: event.attributionConfidence,
          };

          // Also deduplicate by (text, timestamp) as a secondary guard
          const meeting = current.meetings.find((m) => m.id === targetMeetingId);
          if (meeting) {
            const last = meeting.transcript[meeting.transcript.length - 1];
            if (last && last.text === event.text && last.time === event.timestamp) return;
          }

          current.appendTranscriptLine(targetMeetingId, line);
          current.setTranscriptSegments([...current.transcriptSegments, line]);
        },
        onError: (err: unknown) => {
          console.warn(
            '[TranscriptionManager] Transcription error (recording continues):',
            err
          );
          const message = err instanceof Error ? err.message : String(err);
          useAppStore.getState().setLastTranscriptionError(message);
          useAppStore.getState().setTranscriptionStatus('error');
        },
      });

      store.setStreamState('connected');
      store.setActiveSessionId(`session-${Date.now().toString(36)}`);
    } catch (err) {
      console.error('[TranscriptionManager] Failed to start live transcription:', err);
      const message = err instanceof Error ? err.message : String(err);
      store.setLastTranscriptionError(message);
      store.setTranscriptionStatus('error');
      store.setStreamState('disconnected');
      // Recording continues — transcription failure is non-fatal
    }
  }

  /**
   * Forward a raw PCM chunk to the provider's transcription engine.
   * Called on every AudioCapture onaudioprocess event.
   * No-ops gracefully if not running or paused.
   */
  static async feedChunk(chunk: Float32Array, speakerTrack?: SpeakerTrack, attribution?: AttributedSegment): Promise<void> {
    if (!this.sessionActive || this.isPaused) return;

    const store = useAppStore.getState();
    if (!store.capabilities.speech_to_text) return;
    if (POST_RECORDING_ONLY_PROVIDERS.includes(store.provider)) return; // post-recording only

    try {
      const provider = ProviderManager.getActiveProvider();
      await provider.transcribeAudioChunk(chunk, speakerTrack, attribution);
    } catch {
      // Chunk errors are silently dropped — never propagate to the UI
    }
  }

  static pause(): void {
    this.isPaused = true;
  }

  static resume(): void {
    this.isPaused = false;
  }

  /**
   * Clean stop — flushes pending audio and closes the session.
   *
   * @param wavBlob  The complete recording as a WAV Blob.
   *                 Required for AssemblyAI post-recording transcription.
   *                 Ignored by live-STT providers and no-op providers.
   */
  static async stop(wavBlob?: Blob): Promise<void> {
    this.sessionActive = false;
    this.isPaused = false;

    const store = useAppStore.getState();
    store.setStreamState('disconnected');
    store.setActiveSessionId(null);

    const isPostRecordingOnly = POST_RECORDING_ONLY_PROVIDERS.includes(store.provider);

    if (store.capabilities.speech_to_text && !isPostRecordingOnly) {
      // Live STT providers: flush the engine's pending batch
      try {
        const provider = ProviderManager.getActiveProvider();
        await provider.stopLiveTranscription();
        store.setTranscriptionStatus('idle');
      } catch (err) {
        console.warn('[TranscriptionManager] Error closing transcription stream:', err);
        store.setTranscriptionStatus('idle');
      }
    }

    if (isPostRecordingOnly && wavBlob) {
      // AssemblyAI / Deepgram: upload the full WAV and transcribe post-recording.
      // This runs asynchronously — UI shows "transcribing" status.
      // Recording is already stopped before this runs, so no blocking.
      void this.runPostRecordingTranscription(wavBlob);
      return;
    }

    store.setTranscriptSegments([]);
  }

  /** Immediate cancel — discard everything, no flush */
  static cancel(): void {
    this.sessionActive = false;
    this.isPaused = false;

    const store = useAppStore.getState();
    store.setStreamState('disconnected');
    store.setTranscriptionStatus('idle');
    store.setActiveSessionId(null);
    store.setTranscriptSegments([]);

    if (store.capabilities.speech_to_text && store.provider !== 'AssemblyAI') {
      try {
        const provider = ProviderManager.getActiveProvider();
        // Fire-and-forget — don't await on cancel
        provider.stopLiveTranscription().catch(() => {});
      } catch { /* ignore */ }
    }

    this.activeMeetingId = null;
    this.seenSegmentIds = new Set();
  }

  // ── Post-recording transcription flow ───────────────────────────────────────

  /**
   * Uploads the full WAV to the active provider, polls/awaits until the
   * transcript is ready, then appends all returned words/utterances as
   * transcript lines to the meeting.
   *
   * Used by AssemblyAI, Deepgram, and Gemini — all three are post-recording-
   * only STT providers in this app (no live per-batch streaming path), and
   * all three expose getLastUtterances() for real speaker-labeled
   * diarization when available, falling back to sentence-splitting the flat
   * transcript text.
   *
   * This is non-blocking — called via `void` after recording stops.
   * Status is surfaced via transcriptionStatus in the store.
   */
  private static async runPostRecordingTranscription(wavBlob: Blob): Promise<void> {
    const store = useAppStore.getState();
    const meetingId = this.activeMeetingId ?? store.activeMeetingId;
    const providerName = store.provider;

    if (!meetingId) {
      console.warn(`[TranscriptionManager] ${providerName}: no active meeting ID, skipping upload.`);
      return;
    }

    store.setTranscriptionStatus('processing');
    store.setStreamState('connecting');

    try {
      const provider = ProviderManager.getActiveProvider();

      // Use transcribeAudio which handles upload + polling internally
      const transcriptText = await provider.transcribeAudio(wavBlob);

      if (!transcriptText || transcriptText.trim().length === 0) {
        console.info(`[TranscriptionManager] ${providerName}: transcript is empty.`);
        store.setTranscriptionStatus('idle');
        store.setStreamState('disconnected');
        return;
      }

      // Prefer real speaker-labeled utterances (native diarization, enabled
      // via speaker_labels/diarize params in each provider's request) over
      // sentence-splitting the flat text. Utterances carry the actual speaker
      // identity ("Speaker A", "Speaker B", ...) and real timestamps.
      const utterances = provider.getLastUtterances?.() ?? [];
      const rawLines = utterances.length > 0
        ? this.mapUtterancesToLines(utterances)
        : this.parseAssemblyAITranscript(transcriptText, this.startTime);

      // Post-recording providers (AssemblyAI/Deepgram/Gemini) never pass
      // through LiveTranscriptionEngine's hallucination filter — that guard
      // only covers the OpenAI/Groq live-batching path. STT/LLM-based
      // transcription is well known to occasionally loop on a short phrase
      // (e.g. "do you", "do you", "do you" at consecutive one-second marks)
      // when a segment has ambiguous or low-quality audio, so this collapses
      // runs of identical/near-identical consecutive lines from the SAME
      // speaker down to a single line before they ever reach the transcript.
      const lines = this.collapseRepeatedLines(rawLines);

      for (const line of lines) {
        useAppStore.getState().appendTranscriptLine(meetingId, line);
      }

      // Keep transcript segments in sync
      const current = useAppStore.getState();
      const meeting = current.meetings.find((m) => m.id === meetingId);
      if (meeting) {
        store.setTranscriptSegments(meeting.transcript);
      }

      // Replace the stopgap preview set immediately at stop() — for
      // post-recording providers (AssemblyAI/Deepgram) the transcript
      // wasn't available yet at that point, so the preview showed a generic
      // placeholder. Now that real lines have arrived, use the first one.
      if (lines.length > 0) {
        current.setMeetingPreview(meetingId, lines[0].text.slice(0, 120));
      }

      store.setTranscriptionStatus('idle');
      store.setStreamState('disconnected');
      console.info(`[TranscriptionManager] ${providerName}: ${lines.length} transcript line(s) added.`);
    } catch (err) {
      console.error(`[TranscriptionManager] ${providerName} post-recording transcription failed:`, err);
      store.setTranscriptionStatus('error');
      store.setStreamState('disconnected');
    } finally {
      this.activeMeetingId = null;
      this.seenSegmentIds = new Set();
    }
  }

  /**
   * Collapses runs of identical/near-identical consecutive lines from the
   * SAME speaker, occurring within a few seconds of each other, into a
   * single line. This is the post-recording-provider equivalent of
   * LiveTranscriptionEngine's hallucination filter — STT/LLM transcription
   * occasionally loops on a short phrase for a few seconds when a segment
   * has ambiguous audio, producing e.g. "do you" / "do you" / "do you"
   * across consecutive timestamps. Requiring the repeat to fall within a
   * short time window (not just adjacency in the array) avoids dropping a
   * speaker legitimately saying the same short word twice minutes apart
   * later in a real conversation ("Okay" said once early on and again much
   * later is not a hallucination).
   */
  private static readonly REPEAT_COLLAPSE_WINDOW_SEC = 5;

  private static collapseRepeatedLines(
    lines: { time: string; speaker: string; text: string }[]
  ): { time: string; speaker: string; text: string }[] {
    const toSeconds = (time: string): number => {
      const parts = time.split(':').map((p) => parseInt(p, 10));
      if (parts.some((p) => Number.isNaN(p))) return 0;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    };

    const result: { time: string; speaker: string; text: string }[] = [];

    for (const line of lines) {
      const prev = result[result.length - 1];
      const normalized = line.text.trim().toLowerCase();
      const prevNormalized = prev?.text.trim().toLowerCase();
      const withinWindow = prev
        ? Math.abs(toSeconds(line.time) - toSeconds(prev.time)) <= this.REPEAT_COLLAPSE_WINDOW_SEC
        : false;

      if (
        prev &&
        prev.speaker === line.speaker &&
        normalized === prevNormalized &&
        normalized.length > 0 &&
        withinWindow
      ) {
        // Duplicate of the immediately preceding line from the same
        // speaker, within a few seconds — drop it as a likely hallucinated
        // repeat loop, keeping only the first occurrence's timestamp.
        continue;
      }

      result.push(line);
    }

    return result;
  }

  /**
   * Converts AssemblyAI's real speaker-labeled utterances into transcript
   * lines. Speaker labels ("A", "B", ...) are mapped to readable names
   * ("Speaker A", "Speaker B", ...) and timestamps use the utterance's
   * actual start time (milliseconds into the audio) rather than an
   * approximation based on even distribution across the session.
   */
  private static mapUtterancesToLines(
    utterances: DiarizedUtterance[]
  ): { time: string; speaker: string; text: string }[] {
    return utterances
      .filter((u) => u.text.trim().length > 0)
      .map((u) => {
        const totalSec = Math.floor(u.start / 1000);
        const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const ss = (totalSec % 60).toString().padStart(2, '0');
        return {
          time: `${mm}:${ss}`,
          speaker: `Speaker ${u.speaker}`,
          text: u.text.trim(),
        };
      });
  }

  /**
   * Converts a flat transcript string returned by AssemblyAI into individual
   * transcript lines with approximate timestamps based on session duration.
   * Used only as a fallback when diarization returns no utterances (e.g.
   * too little speech per speaker for AssemblyAI to reliably separate them).
   */
  private static parseAssemblyAITranscript(
    text: string,
    sessionStartMs: number
  ): { time: string; speaker: string; text: string }[] {
    // Split on sentence-ending punctuation
    const rawSentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawSentences.length === 0) {
      // Fallback: treat entire text as one line
      return [{ time: '0:00', speaker: 'Speaker', text: text.trim() }];
    }

    const totalMs = Date.now() - sessionStartMs;
    const perSentenceMs = rawSentences.length > 0 ? totalMs / rawSentences.length : 0;

    return rawSentences.map((sentence, idx) => {
      const elapsedMs = Math.floor(idx * perSentenceMs);
      const totalSec = Math.floor(elapsedMs / 1000);
      const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const ss = (totalSec % 60).toString().padStart(2, '0');
      return {
        time: `${mm}:${ss}`,
        speaker: 'Speaker',
        text: sentence,
      };
    });
  }
}
