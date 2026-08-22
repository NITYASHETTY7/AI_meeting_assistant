import { useState } from 'react';
import { Copy, Mail, FileDown, FileText, Check } from 'lucide-react';
import { EmailDraftModal } from './EmailDraftModal';
import type { Meeting } from '../store/useAppStore';
import { resolveDisplayDuration } from '../services/meetingDuration';

interface ShareMenuProps {
  meeting: Meeting;
  /** Sender name for the email draft, defaults to first participant */
  senderName?: string;
}

/**
 * Lightweight post-meeting share toolbar — Granola-style.
 * Actions: Copy Summary · Send Email · Export Markdown · Export PDF (coming soon)
 *
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const ShareMenu = ({ meeting, senderName }: ShareMenuProps) => {
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const flash = (label: string) => {
    setFlashLabel(label);
    setTimeout(() => setFlashLabel(null), 2200);
  };

  const handleCopy = async () => {
    const text = meeting.aiSummary || meeting.aiNotes || '(No summary available.)';
    try {
      await navigator.clipboard.writeText(text);
      flash('Copied to clipboard!');
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      flash('Copied!');
    }
  };

  const handleExportMarkdown = () => {
    const summaryContent = meeting.aiSummary || meeting.aiNotes || '(No summary available.)';
    const itemsBlock =
      meeting.actionItems.length > 0
        ? meeting.actionItems.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')
        : '_No action items recorded._';

    const markdown = [
      `# ${meeting.title}`,
      `**Date:** ${meeting.date}  **Time:** ${meeting.time}  **Duration:** ${resolveDisplayDuration(meeting)}`,
      `**Participants:** ${meeting.participants.join(', ')}`,
      '',
      '---',
      '',
      summaryContent,
      '',
      '---',
      '',
      '## Action Items',
      '',
      itemsBlock,
    ].join('\n');

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${meeting.title.toLowerCase().replace(/\s+/g, '_')}_summary.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    flash('Markdown saved!');
  };

  // Shared button style for share action buttons
  const shareButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  };

  const handleBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
    (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
  };
  const handleBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
    (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
  };

  return (
    <>
      {/* ── Share Bar ── */}
      <div
        className="shrink-0 flex flex-wrap items-center justify-between pt-4 pb-1 select-none gap-y-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {/* Left: flash status or label */}
        <div className="flex items-center gap-1.5 min-w-[140px]">
          {flashLabel ? (
            <span
              className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
              style={{ color: 'var(--success)' }}
            >
              <Check className="w-3.5 h-3.5" /> {flashLabel}
            </span>
          ) : (
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Share
            </span>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleCopy}
            style={shareButtonStyle}
            onMouseEnter={handleBtnEnter}
            onMouseLeave={handleBtnLeave}
            title="Copy summary text to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Summary
          </button>

          <button
            onClick={() => setShowEmailModal(true)}
            style={shareButtonStyle}
            onMouseEnter={handleBtnEnter}
            onMouseLeave={handleBtnLeave}
            title="Review and send the summary by email"
          >
            <Mail className="w-3.5 h-3.5" />
            Send Email
          </button>

          <button
            onClick={handleExportMarkdown}
            style={shareButtonStyle}
            onMouseEnter={handleBtnEnter}
            onMouseLeave={handleBtnLeave}
            title="Download summary as a Markdown file"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Markdown
          </button>

          {/* Export PDF — coming soon */}
          <button
            disabled
            style={{
              ...shareButtonStyle,
              cursor: 'not-allowed',
              opacity: 0.4,
            }}
            title="Export as PDF — coming soon"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export PDF
            <span
              className="text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide ml-0.5"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              soon
            </span>
          </button>
        </div>
      </div>

      {/* ── Email Draft Modal ── */}
      {showEmailModal && (
        <EmailDraftModal
          key={meeting.aiSummary}
          meeting={meeting}
          senderName={senderName}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </>
  );
};

export default ShareMenu;
