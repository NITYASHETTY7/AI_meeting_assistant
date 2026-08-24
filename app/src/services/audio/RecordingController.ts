import { AudioCapture } from './AudioCapture';
import { WaveFileWriter } from './WaveFileWriter';
import { useAppStore } from '../../store/useAppStore';
import type { SpeakerTrack } from '../ai/AIProvider';
import type { AttributedSegment } from './AudioSourceAttribution';
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
 *   start() resumes the currently open meeting (resumeMeetingId, e.g. the one
 *   the user is viewing when they press "Start Recording" again after a
 *   stop) so existing transcript lines are kept and new lines are appended
 *   to the same meeting. Only when there is no meeting to resume (e.g. the
 *   global "New Recording" action, or auto-detected meeting notifications)
 *   does it create a fresh meeting via createMeetingForRecording().
 *   An optional meetingSource label (e.g. "Google Meet") is used for the title
 *   of newly created meetings.
 */
export class RecordingController {
  private capture: AudioCapture | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private sampleRate = 44100;
  private onVolumeChange?: (level: number) => void;

  constructor(onVolumeChange?: (level: number) => void) {
    this.onVolumeChange = onVolumeChange;
  }

  /**
   * @param deviceId        Microphone device ID to capture from.
   * @param meetingSource   Optional label (e.g. "Google Meet") used for the
   *                         title when a new meeting is created.
   * @param resumeMeetingId Optional ID of an existing meeting to resume
   *                         recording into. When provided, no new meeting is
   *                         created and the existing transcript is preserved —
   *                         new lines are simply appended to it.
   */
  async start(deviceId = 'default', meetingSource?: string, resumeMeetingId?: string): Promise<void> {
    const store = useAppStore.getState();
    const rate = parseInt(store.sampleRate) || 44100;
    this.sampleRate = rate;

    // Resume the existing meeting if one was specified and still exists;
    // otherwise fall back to creating a fresh meeting record.
    const existingMeeting = resumeMeetingId
      ? store.meetings.find((m) => m.id === resumeMeetingId)
      : undefined;

    const meetingId = existingMeeting
      ? existingMeeting.id
      : store.createMeetingForRecording(meetingSource);

    store.setActiveMeetingId(meetingId);
    store.setMeetingPreview(meetingId, 'Recording in progress…');

    useAppStore.setState({
      recordingStatus: 'recording',
      // Continue the on-screen timer from where it left off when resuming an
      // existing meeting; only reset to 0 for a brand-new meeting.
      recordingDuration: existingMeeting ? store.recordingDuration : 0,
      recordingFilePath: null,
    });

    try {
      // AudioCapture delivers volume level changes and raw PCM chunks.
      // Chunks are forwarded to TranscriptionManager — that is the ONLY transcription path.
      this.capture = new AudioCapture(
        rate,
        this.onVolumeChange,
        (chunk: Float32Array, speakerTrack?: SpeakerTrack, attribution?: AttributedSegment) => {
          // Feed raw audio chunk to TranscriptionManager with both the
          // legacy speaker track tag and the richer attribution segment
          // (source/speaker/confidence) from the Audio Source Attribution
          // layer — see AudioSourceAttribution.ts.
          TranscriptionManager.feedChunk(chunk, speakerTrack, attribution);
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
        recordingDuration: existingMeeting ? store.recordingDuration : 0,
      });
      // Only delete the meeting if we created it for this attempt — never
      // delete a pre-existing meeting the user was resuming into. This is a
      // permanent delete (not a move to Bin): the meeting never captured
      // any real content, so there's nothing worth keeping recoverable.
      if (!existingMeeting) {
        store.permanentlyDeleteMeeting(meetingId);
      }
      throw err;
    }
  }

  pause(): void {
    if (this.capture) {
      try {
        this.capture.pause();
      } catch (e) {
        console.warn('[RecordingController] pause error:', e);
      }
    }
    this.stopTimer();
    useAppStore.setState({ recordingStatus: 'paused' });
    try {
      TranscriptionManager.pause();
    } catch { /* ignore */ }
  }

  resume(): void {
    if (this.capture) {
      try {
        this.capture.resume();
      } catch (e) {
        console.warn('[RecordingController] resume error:', e);
      }
    }
    this.startTimer();
    useAppStore.setState({ recordingStatus: 'recording' });
    try {
      TranscriptionManager.resume();
    } catch { /* ignore */ }
  }

  async stop(): Promise<string | null> {
    this.stopTimer();

    // Immediately update UI to stopped state
    useAppStore.setState({ recordingStatus: 'stopped' });

    let samples: Float32Array;
    if (this.capture) {
      try {
        samples = this.capture.stop();
      } catch (e) {
        console.warn('[RecordingController] error stopping audio capture:', e);
        samples = new Float32Array(0);
      }
      this.capture = null;
    } else {
      samples = new Float32Array(0);
    }

    const wavBuffer = WaveFileWriter.writeWav(samples, this.sampleRate);
    const fileName = `meeting_${Date.now()}.wav`;
    let savedPath: string | null = null;

    try {
      if (window.electronAPI?.saveAudio) {
        savedPath = await window.electronAPI.saveAudio(fileName, wavBuffer);
      } else {
        savedPath = `recordings/${fileName}`;
      }
    } catch (err) {
      console.error('[RecordingController] Failed to save audio file:', err);
      savedPath = `recordings/${fileName}`;
    }

    try {
      const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      await TranscriptionManager.stop(wavBlob);
    } catch (err) {
      console.warn('[RecordingController] TranscriptionManager stop error:', err);
    }

    const finalStore = useAppStore.getState();
    if (finalStore.activeMeetingId) {
      try {
        finalStore.setMeetingDuration(
          finalStore.activeMeetingId,
          RecordingController.formatDuration(finalStore.recordingDuration)
        );

        const meeting = finalStore.meetings.find((m) => m.id === finalStore.activeMeetingId);
        const firstLine = meeting?.transcript[0]?.text;
        finalStore.setMeetingPreview(
          finalStore.activeMeetingId,
          firstLine ? firstLine.slice(0, 120) : 'No transcript captured. Click to add notes or generate a summary.'
        );
      } catch { /* ignore */ }
    }

    useAppStore.setState({
      recordingStatus: 'stopped',
      recordingFilePath: savedPath,
    });

    return savedPath;
  }

  setMicMuted(muted: boolean): void {
    if (this.capture) {
      this.capture.setMicMuted(muted);
    }
  }

  isMicMuted(): boolean {
    return this.capture ? this.capture.getMicMuted() : false;
  }

  cancel(): void {
    this.stopTimer();
    TranscriptionManager.cancel();

    if (this.capture) {
      this.capture.stop();
      this.capture = null;
    }

    const store = useAppStore.getState();
    if (store.activeMeetingId) {
      const activeMeeting = store.meetings.find((m) => m.id === store.activeMeetingId);
      if (activeMeeting && activeMeeting.preview === 'Recording in progress…') {
        store.setMeetingPreview(store.activeMeetingId, 'No summary generated yet.');
      }
    }

    useAppStore.setState({
      recordingStatus: 'idle',
      recordingDuration: 0,
      recordingFilePath: null,
    });
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = setInterval(() => {
      if (useAppStore.getState().recordingStatus === 'recording') {
        useAppStore.getState().incrementRecordingDuration();
      }
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
