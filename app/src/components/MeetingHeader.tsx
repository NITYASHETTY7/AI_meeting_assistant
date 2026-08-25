import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Users, Edit2, Check,
  Mic, MicOff, Volume2, Square, Play, Pause, Circle, X,
  ShieldAlert, Radio, Settings2,
} from 'lucide-react';
import { useAppStore, type Meeting } from '../store/useAppStore';
import { AudioManager } from '../services/audio/AudioManager';
import { resolveDisplayDuration } from '../services/meetingDuration';

interface MeetingHeaderProps {
  meeting: Meeting;
}

/**
 * MeetingHeader
 *
 * Left side:
 *   - Inline-editable meeting title
 *   - Metadata row (date · participants)
 *
 * Right side (recording controls):
 *   - Idle:     status dot + [ ● Start Recording ] + mic settings icon
 *   - Recording: red dot (pulsing) + HH:MM:SS timer + [ Pause ] [ Stop ] + X
 *   - Paused:    amber dot + HH:MM:SS timer + [ Resume ] [ Stop ] + X
 *
 * Mic settings popover:
 *   - Opens on click of the gear/mic icon
 *   - Contains: microphone selector, system audio toggle
 *   - Closes on click-outside or Escape
 *
 * Timer ticks every second. Never resets on pause. Continues from stored duration.
 */
