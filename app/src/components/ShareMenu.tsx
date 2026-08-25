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

  const htmlToMarkdown = (html: string): string => {
    if (!html) return '';
    return html
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<u[^>]*>(.*?)<\/u>/gi, '_$1_')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .trim();
  };

  const handleCopy = async () => {
    let text = meeting.aiSummary || meeting.aiNotes || '(No summary available.)';
    if (meeting.additionalNotes?.trim()) {
      const notesPlain = htmlToMarkdown(meeting.additionalNotes);
      if (notesPlain) {
        text += `\n\nADDITIONAL NOTES\n\n${notesPlain}`;
      }
    }

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

    const markdownParts = [
      `# ${meeting.title}`,
      `**Date:** ${meeting.date}  **Time:** ${meeting.time}  **Duration:** ${resolveDisplayDuration(meeting)}`,
      `**Participants:** ${meeting.participants.join(', ') || 'None'}`,
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
    ];

    if (meeting.additionalNotes?.trim()) {
      const notesMd = htmlToMarkdown(meeting.additionalNotes);
      if (notesMd) {
        markdownParts.push('', '---', '', '## Additional Notes', '', notesMd);
      }
    }

    const markdown = markdownParts.join('\n');

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

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatAdditionalNotesForPdf = (html: string) => {
    if (!html) return '';
    // If plain text, preserve line breaks
    if (!/<[a-z][\s\S]*>/i.test(html)) {
      return `<p style="margin: 0 0 8px 0;">${escapeHtml(html).replace(/\n/g, '<br/>')}</p>`;
    }
    // Clean inline theme variable references and unwrap dark mode styling
    return html
      .replace(/color:\s*var\(--text-primary\);?/gi, 'color: #111827;')
      .replace(/color:\s*var\(--text-secondary\);?/gi, 'color: #374151;')
      .replace(/color:\s*var\(--text-muted\);?/gi, 'color: #6b7280;')
      .replace(/color:\s*var\(--text-tertiary\);?/gi, 'color: #9ca3af;')
      .replace(/color:\s*var\(--accent\);?/gi, 'color: #0284c7;')
      .replace(/background(-color)?:\s*var\(--[a-z0-9-]+\);?/gi, '')
      .replace(/&nbsp;/g, ' ');
  };

  const handleExportPdf = async () => {
    const summaryContent = meeting.aiSummary || meeting.aiNotes || '(No summary available.)';
    const duration = resolveDisplayDuration(meeting);
    const dateFormatted = meeting.date || new Date().toLocaleDateString();

    const actionItemsHtml =
      meeting.actionItems.length > 0
        ? meeting.actionItems
            .map(
              (item) => `
          <li style="margin-bottom: 8px; display: flex; align-items: flex-start; gap: 8px;">
            <span style="display: inline-block; width: 14px; height: 14px; border: 1.5px solid ${
              item.done ? '#10b981' : '#6b7280'
            }; border-radius: 3px; margin-top: 3px; background: ${
              item.done ? '#10b981' : 'transparent'
            }; text-align: center; line-height: 12px; color: white; font-size: 10px;">${item.done ? '✓' : ''}</span>
            <span style="${
              item.done ? 'text-decoration: line-through; color: #6b7280;' : 'color: #111827;'
            } font-size: 13px;">${escapeHtml(item.text)}</span>
          </li>
        `
            )
            .join('')
        : '<p style="color: #6b7280; font-size: 13px; font-style: italic;">No action items recorded.</p>';

    const additionalNotesHtml = meeting.additionalNotes?.trim()
      ? `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
           <div class="section-title">Additional Notes</div>
           <div class="additional-notes-content">${formatAdditionalNotesForPdf(meeting.additionalNotes)}</div>
         </div>`
      : '';

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(meeting.title)} - Meeting Summary</title>
  <style>
    @page { margin: 18mm 15mm; size: A4; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      line-height: 1.5;
      margin: 0;
      padding: 24px 32px;
    }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #38bdf8;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 13px;
      font-weight: 800;
      color: #0284c7;
      letter-spacing: -0.01em;
    }
    .meta-badge {
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 14px 0;
      letter-spacing: -0.02em;
    }
    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      font-size: 12px;
    }
    .meta-item strong {
      display: block;
      color: #64748b;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .meta-item span {
      color: #1e293b;
      font-weight: 600;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0369a1;
      margin: 20px 0 8px 0;
    }
    .summary-box {
      font-size: 13.5px;
      line-height: 1.65;
      color: #1e293b;
      white-space: pre-wrap;
    }
    ul.action-list {
      list-style: none;
      padding-left: 0;
      margin: 8px 0 16px 0;
    }
    .additional-notes-content {
      font-size: 13px;
      line-height: 1.6;
      color: #1f2937;
    }
    .additional-notes-content p, .additional-notes-content div {
      margin: 0 0 6px 0;
    }
    .additional-notes-content ul, .additional-notes-content ol {
      margin: 6px 0 10px 20px;
      padding: 0;
    }
    .additional-notes-content li {
      margin-bottom: 4px;
    }
    .additional-notes-content b, .additional-notes-content strong {
      font-weight: 700;
      color: #0f172a;
    }
    .additional-notes-content u {
      text-decoration: underline;
    }
    .additional-notes-content i, .additional-notes-content em {
      font-style: italic;
    }
    .footer {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="brand-title">MIRAI GRANOLA • MEETING EXECUTIVE BRIEF</div>
    <div class="meta-badge">${escapeHtml(dateFormatted)}</div>
  </div>

  <h1>${escapeHtml(meeting.title)}</h1>

  <div class="metadata-grid">
    <div class="meta-item">
      <strong>Date &amp; Time</strong>
      <span>${escapeHtml(meeting.date)} • ${escapeHtml(meeting.time)}</span>
    </div>
    <div class="meta-item">
      <strong>Duration</strong>
      <span>${escapeHtml(duration)}</span>
    </div>
    <div class="meta-item">
      <strong>Participants</strong>
      <span>${escapeHtml(meeting.participants.join(', ') || 'None')}</span>
    </div>
  </div>

  <div class="section-title">Meeting Summary</div>
  <div class="summary-box">${escapeHtml(summaryContent)}</div>

  <div class="section-title" style="margin-top: 24px;">Action Items</div>
  <ul class="action-list">
    ${actionItemsHtml}
  </ul>

  ${additionalNotesHtml}

  <div class="footer">
    <span>Generated by Mirai Granola</span>
    <span>CONFIDENTIAL</span>
  </div>
</body>
</html>`;

    const defaultFileName = `${meeting.title.toLowerCase().replace(/\s+/g, '_')}_summary.pdf`;

    if (window.electronAPI?.exportPdf) {
      flash('Exporting PDF…');
      try {
        const res = await window.electronAPI.exportPdf({ html: htmlContent, defaultFileName });
        if (res.ok) {
          flash('PDF saved!');
        } else if (!res.canceled) {
          flash('Export failed');
        }
      } catch (err) {
        console.error('PDF export error:', err);
        flash('Export error');
      }
    } else {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
      flash('Print opened!');
    }
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

          {/* Export PDF */}
          <button
            onClick={handleExportPdf}
            style={shareButtonStyle}
            onMouseEnter={handleBtnEnter}
            onMouseLeave={handleBtnLeave}
            title="Export meeting summary and action items as a PDF"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export PDF
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
