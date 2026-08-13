import { Calendar, Clock, Users, Check } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { QuickActionButton } from './QuickActionButton';

/**
 * UpcomingMeetingCard
 *
 * Shown on the Home dashboard above Recent Meeting Notes.
 * Two states:
 *   1. Calendar not connected — prompt to connect Google Calendar / Outlook.
 *   2. Calendar connected    — show next upcoming meeting.
 *
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const UpcomingMeetingCard = () => {
  const { calendarConnected, toggleCalendarConnected } = useAppStore();

  return (
    <div
      className="w-full rounded-xl p-6"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {!calendarConnected ? (
        /* ── Not connected ── */
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex gap-4">
            <div
              className="p-3 rounded-xl shrink-0"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h4
                className="text-sm font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Connect your calendar
              </h4>
              <p
                className="text-xs mt-1 max-w-md leading-relaxed"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Connect Google Calendar or Outlook to sync meetings automatically
                and generate smart summaries as soon as they start.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <QuickActionButton
              label="Google Calendar"
              variant="outline"
              onClick={toggleCalendarConnected}
              icon={
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.99 5.99 0 018 12.526a5.99 5.99 0 015.99-5.99c1.644 0 3.13.659 4.225 1.724l3.197-3.197C19.467 3.195 16.892 2 13.99 2 8.16 2 3.44 6.72 3.44 12.55s4.72 10.55 10.55 10.55c5.787 0 10.41-4.717 10.41-10.55 0-.7-.076-1.385-.22-2.04H12.24z" />
                </svg>
              }
            />
            <QuickActionButton
              label="Microsoft Outlook"
              variant="outline"
              onClick={toggleCalendarConnected}
              icon={
                <svg className="w-3.5 h-3.5" viewBox="0 0 23 23" fill="currentColor">
                  <path d="M0 0h10.9v10.9H0V0zm12.1 0H23v10.9H12.1V0zM0 12.1h10.9V23H0V12.1zm12.1 0H23V23H12.1V12.1z" />
                </svg>
              }
            />
          </div>
        </div>
      ) : (
        /* ── Connected — show next meeting ── */
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className="p-3 rounded-xl shrink-0"
              style={{
                background: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
              }}
            >
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                {/* "Next Up" chip */}
                <span
                  className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded"
                  style={{
                    background: 'var(--accent-subtle)',
                    color: 'var(--accent-light)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  Next Up
                </span>
                <span
                  className="text-xs font-semibold flex items-center gap-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Clock className="w-3 h-3" /> Starting in 12m
                </span>
              </div>
              <h4
                className="text-base font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Q3 Design Alignment Review
              </h4>
              <p
                className="text-xs mt-0.5 flex items-center gap-2"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <span>Today, 1:00 PM – 1:30 PM</span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> 4 participants
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <QuickActionButton
              label="Connected"
              variant="outline"
              disabled
              icon={<Check className="w-3.5 h-3.5" />}
              style={{
                color: 'var(--success)',
                borderColor: 'var(--success-border)',
                background: 'var(--success-bg)',
                cursor: 'default',
              }}
            />
            <QuickActionButton
              label="Disconnect"
              variant="outline"
              onClick={toggleCalendarConnected}
            />
          </div>
        </div>
      )}
    </div>
  );
};
