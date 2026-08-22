import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Sparkles, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useAppStore, type Meeting } from '../store/useAppStore';
import { runAIGeneration } from '../services/ai/AIGenerationService';
import { stripMarkdownSyntax } from '../services/ai/textSanitizer';

/** Quick check for leftover markdown syntax from summaries generated before the sanitizer was added. */
const hasMarkdownArtifacts = (text: string): boolean =>
  /\*\*.+?\*\*|__.+?__|^#{1,6}\s|```|^\s*\|.*\|\s*$/m.test(text);

interface SummaryPanelProps {
  meeting: Meeting;
  /** Called after successful AI generation so the parent can switch to this tab */
  onGenerationComplete?: () => void;
  /**
   * When true the panel renders at natural/auto height instead of h-full.
   * Use in document-scroll mode (Summary tab) where the outer container scrolls.
   * When false (default) the panel fills its flex parent — used in fixed-height contexts.
   */
  naturalHeight?: boolean;
}

/**
 * SummaryPanel
 *
 * Three display modes:
 *  1. Pending  — recording has stopped and transcript exists but no summary yet.
 *               Shows a prominent "Generate AI Summary" call-to-action.
 *  2. Loading  — AI generation is in progress. Shows animated skeleton.
 *  3. Document — Summary exists. Shows editable document with auto-save.
 *
 * The user always controls when generation happens. Nothing is automatic.
 */
