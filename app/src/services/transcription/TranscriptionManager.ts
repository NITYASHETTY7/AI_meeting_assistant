import { useAppStore } from '../../store/useAppStore';
import { ProviderManager } from '../ai/ProviderManager';
import type { TranscriptEvent, DiarizedUtterance } from '../ai/AIProvider';

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
 *  POST-RECORDING (AssemblyAI)
 *    No live transcript during recording.
 *    After stop(wavBlob): the full WAV is uploaded to AssemblyAI and transcribed.
 *    Resulting lines are appended to the meeting after processing completes.
 *    The recording NEVER fails because this is entirely post-recording.
 *
 *  NO-OP (non-STT providers: Gemini, Anthropic, AWS, OpenRouter, Ollama, Custom)
 *    No transcription at all. Recording continues cleanly.
 *    The user can still generate a summary from whatever notes exist.
 *
 * Deduplication:
 *   Each segment is tracked by segmentId. Duplicate events (same segmentId or
 *   identical text+timestamp within the same batch) are silently dropped.
 */
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

    // AssemblyAI / Deepgram: capabilities.speech_to_text = true but live mode
    // is post-recording only. Their startLiveTranscription() is a no-op. We
    // skip the engine startup and will upload the full WAV in stop().
    if (store.provider === 'AssemblyAI' || store.provider === 'Deepgram') {
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
  static async feedChunk(chunk: Float32Array): Promise<void> {
    if (!this.sessionActive || this.isPaused) return;

    const store = useAppStore.getState();
    if (!store.capabilities.speech_to_text) return;
    if (store.provider === 'AssemblyAI' || store.provider === 'Deepgram') return; // post-recording only

    try {
      const provider = ProviderManager.getActiveProvider();
      await provider.transcribeAudioChunk(chunk);
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

    const isPostRecordingOnly = store.provider === 'AssemblyAI' || store.provider === 'Deepgram';

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

  // ── AssemblyAI post-recording flow ──────────────────────────────────────────

  /**
   * Uploads the full WAV to AssemblyAI, polls until the transcript is ready,
   * then appends all returned words/utterances as transcript lines to the meeting.
   *
   * Used by both AssemblyAI and Deepgram — both are post-recording-only STT
   * providers in this app (no live per-batch streaming path), and both
   * expose getLastUtterances() for real speaker-labeled diarization when
   * available, falling back to sentence-splitting the flat transcript text.
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
      const lines = utterances.length > 0
        ? this.mapUtterancesToLines(utterances)
        : this.parseAssemblyAITranscript(transcriptText, this.startTime);

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