export const MeetingHeader = ({ meeting }: MeetingHeaderProps) => {
  // ── Title editing ────────────────────────────────────────────────────────
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(meeting.title);

  useEffect(() => { setTitleInput(meeting.title); }, [meeting.id, meeting.title]);

  const handleSave = () => {
    setIsEditing(false);
    if (titleInput.trim()) {
      useAppStore.setState((state) => ({
        meetings: state.meetings.map((m) =>
          m.id === meeting.id ? { ...m, title: titleInput.trim() } : m
        ),
      }));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') { setTitleInput(meeting.title); setIsEditing(false); }
  };

  // ── Recording state ──────────────────────────────────────────────────────
  const store = useAppStore();
  // volumeLevel used only to reset the AudioManager visualiser on stop/cancel
  const [, setVolumeLevel] = useState(0);
  const [mics, setMics] = useState<{ deviceId: string; label: string }[]>([]);
  const [showMicPopover, setShowMicPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const micBtnRef = useRef<HTMLButtonElement>(null);

  const [controller] = useState(() =>
    AudioManager.getController((level: number) => setVolumeLevel(level))
  );

  // Load mic list on mount
  useEffect(() => {
    AudioManager.listMicrophones().then((list) => {
      setMics(list);
      if (list.length > 0 && (!store.micDevice || store.micDevice === 'default')) {
        store.setMicDevice(list[0].deviceId);
      }
    });
  }, []);

  // Close popover on click-outside
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        showMicPopover &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        micBtnRef.current &&
        !micBtnRef.current.contains(e.target as Node)
      ) {
        setShowMicPopover(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMicPopover(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey as unknown as EventListener);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey as unknown as EventListener);
    };
  }, [showMicPopover]);

  // Keyboard shortcuts (mirror AudioRecorder)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.getAttribute('contenteditable') === 'true') return;
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        if (store.recordingStatus === 'recording') void handleStop();
        else if (store.recordingStatus === 'idle' || store.recordingStatus === 'stopped') void handleStart();
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        if (store.recordingStatus === 'idle' || store.recordingStatus === 'stopped') void handleStart();
      } else if (e.key === 'Escape') {
        if (store.recordingStatus === 'recording' || store.recordingStatus === 'paused') handleCancel();
      }
    };
    window.addEventListener('keydown', onKey as unknown as EventListener);
    return () => window.removeEventListener('keydown', onKey as unknown as EventListener);
  }, [store.recordingStatus, store.micDevice]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async () => {
    setStartError(null);

    // Pre-flight: block recording if no API key is configured for the active
    // provider. Without this, recording "succeeds" silently but transcription
    // fails on every batch with an opaque "Transcript error" and no explanation.
    const hasKey = Boolean(store.apiKeys[store.provider]?.trim()) || store.savedKeyProviders.has(store.provider);
    if (!hasKey) {
      setStartError(
        `No API key configured for ${store.provider}. Add one in Settings before recording.`
      );
      return;
    }
    if (store.capabilities.speech_to_text && !store.model) {
      setStartError(
        `No model selected for ${store.provider}. Go to Settings and click "Test Connection" to load available models.`
      );
      return;
    }

    try {
      await controller.start(store.micDevice, undefined, meeting.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording.';
      console.error('Audio capture failed:', err);
      setStartError(message);
    }
  };

  const handlePause  = () => controller.pause();
  const handleResume = () => controller.resume();

  const handleStop = async () => {
    await controller.stop();
    setVolumeLevel(0);
  };

  const handleCancel = () => {
    controller.cancel();
    setVolumeLevel(0);
  };

  // ── Timer formatting — HH:MM:SS ───────────────────────────────────────────
  const formatTimer = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Transcription status badge ────────────────────────────────────────────
  const transcriptionBadge = () => {
    if (!store.capabilities.speech_to_text || store.recordingStatus !== 'recording') return null;
    if (store.streamState === 'connecting')
      return <span className="text-[10px] font-semibold flex items-center gap-1 animate-pulse" style={{ color: 'var(--accent)' }}><Radio className="w-3 h-3" />Connecting…</span>;
    if (store.streamState === 'connected' && store.transcriptionStatus !== 'error')
      return <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'var(--success)' }}><Radio className="w-3 h-3" />Live</span>;
    if (store.transcriptionStatus === 'error')
      return (
        <span
          className="text-[10px] font-semibold flex items-center gap-1 cursor-default"
          style={{ color: 'var(--warning)' }}
          title={store.lastTranscriptionError || 'Transcription failed. Recording continues.'}
        >
          <Radio className="w-3 h-3" />Transcript error
        </span>
      );
    return null;
  };

  // ── Status dot ─────────────────────────────────────────────────────────────
  const StatusDot = () => {
    if (store.recordingStatus === 'recording') {
      return (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--error)' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--error)' }} />
        </span>
      );
    }
    if (store.recordingStatus === 'paused') {
      return <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--warning)' }} />;
    }
    return <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--text-disabled)' }} />;
  };

  return (
    <>
    <div
      className="flex items-start justify-between gap-6 pb-5 select-none flex-wrap"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* ── Left: Title + Metadata ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className="flex items-center gap-2 group">
          {isEditing ? (
            <div className="flex items-center gap-1.5 w-full max-w-xl">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="mg-input text-2xl font-bold"
                autoFocus
              />
              <button
                onClick={handleSave}
                className="p-2 rounded cursor-pointer transition-colors shrink-0"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--success)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                {meeting.title || 'Untitled Note'}
              </h2>
              <button
                onClick={() => setIsEditing(true)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all duration-200 cursor-pointer shrink-0"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                title="Rename note"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
          <span className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            {meeting.date} at {meeting.time} (
            {store.recordingStatus === 'recording' || store.recordingStatus === 'paused'
              ? formatTimer(store.recordingDuration)
              : resolveDisplayDuration(meeting)}
            )
          </span>
          <span className="hidden sm:inline" style={{ color: 'var(--text-disabled)' }}>•</span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Participants:</span>{' '}
            {(() => {
              const set = new Set<string>(meeting.participants && meeting.participants.length > 0 ? meeting.participants : ['You']);
              if (meeting.transcript) {
                meeting.transcript.forEach((t) => {
                  // Deterministic per AudioSourceAttribution.ts: microphone
                  // -> Speaker 1 (You), system output -> Speaker 2 (Other Participant).
                  if (t.attributionSpeaker === 'Speaker 2') {
                    set.add('Other Participant');
                  } else if (t.attributionSpeaker === 'Speaker 1') {
                    set.add('You');
                  } else if (t.speaker) {
                    set.add(t.speaker === 'Speaker' ? 'Other Participant' : t.speaker);
                  }
                });
              }
              return Array.from(set).join(', ');
            })()}
          </span>
        </div>
      </div>

      {/* ── Right: Recording controls ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0 pt-1">

        {/* Non-STT warning tooltip */}
        {!store.capabilities.speech_to_text &&
          (store.recordingStatus === 'recording' || store.recordingStatus === 'paused') && (
          <span
            title={`${store.provider} does not support live transcription. Recording continues — generate summary after stopping.`}
            className="cursor-default"
          >
            <ShieldAlert className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
          </span>
        )}

        {/* Mic device health warning (e.g. Bluetooth profile switch/drop) */}
        {store.micDeviceWarning && (store.recordingStatus === 'recording' || store.recordingStatus === 'paused') && (
          <span
            title={store.micDeviceWarning}
            className="cursor-default flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: 'var(--warning)' }}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Mic issue
          </span>
        )}


        {/* Status dot + transcription badge (while active) */}
        {(store.recordingStatus === 'recording' || store.recordingStatus === 'paused') && (
          <div className="flex items-center gap-1.5">
            <StatusDot />
            {transcriptionBadge()}
          </div>
        )}

        {/* Timer — shown while recording or paused */}
        {(store.recordingStatus === 'recording' || store.recordingStatus === 'paused') && (
          <span
            className="font-mono font-bold text-sm tabular-nums"
            style={{ color: 'var(--text-primary)', letterSpacing: '0.02em' }}
          >
            {formatTimer(store.recordingDuration)}
          </span>
        )}

        {/* ── Controls ── */}
        {store.recordingStatus === 'idle' || store.recordingStatus === 'stopped' ? (
          <button
            onClick={() => handleStart()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all text-white shadow-sm hover:shadow-md"
            style={{
              background: 'var(--accent)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <Circle className="w-3.5 h-3.5 fill-current" />
            <span>Start Recording</span>
          </button>
        ) : (
          <>
            {/* Pause / Resume */}
            {store.recordingStatus === 'recording' ? (
              <button onClick={handlePause} className="mg-btn mg-btn-secondary text-xs">
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            ) : (
              <button onClick={handleResume} className="mg-btn mg-btn-secondary text-xs">
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume
              </button>
            )}

            {/* In-App Mic Mute / Unmute Button */}
            <button
              onClick={() => store.toggleMicMute()}
              title={
                store.isMicMuted
                  ? 'Mic is muted — click to unmute'
                  : 'Mute your microphone (keeps recording other participants)'
              }
              className={`mg-btn text-xs ${
                store.isMicMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                  : 'mg-btn-secondary'
              }`}
            >
              {store.isMicMuted ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Mute</span>
                </>
              )}
            </button>

            {/* Stop */}
            <button onClick={handleStop} className="mg-btn mg-btn-ghost text-xs">
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>

            {/* Discard × */}
            <button
              onClick={handleCancel}
              title="Discard recording"
              className="p-2 rounded-lg cursor-pointer transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* ── Mic settings popover trigger ─────────────────────────────── */}
        <div className="relative">
          <button
            ref={micBtnRef}
            onClick={() => setShowMicPopover((v) => !v)}
            title="Microphone settings"
            className="p-2 rounded-lg cursor-pointer transition-colors"
            style={{
              color: showMicPopover ? 'var(--accent)' : 'var(--text-muted)',
              background: showMicPopover ? 'var(--accent-subtle)' : 'transparent',
              border: `1px solid ${showMicPopover ? 'var(--accent-border)' : 'transparent'}`,
            }}
            onMouseEnter={(e) => {
              if (!showMicPopover) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              if (!showMicPopover) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
            }}
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>

          {/* ── Popover ───────────────────────────────────────────────── */}
          {showMicPopover && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-2 w-72 rounded-xl z-50"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-strong)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {/* Popover header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Recording Settings
                </span>
                <button
                  onClick={() => setShowMicPopover(false)}
                  className="p-0.5 rounded cursor-pointer transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Microphone selection */}
                <div className="space-y-1.5">
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Microphone
                  </label>
                  <select
                    value={store.micDevice}
                    onChange={(e) => store.setMicDevice(e.target.value)}
                    disabled={store.recordingStatus === 'recording' || store.recordingStatus === 'paused'}
                    className="mg-input text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mics.length > 0 ? (
                      mics.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                      ))
                    ) : (
                      <option value="default">Default Microphone</option>
                    )}
                  </select>
                  {(store.recordingStatus === 'recording' || store.recordingStatus === 'paused') && (
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Stop recording to change microphone.
                    </p>
                  )}
                </div>

                {/* System Audio toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>System Audio</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Capture speaker output</p>
                    </div>
                  </div>
                  <button
                    onClick={() => store.setSystemAudio(!store.systemAudio)}
                    disabled={store.recordingStatus === 'recording' || store.recordingStatus === 'paused'}
                    className="w-8 h-4.5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: store.systemAudio ? 'var(--accent)' : 'var(--bg-hover)',
                      border: `1px solid ${store.systemAudio ? 'var(--accent)' : 'var(--border)'}`,
                      width: '28px',
                      height: '16px',
                    }}
                    role="switch"
                    aria-checked={store.systemAudio}
                  >
                    <div
                      className="bg-white rounded-full shadow-sm transition-transform duration-200"
                      style={{
                        width: '12px',
                        height: '12px',
                        transform: store.systemAudio ? 'translateX(12px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>

                {/* Recording Quality — real setting, editable in Settings */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Recording Quality</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {store.quality === 'high' ? 'High' : store.quality === 'medium' ? 'Medium' : 'Low'} · {(parseInt(store.sampleRate) / 1000).toFixed(1)} kHz
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowMicPopover(false); navigate('/settings?tab=recording'); }}
                    className="text-[10px] font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    Change in Settings
                  </button>
                </div>

                {/* Sample Rate — real setting, editable in Settings */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Sample Rate</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{store.sampleRate} Hz</p>
                  </div>
                  <button
                    onClick={() => { setShowMicPopover(false); navigate('/settings?tab=recording'); }}
                    className="text-[10px] font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    Change in Settings
                  </button>
                </div>
              </div>

              {/* Saved WAV path (if recording stopped) */}
              {store.recordingFilePath && store.recordingStatus === 'stopped' && (
                <div
                  className="px-4 pb-4"
                >
                  <div
                    className="p-2.5 text-[11px] rounded-lg flex items-start gap-2"
                    style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success)' }}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <code className="font-mono text-[10px] break-all leading-relaxed">{store.recordingFilePath}</code>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {(startError || store.recordingStartError) && (
      <div
        className="mt-3 px-3.5 py-2.5 rounded-lg flex items-start gap-2 text-xs font-medium"
        style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error)' }}
      >
        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span className="flex-1">{startError || store.recordingStartError}</span>
        <button
          onClick={() => { setStartError(null); store.setRecordingStartError(null); }}
          className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    )}
    </>
  );
};
