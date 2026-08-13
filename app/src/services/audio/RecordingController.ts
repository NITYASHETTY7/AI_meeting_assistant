import { AudioCapture } from './AudioCapture';
import { WaveFileWriter } from './WaveFileWriter';
import { useAppStore } from '../../store/useAppStore';
import { TranscriptionManager } from '../transcription/TranscriptionManager';

/**
 * RecordingController
 *
 * Single responsibility: manage the audio capture lifecycle.
 *  - start()  → acquire mic, begin capturing samples, start timer, start live transcription
 *  - pause()  → freeze capture + transcription
 *  - resume() → resume capture + transcription
 *  - stop()   → flush captured samples to WAV, save file, stop transcription
 *  - cancel() → discard everything
 *
 * Live transcription is owned entirely by TranscriptionManager.
 * RecordingController feeds raw PCM chunks to it via TranscriptionManager.feedChunk().
 * There is NO second path (removed the old activeProvider.transcribeAudioChunk() call
 * that competed with the TranscriptionManager — that was causing double-processing
 * and the MockStreamEngine was running on both paths simultaneously).
 *
 * Meeting creation:
 *   start() always creates a new meeting via createMeetingForRecording() so that
 *   TranscriptionManager always has a valid meeting ID to append transcript lines to.
 *   An optional meetingSource label (e.g. "Google Meet") is used for the title.
 */
export class RecordingController {
  private capture: AudioCapture | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private sampleRate = 44100;
  private onVolumeChange?: (level: number) => void;

  constructor(onVolumeChange?: (level: number) => void) {
    this.onVolumeChange = onVolumeChange;
  }

  async start(deviceId = 'default', meetingSource?: string): Promise<void> {
    const store = useAppStore.getState();
    const rate = parseInt(store.sampleRate) || 44100;
    this.sampleRate = rate;

    // Always create a fresh meeting record so TranscriptionManager has a valid target
    const meetingId = store.createMeetingForRecording(meetingSource);

    useAppStore.setState({
      recordingStatus: 'recording',
      recordingDuration: 0,
      recordingFilePath: null,
    });

    try {
      // AudioCapture delivers volume level changes and raw PCM chunks.
      // Chunks are forwarded to TranscriptionManager — that is the ONLY transcription path.
      this.capture = new AudioCapture(
        rate,
        this.onVolumeChange,
        (chunk: Float32Array) => {
          // Feed raw audio chunk to TranscriptionManager for live Whisper batching.
          // This call is fire-and-forget — errors are swallowed inside the engine.
          TranscriptionManager.feedChunk(chunk);
        }
      );

      await this.capture.start(deviceId);
      this.startTimer();

      // Start live transcription session (connects to provider if STT is supported)
      await TranscriptionManager.start(meetingId);
    } catch (err) {
      // Mic permission denied, no input device, or getUserMedia failure —
      // roll back completely rather than leaving a phantom "recording in
      // progress" meeting with recordingStatus stuck at 'recording' forever
      // and no audio actually being captured. Without this rollback, the
      // meeting card shows "Recording in progress…" permanently since
      // nothing else ever transitions recordingStatus away from 'recording'.
      this.stopTimer();
      this.capture = null;
      useAppStore.setState({
        recordingStatus: 'idle',
        recordingDuration: 0,
      });
      store.deleteMeeting(meetingId);
      throw err;
    }
  }

  pause(): void {
    if (!this.capture) return;
    this.capture.pause();
    this.stopTimer();
    useAppStore.setState({ recordingStatus: 'paused' });
    TranscriptionManager.pause();
  }

  resume(): void {
    if (!this.capture) return;
    this.capture.resume();
    this.startTimer();
    useAppStore.setState({ recordingStatus: 'recording' });
    TranscriptionManager.resume();
  }

  async stop(): Promise<string | null> {
    this.stopTimer();

    if (!this.capture) return null;

    // Collect samples BEFORE calling stop (stop() clears the buffer)
    const samples = this.capture.stop();
    this.capture = null;

    // Encode to WAV and persist
    const wavBuffer = WaveFileWriter.writeWav(samples, this.sampleRate);
    const fileName = `meeting_${Date.now()}.wav`;
    let savedPath: string | null = null;

    try {
      if (window.electronAPI?.saveAudio) {
        savedPath = await window.electronAPI.saveAudio(fileName, wavBuffer);
      } else {
        // Dev mode: generate a synthetic path for display purposes
        savedPath = `recordings/${fileName}`;
      }
    } catch (err) {
      console.error('[RecordingController] Failed to save audio file:', err);
      savedPath = `recordings/${fileName}`;
    }

    // Stop transcription — flushes any pending audio batch.
    // For AssemblyAI (post-recording STT), the WAV blob is forwarded so the
    // engine can upload and transcribe after recording ends.
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    await TranscriptionManager.stop(wavBlob);

    // Write the final elapsed duration onto the meeting record. Without this,
    // every meeting permanently shows its initial placeholder "0m" — the
    // recordingDuration counter (seconds) was tracked live during recording
    // but never persisted onto the meeting itself.
    const finalStore = useAppStore.getState();
    if (finalStore.activeMeetingId) {
      finalStore.setMeetingDuration(
        finalStore.activeMeetingId,
        RecordingController.formatDuration(finalStore.recordingDuration)
      );

      // Replace the "Recording in progress…" placeholder preview now that
      // recording has actually stopped. For live-STT providers the
      // transcript is already populated at this point, so use its first
      // line; for post-recording providers (AssemblyAI/Deepgram) the
      // transcript arrives asynchronously after this — TranscriptionManager
      // updates the preview again once that completes. Without this
      // immediate update, meetings with no transcript at all (non-STT
      // providers, or STT that produced nothing) would show the recording
      // placeholder forever.
      const meeting = finalStore.meetings.find((m) => m.id === finalStore.activeMeetingId);
      const firstLine = meeting?.transcript[0]?.text;
      finalStore.setMeetingPreview(
        finalStore.activeMeetingId,
        firstLine ? firstLine.slice(0, 120) : 'No transcript captured. Click to add notes or generate a summary.'
      );
    }

    useAppStore.setState({
      recordingStatus: 'stopped',
      recordingFilePath: savedPath,
    });

    return savedPath;
  }

  cancel(): void {
    this.stopTimer();
    TranscriptionManager.cancel();

    if (this.capture) {
      this.capture.stop();
      this.capture = null;
    }

    useAppStore.setState({
      recordingStatus: 'idle',
      recordingDuration: 0,
      recordingFilePath: null,
    });
  }

  private startTimer(): void {
    if (this.timerId !== null) return;
    this.timerId = setInterval(() => {
      useAppStore.getState().incrementRecordingDuration();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** Formats a duration in whole seconds as "Xm" or "Xh Ym" for display on meeting cards. */
  static formatDuration(totalSeconds: number): string {
    const minutes = Math.round(totalSeconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
  }
}
