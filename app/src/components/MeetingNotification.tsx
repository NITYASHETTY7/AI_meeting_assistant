import { useEffect, useRef, useState } from 'react';
import { Mic, X, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { AudioManager } from '../services/audio/AudioManager';

/**
 * MeetingNotification
 *
 * Renders a lightweight in-app banner when a meeting is detected.
 * Granola-style: subtle, non-blocking, bottom-right anchored.
 *
 * ── BEHAVIOUR ─────────────────────────────────────────────────────────────
 *  - Appears with a slide-up animation when a meeting is detected.
 *  - "Start Recording" navigates to /meeting, creates a new meeting record,
 *    and immediately begins audio capture + live transcription.
 *  - "Not Now" dismisses the banner for this specific meeting ID.
 *    The same meeting will NOT prompt again in this session.
 *  - Auto-dismisses when recording becomes active.
 *  - Also triggers a native OS notification (via MeetingDetectionService)
 *    so the user is alerted even when the app isn't focused.
 *
 * ── BRANDING ──────────────────────────────────────────────────────────────
 *  Every platform uses the same app accent colour — the notification always
 *  looks like it belongs to Mirai Granola, not the detected meeting platform.
 */


export const MeetingNotification = () => {
  const {
    detectedMeeting,
    isMeetingNotificationVisible,
    dismissDetectedMeeting,
    setMeetingNotificationVisible,
    recordingStatus,
    micDevice,
  } = useAppStore();

  const [isExiting, setIsExiting] = useState(false);
  const [controller] = useState(() => AudioManager.getController(() => {}));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // ── Auto-dismiss when recording goes live ─────────────────────────────────
  useEffect(() => {
    if (recordingStatus === 'recording' || recordingStatus === 'paused') {
      if (isMeetingNotificationVisible) triggerExit();
    }
  }, [recordingStatus, isMeetingNotificationVisible]);

  // ── Reset exit state when a new notification appears ─────────────────────
  useEffect(() => {
    if (isMeetingNotificationVisible) setIsExiting(false);
  }, [isMeetingNotificationVisible, detectedMeeting?.id]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const triggerExit = () => {
    setIsExiting(true);
    timerRef.current = setTimeout(() => setMeetingNotificationVisible(false), 280);
  };

  const handleStartRecording = async () => {
    if (!detectedMeeting) return;
    // Dismiss first so the banner is gone before recording state propagates
    dismissDetectedMeeting(detectedMeeting.id);
    // Navigate to the meeting workspace immediately
    navigate('/meeting');
    useAppStore.getState().setRecordingStartError(null);
    try {
      // RecordingController.start() creates a new meeting record via
      // createMeetingForRecording(source) and begins audio capture + transcription.
      // On failure it now rolls back the meeting/status itself (see
      // RecordingController.ts) — this catch only needs to surface the
      // error, since navigate() already happened before it could be caught.
      await controller.start(micDevice || 'default', detectedMeeting.source);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording.';
      console.error('[MeetingNotification] Failed to start recording:', err);
      useAppStore.getState().setRecordingStartError(message);
    }
  };

  const handleNotNow = () => {
    if (!detectedMeeting) return;
    dismissDetectedMeeting(detectedMeeting.id);
  };

  if (!isMeetingNotificationVisible || !detectedMeeting) return null;

  // Every platform now uses the same transparent light red treatment —
  // the notification should look like Mirai Granola, not carry each
  // meeting platform's own brand colour.
  const accentLineStyle = { background: 'var(--error)' };
  const iconBg = 'var(--error-bg)';
  const iconBorder = 'var(--error-border)';

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-50 pointer-events-none
        transition-all ease-out
        ${isExiting ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}
      `}
      style={{ transitionDuration: '280ms' }}
      role="alertdialog"
      aria-live="polite"
      aria-label="Meeting detected"
    >
      <div
        className="pointer-events-auto w-[340px] rounded-xl overflow-hidden mg-glass"
      >
        {/* Top accent line */}
        <div className="h-0.5" style={accentLineStyle} />

        <div className="px-4 py-4">
          {/* ── Header row ── */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Platform icon */}
              <div
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: iconBg,
                  border: `1px solid ${iconBorder}`,
                  color: 'var(--error)',
                }}
              >
                <Video className="w-3.5 h-3.5" />
              </div>

              <div className="min-w-0">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Meeting Detected
                </p>
                <p
                  className="text-xs font-semibold truncate leading-tight mt-0.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {detectedMeeting.source}
                </p>
              </div>
            </div>

            {/* Dismiss × */}
            <button
              onClick={handleNotNow}
              className="shrink-0 p-1 rounded transition-colors cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Meeting label (window title snippet) */}
          <p
            className="text-xs leading-snug mb-3 truncate"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {detectedMeeting.label}
          </p>

          {/* Prompt text */}
          <p
            className="text-sm font-semibold mb-4 leading-snug"
            style={{ color: 'var(--text-primary)' }}
          >
            Start taking notes for this meeting?
          </p>

          {/* ── Actions ── */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartRecording}
              className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity cursor-pointer"
              style={{
                background: 'var(--error)',
                boxShadow: '0 1px 6px rgba(239, 68, 68, 0.35)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Mic className="w-3.5 h-3.5" />
              Start Recording
            </button>
            <button
              onClick={handleNotNow}
              className="mg-btn mg-btn-ghost"
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingNotification;
