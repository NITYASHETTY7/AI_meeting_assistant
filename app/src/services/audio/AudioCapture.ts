import { useAppStore } from '../../store/useAppStore';
import type { SpeakerTrack } from '../ai/AIProvider';
import { AudioSourceAttribution, type AttributedSegment } from './AudioSourceAttribution';

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
  /** Handle for the periodic background retry (see scheduleSystemAudioRetry) — cleared on stop(). */
  private systemAudioRetryTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * How many periodic background retries have been attempted so far this
   * recording. Capped (see MAX_PERIODIC_RETRIES in scheduleSystemAudioRetry)
   * so a machine where the underlying capture never works doesn't retry
   * forever — a few spaced-out attempts over the course of a recording is
   * enough to catch a transient GPU/driver hiccup clearing up without
   * spamming retries on hardware where the capture genuinely never works.
   */
  private systemAudioRetryCount: number = 0;
  private chunks: Float32Array[] = [];
  private sampleRate: number = 44100;
  private onVolumeChange?: (level: number) => void;
  private onAudioChunk?: (chunk: Float32Array, speakerTrack?: SpeakerTrack, attribution?: AttributedSegment) => void;
  private isPaused: boolean = false;
  private isMicMuted: boolean = false;
  private currentDeviceId: string = 'default';
  /** True once a mic track health issue (Bluetooth drop/profile switch) has been reported, until it recovers. */
  private micWarningActive: boolean = false;
  /**
   * Audio Source Attribution layer — deterministic source-to-speaker
   * mapping only (microphone → Speaker 1, system output → Speaker 2). No
   * correlation, no confidence scoring, no AI inference. See
   * AudioSourceAttribution.ts.
   */
  private attribution: AudioSourceAttribution = new AudioSourceAttribution();

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
   * requests echoCancellation/noiseSuppression/autoGainControl — this is
   * purely an AUDIO QUALITY measure (reduces the chance of a noisy/quiet
   * clip getting hallucinated into gibberish by the transcription model),
   * not a speaker-attribution mechanism. Speaker identity is decided
   * entirely by which stream a chunk came from (see AudioSourceAttribution),
   * never by analyzing whether echo cancellation caught anything.
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
    onAudioChunk?: (chunk: Float32Array, speakerTrack?: SpeakerTrack, attribution?: AttributedSegment) => void
  ) {
    this.sampleRate = sampleRate;
    this.onVolumeChange = onVolumeChange;
    this.onAudioChunk = onAudioChunk;
  }

  /**
   * Initializes input media streams (Microphone + System Output Loopback).
   *
   * Two independent sources are captured. Per the deterministic
   * architecture, source alone determines speaker — see
   * AudioSourceAttribution.ts. There is no speaker-detection step here.
   */
  async start(deviceId: string = 'default'): Promise<void> {
    this.chunks = [];
    this.isPaused = false;
    this.isMicMuted = useAppStore.getState().isMicMuted;
    this.currentDeviceId = deviceId;
    this.micWarningActive = false;
    this.systemAudioRetryCount = 0;
    useAppStore.getState().setMicDeviceWarning(null);
    useAppStore.getState().setMicAudioStatus('inactive');
    useAppStore.getState().setSystemAudioStatus('inactive');

    // 1. Microphone capture → Speaker 1, unconditionally.
    const micConstraints = { audio: this.buildMicAudioConstraints(deviceId) };
    this.micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
    this.attachMicTrackHealthMonitoring();
    useAppStore.getState().setMicAudioStatus('active');

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
        useAppStore.getState().setMicInputLevel(0);
        return;
      }

      // Cache samples into the master mix
      this.chunks.push(micCopy);

      // Deterministic: EVERY microphone chunk is Speaker 1. No correlation,
      // no bleed detection, no inference — see AudioSourceAttribution.ts.
      // A leaked copy of the remote participant's voice picked up by this
      // mic is still just microphone audio; the system-output stream is
      // already the authoritative source for Speaker 2, so this never
      // produces a second Speaker 2 utterance.
      const segment = this.attribution.attributeMicChunk(micCopy);

      if (this.onAudioChunk) {
        this.onAudioChunk(micCopy, 'You', segment);
      }

      // Calculate realtime RMS for volume visualizer / debug panel level meter
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i] * inputBuffer[i];
      }
      const rms = Math.sqrt(sum / inputBuffer.length);
      const volumeLevel = Math.min(100, Math.round(rms * 250));

      if (this.onVolumeChange) {
        this.onVolumeChange(volumeLevel);
      }
      useAppStore.getState().setMicInputLevel(volumeLevel);
    };

    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(this.audioContext.destination);

    // 3. System Output Loopback capture → Speaker 2, unconditionally.
    await this.startSystemAudioCapture();
  }

  /**
   * Acquires the system-output/loopback audio stream and wires it into the
   * audio graph. Every chunk from this stream is Speaker 2 — deterministic,
   * not inferred (see AudioSourceAttribution.ts). Retries once with a
   * freshly-acquired source if the first attempt's stream produces no real
   * signal within SYSTEM_AUDIO_SILENCE_CHECK_MS, since this is verifying
   * capture actually works, not making a speaker decision.
   *
   * Uses navigator.mediaDevices.getDisplayMedia() routed through the main
   * process's session.defaultSession.setDisplayMediaRequestHandler (see
   * electron/main.ts) — Electron's officially-documented pattern for
   * desktop audio loopback capture.
   *
   * If this never succeeds, setSystemAudioStatus('inactive') and
   * setSystemAudioCritical(true) are set so the app surfaces a visible
   * failure banner (per the critical-failure requirement) instead of
   * silently pretending two-source attribution is working when it isn't.
   */
  private async startSystemAudioCapture(attempt: 1 | 2 = 1): Promise<void> {
    const SYSTEM_AUDIO_SILENCE_CHECK_MS = 4000;
    const SYSTEM_AUDIO_MIN_RMS = 0.0005;

    try {
      if (!this.audioContext) return;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      } as DisplayMediaStreamOptions);

      // Immediately stop and release video tracks — we only capture system audio
      stream.getVideoTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
        stream.removeTrack(track);
      });

      if (stream.getAudioTracks().length === 0) {
        this.markSystemAudioUnavailable();
        return;
      }

      this.systemStream = stream;
      this.systemSource = this.audioContext.createMediaStreamSource(stream);
      this.systemProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Watchdog: verifies the stream actually carries real signal, not
      // just that getDisplayMedia() resolved without error (Chromium can
      // grant a track that carries no actual audio if the underlying
      // Windows Graphics Capture session fails to start). This is a
      // CAPTURE HEALTH check, not a speaker decision.
      let systemAudioSeenSignal = false;
      this.systemAudioCheckTimer = setTimeout(() => {
        if (systemAudioSeenSignal) return;

        this.teardownSystemAudio();

        if (attempt === 1) {
          console.warn(
            '[AudioCapture] System output loopback produced no signal in the first ' +
            `${SYSTEM_AUDIO_SILENCE_CHECK_MS}ms — retrying once with a fresh capture session.`
          );
          void this.startSystemAudioCapture(2);
          return;
        }

        console.warn(
          '[AudioCapture] System output loopback produced no signal after retrying — ' +
          'system audio capture is unavailable for this recording.'
        );
        this.markSystemAudioUnavailable();
        this.scheduleSystemAudioRetry();
      }, SYSTEM_AUDIO_SILENCE_CHECK_MS);

      this.systemProcessor.onaudioprocess = (e) => {
        if (this.isPaused) return;

        const inputBuffer = e.inputBuffer.getChannelData(0);
        const systemCopy = new Float32Array(inputBuffer);

        // Calculate level for the debug panel regardless of whether this
        // is the first-signal check, so the meter reflects real-time
        // output level once capture is confirmed working.
        let sum = 0;
        for (let i = 0; i < systemCopy.length; i++) {
          sum += systemCopy[i] * systemCopy[i];
        }
        const rms = Math.sqrt(sum / systemCopy.length);
        const levelPct = Math.min(100, Math.round(rms * 250));

        if (!systemAudioSeenSignal) {
          if (rms >= SYSTEM_AUDIO_MIN_RMS) {
            systemAudioSeenSignal = true;
            if (this.systemAudioCheckTimer) {
              clearTimeout(this.systemAudioCheckTimer);
              this.systemAudioCheckTimer = null;
            }
            useAppStore.getState().setSystemAudioStatus('active');
            useAppStore.getState().setSystemAudioCritical(false);
          }
        }
        useAppStore.getState().setSystemOutputLevel(levelPct);

        // Cache system audio in mix
        this.chunks.push(systemCopy);

        // Deterministic: EVERY system-output chunk is Speaker 2. No
        // correlation, no confidence scoring.
        const segment = this.attribution.attributeSystemChunk(systemCopy);

        if (this.onAudioChunk) {
          this.onAudioChunk(systemCopy, 'Speaker', segment);
        }
      };

      this.systemSource.connect(this.systemProcessor);
      this.systemProcessor.connect(this.audioContext.destination);
    } catch (err) {
      console.warn('[AudioCapture] System output loopback capture unavailable:', err);
      this.markSystemAudioUnavailable();
    }
  }

  /**
   * Marks system-output capture as confirmed unavailable: sets the debug
   * panel status to 'inactive', the level meter to 0, and flags the
   * critical-failure state so the UI shows the required banner ("System
   * audio capture unavailable. Two-speaker attribution cannot be
   * guaranteed.") instead of silently continuing as if nothing were wrong.
   */
  private markSystemAudioUnavailable(): void {
    useAppStore.getState().setSystemAudioStatus('inactive');
    useAppStore.getState().setSystemOutputLevel(0);
    useAppStore.getState().setSystemAudioCritical(true);
  }

  /**
   * Fully disconnects and stops the system-output loopback audio pipeline
   * so it can never emit another chunk until a subsequent capture attempt
   * succeeds. Called by the silence watchdog when the capture is confirmed
   * dead — leaving a non-functional pipeline connected risks it
   * occasionally passing the RMS floor with near-silent noise/hum and
   * producing garbled transcriptions.
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
   * Schedules one more attempt to re-acquire system-audio capture later in
   * the recording, after the initial attempt + retry have both failed.
   * This is purely a capture-reliability mitigation (verifying the stream
   * exists), not a speaker-attribution mechanism — if a later attempt
   * succeeds, the debug panel and critical-failure banner update
   * automatically via the same status setters used on first success.
   */
  private scheduleSystemAudioRetry(): void {
    const MAX_PERIODIC_RETRIES = 3;
    const RETRY_INTERVAL_MS = 30000;

    if (this.systemAudioRetryCount >= MAX_PERIODIC_RETRIES) return;
    this.systemAudioRetryCount++;

    this.systemAudioRetryTimer = setTimeout(() => {
      if (!this.audioContext || this.audioContext.state === 'closed') return;
      console.info(
        `[AudioCapture] Retrying system-audio capture in the background ` +
        `(attempt ${this.systemAudioRetryCount}/${MAX_PERIODIC_RETRIES})...`
      );
      void this.startSystemAudioCapture(1);
    }, RETRY_INTERVAL_MS);
  }

  /**
   * Monitors the active mic track for health issues that WASAPI surfaces as
   * "device invalidated" (Bluetooth mics: an audio profile switch — e.g.
   * A2DP <-> HFP — or a brief connection drop). When this happens, Chromium
   * either ends the track or reports it muted; without this listener, audio
   * silently degrades (or stops) with the VAD pipeline none the wiser.
   * Surfaces a warning immediately, and attempts a one-shot reacquisition
   * of the mic stream so recording can recover automatically once the OS
   * reconnects the device.
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
      useAppStore.getState().setMicAudioStatus('inactive');
      void this.attemptMicRecovery();
    };

    track.addEventListener('ended', () => reportIssue('ended'));
    track.addEventListener('mute', () => reportIssue('muted'));
    track.addEventListener('unmute', () => {
      if (!this.micWarningActive) return;
      this.micWarningActive = false;
      useAppStore.getState().setMicDeviceWarning(null);
      useAppStore.getState().setMicAudioStatus('active');
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
      useAppStore.getState().setMicAudioStatus('active');
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
    useAppStore.getState().setMicAudioStatus('inactive');
    useAppStore.getState().setSystemAudioStatus('inactive');
    useAppStore.getState().setMicInputLevel(0);
    useAppStore.getState().setSystemOutputLevel(0);
    useAppStore.getState().setSystemAudioCritical(false);

    if (this.systemAudioRetryTimer) {
      clearTimeout(this.systemAudioRetryTimer);
      this.systemAudioRetryTimer = null;
    }

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
