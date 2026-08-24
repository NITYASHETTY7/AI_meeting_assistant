import { Clock, Users, ArrowRight, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { stripMarkdownSyntax } from '../services/ai/textSanitizer';

/** Quick check for leftover markdown syntax from summaries generated before the sanitizer was added. */
const hasMarkdownArtifacts = (text: string): boolean =>
  /\*\*.+?\*\*|__.+?__|^#{1,6}\s|```|^\s*\|.*\|\s*$/m.test(text);

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
  const store = useAppStore();
  const isCurrentlyRecording = store.recordingStatus === 'recording' && store.activeMeetingId === id;

  const displayPreview = isCurrentlyRecording
    ? '🔴 Recording in progress…'
    : preview === 'Recording in progress…' || !preview
    ? 'No summary generated yet.'
    : hasMarkdownArtifacts(preview)
    ? stripMarkdownSyntax(preview)
    : preview;

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(id);
  };

  const meetingData = store.meetings.find((m) => m.id === id);
  const distinct = new Set<string>(participants && participants.length > 0 ? participants : ['You']);
  if (meetingData?.transcript) {
    meetingData.transcript.forEach((t) => {
      // Deterministic per AudioSourceAttribution.ts: microphone -> Speaker
      // 1 (You), system output -> Speaker 2 (Other Participant).
      if (t.attributionSpeaker === 'Speaker 2') {
        distinct.add('Other Participant');
      } else if (t.attributionSpeaker === 'Speaker 1') {
        distinct.add('You');
      } else if (t.speaker) {
        distinct.add(t.speaker === 'Speaker' ? 'Other Participant' : t.speaker);
      }
    });
  }
  const effectiveParticipants = Array.from(distinct);

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col justify-between p-5 rounded-2xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div>
        {/* Top row: Date & Time + Delete button */}
        <div className="flex items-center justify-between text-xs mb-3 select-none" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-disabled)' }} />
            <span>
              {date} · {time} {duration && duration !== '0m' ? `(${duration})` : ''}
            </span>
          </div>

          <button
            onClick={handleDelete}
            title="Delete meeting"
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all cursor-pointer"
            style={{ color: 'var(--text-disabled)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#60A5FA';
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-disabled)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Title */}
        <h3
          className="text-base font-semibold leading-snug tracking-tight mb-2 line-clamp-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h3>

        {/* Preview text */}
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {displayPreview}
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
            {effectiveParticipants.length === 0
              ? 'No participants'
              : effectiveParticipants.length === 1
              ? (effectiveParticipants[0] === 'You' ? 'Only you' : effectiveParticipants[0])
              : `${effectiveParticipants.length} participants`}
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
