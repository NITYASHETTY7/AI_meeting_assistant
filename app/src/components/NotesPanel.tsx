import { useState, useEffect, type ChangeEvent } from 'react';
import { Sparkles, FileText, Check, AlertCircle } from 'lucide-react';
import { useAppStore, type Meeting } from '../store/useAppStore';

interface NotesPanelProps {
  meeting: Meeting;
}

/**
 * NotesPanel
 *
 * Editable free-text notes area for a meeting.
 * Used in the legacy notes tab (if present). Primary editing happens in SummaryPanel.
 *
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const NotesPanel = ({ meeting }: NotesPanelProps) => {
  const store = useAppStore();
  const [notes, setNotes] = useState(meeting.aiNotes);
  const [isSaved, setIsSaved] = useState(true);

  useEffect(() => {
    setNotes(meeting.aiNotes);
    setIsSaved(true);
  }, [meeting.id, meeting.aiNotes]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    setIsSaved(false);

    useAppStore.setState((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meeting.id ? { ...m, aiNotes: value } : m
      ),
    }));

    setTimeout(() => setIsSaved(true), 800);
  };

  return (
    <div
      className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-4 select-none"
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-primary)' }}
          >
            Meeting Notes
          </h3>
        </div>

        <div
          className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5"
          style={{ color: 'var(--text-muted)' }}
        >
          {store.isProcessingAI ? (
            <span className="animate-pulse" style={{ color: 'var(--accent)' }}>
              AI Drafting Notes…
            </span>
          ) : notes ? (
            isSaved ? (
              <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            ) : (
              <span className="animate-pulse" style={{ color: 'var(--accent)' }}>
                Syncing…
              </span>
            )
          ) : (
            <span className="flex items-center gap-1" style={{ color: 'var(--text-disabled)' }}>
              <AlertCircle className="w-3.5 h-3.5" /> Draft Empty
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 p-5 flex flex-col h-full">
        {store.isProcessingAI ? (
          <div className="flex-1 space-y-4 animate-pulse select-none">
            {[1, 3, '5/6', '4/5', '2/3'].map((w, i) => (
              <div
                key={i}
                className={`h-3 rounded w-${w}`}
                style={{ background: 'var(--bg-hover)' }}
              />
            ))}
          </div>
        ) : (
          <>
            {meeting.transcript.length === 0 && !notes && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center select-none">
                <FileText
                  className="w-8 h-8 mb-3"
                  style={{ color: 'var(--text-disabled)' }}
                />
                <h4
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Empty Meeting Document
                </h4>
                <p
                  className="text-xs max-w-xs mt-1 leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Start recording to generate meeting notes automatically, or
                  type custom notes below.
                </p>
              </div>
            )}

            <textarea
              value={notes}
              onChange={handleChange}
              placeholder="Review, modify, or format your meeting summary here…"
              className="w-full flex-1 text-xs sm:text-sm leading-relaxed focus:outline-none resize-none min-h-[250px] font-sans focus:ring-0 border-0"
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default NotesPanel;
