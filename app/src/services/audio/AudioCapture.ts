import { useAppStore } from '../../store/useAppStore';
import type { SpeakerTrack } from '../ai/AIProvider';

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private systemStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private systemSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private systemProcessor: ScriptProcessorNode | null = null;
  /** Handle for the system-audio silence watchdog timer — cleared on stop() so it never fires after a recording ends. */
  private systemAudioCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate: number = 44100;
  private onVolumeChange?: (level: number) => void;
  private onAudioChunk?: (chunk: Float32Array, speakerTrack?: SpeakerTrack) => void;
  private isPaused: boolean = false;
  private isMicMuted: boolean = false;
  private currentDeviceId: string = 'default';
  /** True once a mic track health issue (Bluetooth drop/profile switch) has been reported, until it recovers. */
  private micWarningActive: boolean = false;

  setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    if (muted && this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }

  getMicMuted(): boolean {
    return this.isMicMuted;
  }

  /**
   * Builds getUserMedia audio constraints for the mic track. Always
   * requests echoCancellation/noiseSuppression/autoGainControl (see the
   * comment in start() for why) regardless of which specific device is
   * selected.
   */
  private buildMicAudioConstraints(deviceId: string): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (deviceId !== 'default') {
      constraints.deviceId = { exact: deviceId };
    }
    return constraints;
  }

  constructor(
    sampleRate: number = 44100,
    onVolumeChange?: (level: number) => void,
    onAudioChunk?: (chunk: Float32Array, speakerTrack?: SpeakerTrack) => void
  ) {
    this.sampleRate = sampleRate;
    this.onVolumeChange = onVolumeChange;
    this.onAudioChunk = onAudioChunk;
  }

  /**
   * Initializes input media streams (Microphone + System Desktop Loopback)
   */
  async start(deviceId: string = 'default'): Promise<void> {
    this.chunks = [];
    this.isPaused = false;
    this.isMicMuted = useAppStore.getState().isMicMuted;
    this.currentDeviceId = deviceId;
    this.micWarningActive = false;
    useAppStore.getState().setMicDeviceWarning(null);

    // 1. Microphone capture (You)
    // Explicitly requesting echoCancellation is essential when this mic
    // stream runs alongside the desktop-loopback stream below: whatever the
    // other participant is saying is simultaneously playing out of this
    // machine's speakers, and without AEC the mic physically re-picks-up
    // that playback. That leaked audio then triggers the mic-side VAD track
    // and gets transcribed and tagged "You" even though it's the other
    // person's voice (and vice versa — a loud mic bleeding into the system
    // recording can get tagged "Others"). noiseSuppression/autoGainControl
    // are enabled too since they also reduce the chance of a noisy/quiet
    // clip getting hallucinated into gibberish by Whisper. Headphones avoid
    // this class of bleed entirely, but AEC meaningfully reduces it for
    // users on speakers.
    const micConstraints = { audio: this.buildMicAudioConstraints(deviceId) };
    this.micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
    this.attachMicTrackHealthMonitoring();

    // 2. Instantiate AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({
      sampleRate: this.sampleRate
    });

    this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
    this.micProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.micProcessor.onaudioprocess = (e) => {
      if (this.isPaused) return;

      const inputBuffer = e.inputBuffer.getChannelData(0);
      const micCopy = new Float32Array(inputBuffer);

      const isMuted = this.isMicMuted || useAppStore.getState().isMicMuted;
      if (isMuted) {
        if (this.onVolumeChange) {
          this.onVolumeChange(0);
        }
        return;
      }

      // Cache samples into the master mix
      this.chunks.push(micCopy);

      // Feed to live transcription tagged as "You"
      if (this.onAudioChunk) {
        this.onAudioChunk(micCopy, 'You');
      }

      // Calculate realtime RMS for volume visualizer
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i] * inputBuffer[i];
      }
      const rms = Math.sqrt(sum / inputBuffer.length);
      const volumeLevel = Math.min(100, Math.round(rms * 250));

      if (this.onVolumeChange) {
        this.onVolumeChange(volumeLevel);
      }
    };

    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(this.audioContext.destination);

    // 3. Desktop Loopback capture (Other Participants / Speakers)
    try {
      if (window.electronAPI?.getDesktopSources) {
        const sources = await window.electronAPI.getDesktopSources();
        if (sources.length > 0) {
          const primarySource = sources[0];
          this.systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: primarySource.id,
              }
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: primarySource.id,
                minWidth: 1,
                maxWidth: 1,
                minHeight: 1,
                maxHeight: 1,
                maxFrameRate: 1,
              }
            } as any
          });

          // Immediately stop and release video tracks — we only capture system audio
          this.systemStream.getVideoTracks().forEach((track) => {
            track.enabled = false;
            track.stop();
          });

          if (this.systemStream.getAudioTracks().length > 0) {
            this.systemSource = this.audioContext.createMediaStreamSource(this.systemStream);
            this.systemProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

            // Watchdog: Chromium can grant a system-audio getUserMedia call
            // successfully (no error, real audio track) while that track
            // carries no actual signal — this happens when the desktop
            // source picked is a window rather than a screen, or (as seen
            // in practice) the Windows Graphics Capture session backing the
            // "screen" source itself times out getting its first frame
            // ("wgc_capture_session ... Timed out ... GetFrame failed").
            // Previously this only logged a warning and left the dead
            // pipeline running — a dead-but-connected system track can
            // still occasionally pass the VAD's RMS floor with near-silent
            // noise/hum, producing garbled duplicate transcriptions of
            // whatever the mic is currently picking up (the actual bug
            // being fixed here: near-identical text appearing under both
            // "You" and "Others" at the same timestamp). Now it fully tears
            // the system pipeline down on timeout so a non-functional
            // capture can never emit another chunk, rather than just
            // warning while it keeps running.
            const SYSTEM_AUDIO_SILENCE_CHECK_MS = 4000;
            const SYSTEM_AUDIO_MIN_RMS = 0.0005;
            let systemAudioSeenSignal = false;
            this.systemAudioCheckTimer = setTimeout(() => {
              if (!systemAudioSeenSignal) {
                console.warn(
                  '[AudioCapture] System/desktop audio loopback produced no signal in the first ' +
                  `${SYSTEM_AUDIO_SILENCE_CHECK_MS}ms — disabling system audio capture for this recording. ` +
                  'The other participant\'s voice will only be picked up by the mic and may be ' +
                  'misattributed to "You". This usually means the screen-capture session failed to start ' +
                  '(seen as a WGC "GetFrame failed" error in the Electron console) or the current audio ' +
                  'output device does not support loopback capture.'
                );
                useAppStore.getState().setSystemAudioWarning(
                  'Could not capture system audio (the other participant\'s voice) for this recording — ' +
                  'disabled to avoid duplicate/garbled transcript lines. Try restarting the recording, or ' +
                  'check that desktop audio loopback is available on this device.'
                );
                this.teardownSystemAudio();
              }
            }, SYSTEM_AUDIO_SILENCE_CHECK_MS);

            this.systemProcessor.onaudioprocess = (e) => {
              if (this.isPaused) return;

              const inputBuffer = e.inputBuffer.getChannelData(0);
              const systemCopy = new Float32Array(inputBuffer);

              if (!systemAudioSeenSignal) {
                let sum = 0;
                for (let i = 0; i < systemCopy.length; i++) {
                  sum += systemCopy[i] * systemCopy[i];
                }
                const rms = Math.sqrt(sum / systemCopy.length);
                if (rms >= SYSTEM_AUDIO_MIN_RMS) {
                  systemAudioSeenSignal = true;
                  if (this.systemAudioCheckTimer) {
                    clearTimeout(this.systemAudioCheckTimer);
                    this.systemAudioCheckTimer = null;
                  }
                  useAppStore.getState().setSystemAudioWarning(null);
                }
              }

              // Cache system audio in mix
              this.chunks.push(systemCopy);

              // Feed to live transcription tagged as "Speaker"
              if (this.onAudioChunk) {
                this.onAudioChunk(systemCopy, 'Speaker');
              }
            };

            this.systemSource.connect(this.systemProcessor);
            this.systemProcessor.connect(this.audioContext.destination);
          }
        } else {
          console.warn('[AudioCapture] No desktop/screen audio sources available — system audio ("Speaker") capture is disabled for this recording.');
          useAppStore.getState().setSystemAudioWarning(
            'No system audio source was available for this recording. The other participant\'s voice may be misattributed to "You".'
          );
        }
      }
    } catch (err) {
      console.warn('[AudioCapture] Desktop audio loopback capture unavailable (using mic only):', err);
      useAppStore.getState().setSystemAudioWarning(
        'Could not capture system audio for this recording. The other participant\'s voice may be misattributed to "You".'
      );
    }
  }

  /**
   * Fully disconnects and stops the system/desktop-loopback audio pipeline
   * so it can never emit another chunk for the remainder of this recording.
   * Called by the silence watchdog when the capture is confirmed dead —
   * leaving a non-functional pipeline connected risks it occasionally
   * passing the VAD's RMS floor with near-silent noise/hum and producing
   * garbled duplicate transcriptions tagged "Speaker"/"Others".
   */
  private teardownSystemAudio(): void {
    if (this.systemAudioCheckTimer) {
      clearTimeout(this.systemAudioCheckTimer);
      this.systemAudioCheckTimer = null;
    }
    try {
      if (this.systemProcessor) {
        this.systemProcessor.onaudioprocess = null;
        this.systemProcessor.disconnect();
      }
    } catch { /* ignore */ }
    try {
      this.systemSource?.disconnect();
    } catch { /* ignore */ }
    try {
      this.systemStream?.getTracks().forEach((track) => track.stop());
    } catch { /* ignore */ }
    this.systemProcessor = null;
    this.systemSource = null;
    this.systemStream = null;
  }

  /**
   * Monitors the active mic track for health issues that WASAPI surfaces as
   * "device invalidated" (Bluetooth mics: an audio profile switch — e.g.
   * A2DP <-> HFP — or a brief connection drop). When this happens, Chromium
   * either ends the track or reports it muted; without this listener, audio
   * silently degrades (or stops) with the VAD pipeline none the wiser,
   * which is exactly what produces less accurate voice detection during a
   * Bluetooth mic session. Surfaces a warning immediately, and attempts a
   * one-shot reacquisition of the mic stream so recording can recover
   * automatically once the OS reconnects the device.
   */
  private attachMicTrackHealthMonitoring(): void {
    const track = this.micStream?.getAudioTracks()[0];
    if (!track) return;

    const reportIssue = (reason: string) => {
      if (this.micWarningActive) return;
      this.micWarningActive = true;
      console.warn(`[AudioCapture] Mic track health issue (${reason}) — likely a Bluetooth device profile switch or drop.`);
      useAppStore.getState().setMicDeviceWarning(
        'Microphone connection interrupted (common with Bluetooth mics switching audio modes). ' +
        'Voice detection may be less accurate until it reconnects.'
      );
      void this.attemptMicRecovery();
    };

    track.addEventListener('ended', () => reportIssue('ended'));
    track.addEventListener('mute', () => reportIssue('muted'));
    track.addEventListener('unmute', () => {
      if (!this.micWarningActive) return;
      this.micWarningActive = false;
      useAppStore.getState().setMicDeviceWarning(null);
      console.info('[AudioCapture] Mic track recovered.');
    });
  }

  /**
   * One-shot attempt to reacquire the mic stream and reconnect it into the
   * existing audio graph after a track health issue. Does not retry
   * repeatedly — if this fails, the visible warning remains so the user
   * knows to check their Bluetooth connection rather than the app silently
   * looping reconnection attempts.
   */
  private async attemptMicRecovery(): Promise<void> {
    if (!this.audioContext || this.audioContext.state === 'closed') return;

    try {
      const micConstraints = { audio: this.buildMicAudioConstraints(this.currentDeviceId) };
      const newStream = await navigator.mediaDevices.getUserMedia(micConstraints);

      try {
        this.micSource?.disconnect();
        this.micStream?.getTracks().forEach((t) => t.stop());
      } catch { /* ignore cleanup errors */ }

      this.micStream = newStream;
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
      if (this.micProcessor) {
        this.micSource.connect(this.micProcessor);
      }
      this.attachMicTrackHealthMonitoring();

      this.micWarningActive = false;
      useAppStore.getState().setMicDeviceWarning(null);
      console.info('[AudioCapture] Mic stream reacquired successfully after health issue.');
    } catch (err) {
      console.warn('[AudioCapture] Automatic mic recovery failed — leaving warning visible:', err);
      // Leave micDeviceWarning set — user needs to check their Bluetooth
      // connection or manually reselect the mic in Settings.
    }
  }

  /**
   * Pauses sample recording triggers.
   */
  pause(): void {
    this.isPaused = true;
    if (this.onVolumeChange) {
      this.onVolumeChange(0);
    }
  }

  /**
   * Resumes sample recording triggers.
   */
  resume(): void {
    this.isPaused = false;
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  /**
   * Disconnects nodes, closes audio context streams, and flattens buffer array.
   */
  stop(): Float32Array {
    this.isPaused = false;
    this.micWarningActive = false;
    useAppStore.getState().setMicDeviceWarning(null);

    try {
      if (this.micProcessor) {
        this.micProcessor.onaudioprocess = null;
        this.micProcessor.disconnect();
      }
    } catch { /* ignore */ }

    try {
      if (this.systemProcessor) {
        this.systemProcessor.onaudioprocess = null;
        this.systemProcessor.disconnect();
      }
    } catch { /* ignore */ }

    if (this.systemAudioCheckTimer) {
      clearTimeout(this.systemAudioCheckTimer);
      this.systemAudioCheckTimer = null;
    }
    useAppStore.getState().setSystemAudioWarning(null);

    try {
      if (this.micSource) {
        this.micSource.disconnect();
      }
    } catch { /* ignore */ }

    try {
      if (this.systemSource) {
        this.systemSource.disconnect();
      }
    } catch { /* ignore */ }

    try {
      if (this.micStream) {
        this.micStream.getTracks().forEach((track) => track.stop());
      }
    } catch { /* ignore */ }

    try {
      if (this.systemStream) {
        this.systemStream.getTracks().forEach((track) => track.stop());
      }
    } catch { /* ignore */ }

    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
      }
    } catch { /* ignore */ }

    this.micProcessor = null;
    this.systemProcessor = null;
    this.micSource = null;
    this.systemSource = null;
    this.micStream = null;
    this.systemStream = null;
    this.audioContext = null;

    this.micProcessor = null;
    this.systemProcessor = null;
    this.micSource = null;
    this.systemSource = null;
    this.micStream = null;
    this.systemStream = null;
    this.audioContext = null;

    // Concatenate chunks
    let totalLength = 0;
    for (const chunk of this.chunks) {
      totalLength += chunk.length;
    }

    const flatSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      flatSamples.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    return flatSamples;
  }
}