export const SummaryPanel = ({ meeting, onGenerationComplete, naturalHeight = false }: SummaryPanelProps) => {
  const { isProcessingAI, recordingStatus, updateAiSummary } = useAppStore();
  const [content, setContent] = useState(meeting.aiSummary);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'empty'>('saved');
  const [genError, setGenError] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when active meeting changes or summary updates. Summaries generated
  // before the markdown sanitizer existed may still have literal **bold**/
  // table syntax baked into stored content — clean those up transparently
  // on load (and persist the cleaned version) rather than leaving old
  // meetings permanently showing raw asterisks forever.
  useEffect(() => {
    const raw = meeting.aiSummary;
    const cleaned = raw && hasMarkdownArtifacts(raw) ? stripMarkdownSyntax(raw) : raw;
    setContent(cleaned);
    setSaveState(cleaned ? 'saved' : 'empty');
    setGenError('');
    if (cleaned !== raw) {
      updateAiSummary(meeting.id, cleaned);
    }
  }, [meeting.id, meeting.aiSummary]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────
  const hasTranscript = meeting.transcript.length > 0;
  const hasSummary = !!content;
  const isStopped = recordingStatus === 'stopped';
  // For STT providers: show CTA only when transcript exists.
  // For summarization-only providers (no STT): allow generation even without
  // a transcript — the provider will acknowledge that no audio was transcribed.
  const canGenerate = isStopped && !isProcessingAI;
  const showGenerateCTA = !hasSummary && canGenerate;
  // Show generate button even during recording (disabled) if there's no summary yet
  const showGenerateButton = !hasSummary && !isProcessingAI;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenError('');
    const success = await runAIGeneration(meeting.id);
    if (!success) {
      setGenError('Generation failed. Check your provider settings and try again.');
    } else {
      onGenerationComplete?.();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    setSaveState('saving');

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateAiSummary(meeting.id, value);
      setSaveState(value ? 'saved' : 'empty');
    }, 600);
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  const renderStatus = () => {
    if (isProcessingAI) {
      return (
        <span className="animate-pulse flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
          <Sparkles className="w-3.5 h-3.5" /> Generating…
        </span>
      );
    }
    if (saveState === 'saving') {
      return <span className="animate-pulse" style={{ color: 'var(--accent)' }}>Saving…</span>;
    }
    if (saveState === 'saved' && content) {
      return (
        <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
          <Check className="w-3.5 h-3.5" /> Saved
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1" style={{ color: 'var(--text-disabled)' }}>
        <AlertCircle className="w-3.5 h-3.5" /> No summary
      </span>
    );
  };

  // ── AI generation skeleton ────────────────────────────────────────────────────
  const renderSkeleton = () => (
    <div className="flex-1 p-8 space-y-6 animate-pulse select-none overflow-y-auto">
      <div className="h-5 rounded w-2/5" style={{ background: 'var(--bg-hover)' }} />
      <div className="h-px w-full" style={{ background: 'var(--border)' }} />
      <div className="space-y-2.5">
        <div className="h-3.5 rounded w-1/4" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 rounded w-full" style={{ background: 'var(--bg-card)' }} />
        <div className="h-3 rounded w-11/12" style={{ background: 'var(--bg-card)' }} />
        <div className="h-3 rounded w-4/5" style={{ background: 'var(--bg-card)' }} />
        <div className="h-3 rounded w-5/6" style={{ background: 'var(--bg-card)' }} />
      </div>
      <div className="space-y-2.5">
        <div className="h-3.5 rounded w-1/3" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 rounded w-full" style={{ background: 'var(--bg-card)' }} />
        <div className="h-3 rounded w-3/4" style={{ background: 'var(--bg-card)' }} />
        <div className="h-3 rounded w-5/6" style={{ background: 'var(--bg-card)' }} />
      </div>
      <div className="space-y-2.5">
        <div className="h-3.5 rounded w-1/4" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 rounded w-2/3" style={{ background: 'var(--bg-card)' }} />
        <div className="h-3 rounded w-1/2" style={{ background: 'var(--bg-card)' }} />
      </div>
    </div>
  );

  // ── Pending / generate CTA ────────────────────────────────────────────────────
  const renderCTA = () => (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center select-none">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: 'var(--accent-subtle)',
          border: '1px solid var(--accent-border)',
        }}
      >
        <Sparkles className="w-7 h-7" style={{ color: 'var(--accent)' }} />
      </div>
      <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        Ready to Generate Summary
      </h3>
      <p className="text-sm max-w-sm leading-relaxed mb-6" style={{ color: 'var(--text-tertiary)' }}>
        {hasTranscript
          ? 'Your recording has ended and the transcript is ready. Click below to generate a professional AI summary, action items, and follow-ups.'
          : 'Recording has ended. Click below to generate an AI summary using your active provider.'}
      </p>
      <button
        onClick={handleGenerate}
        className="mg-btn mg-btn-primary"
        style={{ fontSize: '14px', padding: '10px 24px' }}
      >
        <Sparkles className="w-4 h-4" />
        Generate AI Summary
      </button>
      {genError && (
        <p className="mt-4 text-xs flex items-center gap-1.5" style={{ color: 'var(--error)' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {genError}
        </p>
      )}
    </div>
  );

  // ── No transcript yet ─────────────────────────────────────────────────────────
  const renderEmpty = () => (
    <div className="flex-1 flex flex-col items-center justify-center py-12 text-center select-none">
      <FileText className="w-9 h-9 mb-3" style={{ color: 'var(--text-disabled)' }} />
      <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
        No Summary Yet
      </h4>
      <p className="text-xs max-w-xs mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Record a meeting to generate a summary, or start typing your own notes below.
      </p>
    </div>
  );

  return (
    <div
      className={`flex flex-col rounded-xl overflow-hidden ${naturalHeight ? '' : 'h-full'}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-3.5 select-none shrink-0"
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
            AI Summary
          </h3>
          {content && !isProcessingAI && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-border)',
              }}
            >
              Editable
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showGenerateButton && !showGenerateCTA && !isProcessingAI && (
            <button
              onClick={handleGenerate}
              disabled={isProcessingAI}
              className="mg-btn mg-btn-primary"
              style={{ fontSize: '11px', padding: '5px 10px' }}
            >
              {isProcessingAI ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Generate
            </button>
          )}
          <div
            className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            {renderStatus()}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={`flex flex-col ${naturalHeight ? '' : 'flex-1 overflow-hidden'}`}>
        {isProcessingAI ? (
          renderSkeleton()
        ) : showGenerateCTA ? (
          renderCTA()
        ) : hasSummary ? (
          <div className={`flex flex-col ${naturalHeight ? '' : 'flex-1 overflow-hidden'}`}>
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="Your summary will appear here…"
              className={`w-full text-sm leading-7 focus:outline-none resize-none focus:ring-0 border-0 px-6 py-5 ${
                naturalHeight ? 'min-h-[320px]' : 'flex-1'
              }`}
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
              }}
              spellCheck={false}
            />
          </div>
        ) : (
          renderEmpty()
        )}
      </div>

      {/* ── Footer ── */}
      {!isProcessingAI && content && (
        <div
          className="shrink-0 px-5 py-2.5 select-none"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}
        >
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Click anywhere to edit · Changes auto-saved
          </p>
        </div>
      )}
    </div>
  );
};

export default SummaryPanel;
