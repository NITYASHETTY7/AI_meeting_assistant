import { Activity, Clock } from 'lucide-react';
import type { Meeting } from '../store/useAppStore';

interface TimelinePanelProps {
  meeting: Meeting;
}

/**
 * TimelinePanel
 *
 * Visual bar timeline showing session segments.
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const TimelinePanel = ({ meeting }: TimelinePanelProps) => {
  // Segment accent colours — chosen to avoid overusing the primary red accent.
  // These are purely decorative segment identifiers.
  const SEGMENT_COLORS = [
    { bar: 'rgba(99,102,241,0.75)',  border: 'rgba(99,102,241,0.25)'  }, // indigo
    { bar: 'rgba(168,85,247,0.75)',  border: 'rgba(168,85,247,0.25)'  }, // purple
    { bar: 'rgba(34,197,94,0.75)',   border: 'rgba(34,197,94,0.25)'   }, // green
    { bar: 'rgba(245,158,11,0.75)',  border: 'rgba(245,158,11,0.25)'  }, // amber
  ];
  const SEGMENT_BORDER_COLORS = [
    '#6366F1', '#A855F7', '#22C55E', '#F59E0B',
  ];

  return (
    <div
      className="w-full rounded-xl p-5 select-none"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4" style={{ color: 'var(--success)' }} />
        <h3
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-primary)' }}
        >
          Session Timeline
        </h3>
      </div>

      {meeting.timeline.length === 0 ? (
        <div
          className="flex items-center gap-4 py-3 px-4 rounded-lg"
          style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border-strong)',
            color: 'var(--text-muted)',
          }}
        >
          <Clock className="w-5 h-5 shrink-0" style={{ color: 'var(--text-disabled)' }} />
          <div className="min-w-0">
            <h4
              className="text-xs font-semibold"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Timeline Inactive
            </h4>
            <p
              className="text-[11px] truncate mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Speaker segments and duration markers will appear once meeting audio capture begins.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Visual bar */}
          <div
            className="relative h-4 w-full rounded-full flex overflow-hidden"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {meeting.timeline.map((segment, idx) => {
              const totalDuration = meeting.timeline[meeting.timeline.length - 1].end;
              const widthPct = ((segment.end - segment.start) / totalDuration) * 100;
              const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
              return (
                <div
                  key={idx}
                  style={{
                    width: `${widthPct}%`,
                    background: color.bar,
                    borderRight: `1px solid ${color.border}`,
                  }}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-200 cursor-pointer"
                  title={`${segment.label}: ${segment.start}m – ${segment.end}m`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
            {meeting.timeline.map((segment, idx) => (
              <div
                key={idx}
                className="pl-3 py-0.5 text-[11px]"
                style={{
                  borderLeft: `2px solid ${SEGMENT_BORDER_COLORS[idx % SEGMENT_BORDER_COLORS.length]}`,
                }}
              >
                <span
                  className="font-bold block leading-tight"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {segment.label}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                  {segment.start}m – {segment.end}m ({segment.end - segment.start} mins)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
