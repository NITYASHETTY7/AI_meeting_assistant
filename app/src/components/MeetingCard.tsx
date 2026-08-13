import { Clock, Users, ArrowRight, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';

interface MeetingCardProps {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  preview: string;
  participants: string[];
  onClick: () => void;
  onDelete: (id: string) => void;
}

export const MeetingCard = ({
  id,
  title,
  date,
  time,
  duration,
  preview,
  participants,
  onClick,
  onDelete,
}: MeetingCardProps) => {
  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col justify-between p-5 cursor-pointer select-none mg-glass-card mg-glass-hover"
    >
      {/* Header metas */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold mb-2.5"
             style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-2">
            <span>{date}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {time} ({duration})
            </span>
          </div>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title="Delete note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <h4
          className="text-sm font-bold mb-1.5 leading-snug transition-colors duration-150"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h4>

        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {preview || 'No summary generated yet.'}
        </p>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between mt-5 pt-3.5"
        style={{ borderTop: '1px solid var(--divide)', color: 'var(--text-muted)' }}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-disabled)' }} />
          <span>
            {participants.length === 0
              ? 'No participants'
              : participants.length === 1
              ? 'Only you'
              : `${participants.length} participants`}
          </span>
        </div>
        <ArrowRight
          className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: 'var(--text-disabled)' }}
        />
      </div>
    </div>
  );
};
