import { useState, useEffect } from 'react';
import { Mic, Volume2, Square, Play, Pause, Circle, X, Check, Radio, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AudioManager } from '../services/audio/AudioManager';
import { POST_RECORDING_ONLY_PROVIDERS } from '../services/transcription/TranscriptionManager';

/**
 * AudioRecorder
 *
 * Handles microphone capture, pause/resume, and stop.
 * AI summary generation is intentionally NOT triggered here.
 * The user explicitly clicks "Generate AI Summary" in the workspace after recording.
 *
 * Displays:
 *  - Recording status + timer
 *  - Level visualizer (during recording)
 *  - Live transcription status badge (connecting / streaming / error)
 *  - Capability warning for providers without STT
 */
export const AudioRecorder = () => {
  const store = useAppStore();
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [mics, setMics] = useState<{ deviceId: string; label: string }[]>([]);

  const [controller] = useState(() =>
    AudioManager.getController((level: number) => {
      setVolumeLevel(level);
    })
  );

  useEffect(() => {
    AudioManager.listMicrophones().then((list) => {
      setMics(list);
      if (list.length > 0 && (!store.micDevice || store.micDevice === 'default')) {
        store.setMicDevice(list[0].deviceId);
      }
    });
  }, []);

  const handleStart = async () => {
    try {
      await controller.start(store.micDevice);
    } catch (err) {
      console.error('Audio capture permission rejected or failed:', err);
    }
  };

  const handlePause = () => controller.pause();
  const handleResume = () => controller.resume();

  const handleStop = async () => {
    await controller.stop();
    setVolumeLevel(0);
  };

  const handleCancel = () => {
    controller.cancel();
    setVolumeLevel(0);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        if (e.key === ' ') return;
      }

      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        if (store.recordingStatus === 'recording') handleStop();
        else if (store.recordingStatus === 'idle' || store.recordingStatus === 'stopped')
          handleStart();
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        if (store.recordingStatus === 'idle' || store.recordingStatus === 'stopped')
          handleStart();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (store.recordingStatus === 'recording' || store.recordingStatus === 'paused')
          handleCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store.recordingStatus, store.micDevice]);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const activeBars = Math.floor((volumeLevel / 100) * 12);

  // Transcription status label
  const transcriptionStatusBadge = () => {
    if (!store.capabilities.speech_to_text) return null;
    if (store.recordingStatus !== 'recording') return null;

    if (store.streamState === 'connecting') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider animate-pulse"
          style={{ color: 'var(--accent)' }}
        >
          <Radio className="w-3 h-3" /> Connecting…
        </span>
      );
    }
    if (store.streamState === 'connected' && store.transcriptionStatus !== 'error') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--success)' }}
        >
          <Radio className="w-3 h-3" /> Transcribing
        </span>
      );
    }
    if (store.transcriptionStatus === 'error') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--warning)' }}
        >
          <Radio className="w-3 h-3" /> Transcript error (recording continues)
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className="rounded-xl p-5 select-none space-y-4"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status indicator + timer */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {store.recordingStatus === 'recording' ? (
              <span className="relative flex h-3 w-3">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: 'var(--error)' }}
                />
                <span
                  className="relative inline-flex rounded-full h-3 w-3"
                  style={{ background: 'var(--error)' }}
                />
              </span>
            ) : store.recordingStatus === 'paused' ? (
              <div
                className="w-3 h-3 rounded-full animate-pulse"
                style={{ background: 'var(--warning)' }}
              />
            ) : (
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: 'var(--text-disabled)' }}
              />
            )}
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wider block"
                style={{ color: 'var(--text-muted)' }}
              >
                {store.recordingStatus === 'recording'
                  ? 'Recording Live'
                  : store.recordingStatus === 'paused'
                  ? 'Recording Paused'
                  : store.recordingStatus === 'stopped'
                  ? 'Session Concluded'
                  : 'Recorder Ready'}
              </span>
              {transcriptionStatusBadge()}
            </div>
            <span
              className="text-xl font-mono font-bold block"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatDuration(store.recordingDuration)}
            </span>
          </div>
        </div>

        {/* Level visualizer — only during recording */}
        {store.recordingStatus === 'recording' && (
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Level:
            </span>
            <div className="flex items-center gap-1 h-6">
              {Array.from({ length: 12 }).map((_, idx) => {
                const active = idx < activeBars;
                return (
                  <div
                    key={idx}
                    className={`w-1 rounded-full transition-all duration-75 ${active ? 'h-5' : 'h-2'}`}
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-hover)',
                      boxShadow: active ? '0 0 6px rgba(59,130,246,0.4)' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2">
          {store.recordingStatus === 'idle' || store.recordingStatus === 'stopped' ? (
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              style={{
                background: 'var(--error)',
                boxShadow: '0 1px 4px rgba(239,68,68,0.35)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Circle className="w-3.5 h-3.5 fill-current" />
              Record
            </button>
          ) : (
            <>
              {store.recordingStatus === 'recording' ? (
                <button
                  onClick={handlePause}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer mg-btn mg-btn-secondary"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer mg-btn mg-btn-secondary"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Resume
                </button>
              )}
              <button
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer mg-btn mg-btn-ghost"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </button>
              <button
                onClick={handleCancel}
                title="Discard Recording"
                className="inline-flex items-center justify-center p-2 rounded-lg cursor-pointer transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Device selection + system audio toggle */}
      <div
        className="pt-3 flex flex-wrap items-center justify-between gap-4"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <select
            value={store.micDevice}
            onChange={(e) => store.setMicDevice(e.target.value)}
            disabled={
              store.recordingStatus === 'recording' ||
              store.recordingStatus === 'paused'
            }
            className="mg-input text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minWidth: '180px', maxWidth: '260px' }}
          >
            {mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            System Audio
          </span>
          <button
            onClick={() => store.setSystemAudio(!store.systemAudio)}
            disabled={
              store.recordingStatus === 'recording' ||
              store.recordingStatus === 'paused'
            }
            className="w-7 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: store.systemAudio ? 'var(--accent)' : 'var(--bg-hover)',
              border: `1px solid ${store.systemAudio ? 'var(--accent)' : 'var(--border)'}`,
            }}
            role="switch"
            aria-checked={store.systemAudio}
          >
            <div
              className="bg-white w-3 h-3 rounded-full shadow-sm transition-transform duration-200"
              style={{ transform: store.systemAudio ? 'translateX(12px)' : 'translateX(0)' }}
            />
          </button>
        </div>
      </div>

      {/* WAV file saved banner */}
      {store.recordingFilePath && store.recordingStatus === 'stopped' && (
        <div
          className="p-3 text-xs rounded-lg font-medium flex items-center gap-2 select-text"
          style={{
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: 'var(--success)',
          }}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>
            Recording saved:{' '}
            <code className="font-mono text-[10px] break-all">{store.recordingFilePath}</code>
          </span>
        </div>
      )}

      {/* Post-recording transcription informational note */}
      {POST_RECORDING_ONLY_PROVIDERS.includes(store.sttProvider || store.provider) &&
        (store.recordingStatus === 'recording' || store.recordingStatus === 'stopped') && (
          <div
            className="p-3 text-xs rounded-lg font-medium flex items-center gap-2"
            style={{
              background: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              color: 'var(--text-primary)',
            }}
          >
            <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
            <span>
              {store.sttProvider || store.provider} transcribes audio with native speaker diarization once you stop the recording.
            </span>
          </div>
        )}
    </div>
  );
};
