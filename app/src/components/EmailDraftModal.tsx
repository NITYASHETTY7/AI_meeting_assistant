import { useState, useEffect, useRef } from 'react';
import { X, Mail, Send, RotateCcw } from 'lucide-react';
import type { Meeting } from '../store/useAppStore';

interface EmailDraftModalProps {
  meeting: Meeting;
  /** Sender name — defaults to first participant */
  senderName?: string;
  onClose: () => void;
}

/**
 * Generates the initial professional email draft from the meeting's edited summary
 * and action items. The user can freely edit subject and body before dispatching.
 *
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
function buildEmailDraft(meeting: Meeting, senderName: string) {
  const dateLabel = `${meeting.date}${meeting.time ? ` at ${meeting.time}` : ''}`;
  const subject = `Meeting Summary — ${meeting.title} — ${dateLabel}`;
  const summaryBlock =
    meeting.aiSummary.trim() || meeting.aiNotes.trim() || '(No summary available.)';
  const actionItemsBlock =
    meeting.actionItems.length > 0
      ? meeting.actionItems.map((item) => `${item.done ? '✓' : '•'} ${item.text}`).join('\n')
      : 'No action items recorded.';

  const body = `Hi everyone,

Please find the summary for our recent meeting below.

─────────────────────────────────────
${summaryBlock}
─────────────────────────────────────

Action Items

${actionItemsBlock}

Regards,
${senderName}`;

  return { subject, body };
}

export const EmailDraftModal = ({ meeting, senderName, onClose }: EmailDraftModalProps) => {
  const resolvedSender = senderName || meeting.participants[0] || 'The Team';
  const initial = buildEmailDraft(meeting, resolvedSender);

  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [sent, setSent] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.height = 'auto';
      bodyRef.current.style.height = `${bodyRef.current.scrollHeight}px`;
    }
  }, [body]);

  // Prevent background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleReset = () => {
    const fresh = buildEmailDraft(meeting, resolvedSender);
    setSubject(fresh.subject);
    setBody(fresh.body);
    setSent(false);
  };

  const handleSend = () => {
    window.open(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    );
    setSent(true);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh',
        }}
      >
        {/* ── Modal Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'var(--accent-subtle)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
              }}
            >
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2
                className="text-sm font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Send Email
              </h2>
              <p
                className="text-[10px] mt-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Review and edit the draft before sending
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Subject */}
          <div className="space-y-1.5">
            <label
              className="text-[10px] font-bold uppercase tracking-wider block"
              style={{ color: 'var(--text-muted)' }}
            >
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mg-input text-sm"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label
              className="text-[10px] font-bold uppercase tracking-wider block"
              style={{ color: 'var(--text-muted)' }}
            >
              Body
            </label>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mg-input text-sm resize-none leading-relaxed min-h-[320px] font-sans"
              spellCheck={false}
            />
          </div>

          {/* Sent confirmation */}
          {sent && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
              style={{
                background: 'var(--success-bg)',
                border: '1px solid var(--success-border)',
                color: 'var(--success)',
              }}
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              Your default email client has been opened with this draft.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="shrink-0 flex items-center justify-between gap-3 px-6 py-4"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
        >
          <button
            onClick={handleReset}
            className="mg-btn mg-btn-secondary text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Draft
          </button>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="mg-btn mg-btn-ghost">
              Cancel
            </button>
            <button onClick={handleSend} className="mg-btn mg-btn-primary">
              <Send className="w-3.5 h-3.5" />
              Open in Email Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDraftModal;
