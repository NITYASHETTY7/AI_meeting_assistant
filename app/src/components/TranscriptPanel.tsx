import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MessageSquareCode, X, ChevronDown, Globe, Loader2 } from 'lucide-react';
import { useAppStore, type Meeting } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface TranscriptPanelProps {
  meeting: Meeting;
}

/** Pixels from the bottom considered "at the bottom" for auto-scroll */
const SCROLL_THRESHOLD = 80;

/** Languages offered in the translation picker. Add more as needed. */
const TRANSLATION_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
];

/**
 * TranscriptPanel
 *
 * Full-width, readable transcript view with:
 * - Speaker colour-coding (consistent per-speaker colour across the session)
 * - Clear timecode badges
 * - Search with highlighted matches
 * - Meetily-inspired debounced auto-scroll that never fights manual scrolling
 * - Scroll-to-bottom FAB when the user has scrolled up
 */
export const TranscriptPanel = ({ meeting }: TranscriptPanelProps) => {
  const { recordingStatus } = useAppStore();
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollFab, setShowScrollFab] = useState(false);

  // ── Translation (per-line, not global) ────────────────────────────────────────
  // The translate icon appears on an individual line when the user hovers/
  // selects it — not as a persistent toolbar button — and only that line's
  // text is translated. Each line can be translated to a different language
  // independently.
  /** Which line's language picker popover is currently open */
  const [activeLangPickerIdx, setActiveLangPickerIdx] = useState<number | null>(null);
  /** Which line is currently being translated (shows a spinner on that line only) */
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const [translationError, setTranslationError] = useState('');
  /** originalIdx -> { lang, text } for lines currently showing a translation */
  const [lineTranslations, setLineTranslations] = useState<Map<number, { lang: string; text: string }>>(new Map());
  /** Cache keyed by `${originalIdx}:${langCode}` so re-picking a language already seen never re-calls the API */
  const translationCacheRef = useRef<Map<string, string>>(new Map());
  const langPickerRef = useRef<HTMLDivElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;

  const isRecording = recordingStatus === 'recording';
  const isPaused = recordingStatus === 'paused';

  // ── Scroll position helpers ─────────────────────────────────────────────────
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
    setShowScrollFab(false);
    setTimeout(() => { isProgrammaticScrollRef.current = false; }, 100);
  }, []);

  // ── Debounced scroll handler (Meetily pattern) ──────────────────────────────
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;

    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      const atBottom = isNearBottom();
      setAutoScroll(atBottom);
      setShowScrollFab(!atBottom);
    }, 80);
  }, [isNearBottom]);

  // Register scroll listener
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    };
  }, [handleScroll]);

  // ── Auto-scroll when new lines arrive during recording ──────────────────────
  useEffect(() => {
    if (!autoScrollRef.current) return;
    if (!isRecording && !isPaused) return; // Only during active recording
    if (!isNearBottom()) return; // Don't fight a user who has scrolled up

    isProgrammaticScrollRef.current = true;
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setTimeout(() => { isProgrammaticScrollRef.current = false; }, 100);
  }, [meeting.transcript.length, isRecording, isPaused, isNearBottom]);

  // ── Translation (per-line) ────────────────────────────────────────────────────
  // Reset all translation state when switching meetings — indices and cache
  // keys are meaningless across different transcripts.
  useEffect(() => {
    translationCacheRef.current.clear();
    setLineTranslations(new Map());
    setActiveLangPickerIdx(null);
    setTranslationError('');
  }, [meeting.id]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setActiveLangPickerIdx(null);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  /** Translate (or revert) a single transcript line, identified by its original index. */
  const handleTranslateLine = async (originalIdx: number, langCode: string) => {
    setActiveLangPickerIdx(null);
    setTranslationError('');

    if (langCode === 'original') {
      setLineTranslations((prev) => {
        const next = new Map(prev);
        next.delete(originalIdx);
        return next;
      });
      return;
    }

    const cacheKey = `${originalIdx}:${langCode}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setLineTranslations((prev) => new Map(prev).set(originalIdx, { lang: langCode, text: cached }));
      return;
    }

    const originalText = meeting.transcript[originalIdx]?.text;
    if (!originalText) return;

    setTranslatingIdx(originalIdx);
    try {
      const langLabel = TRANSLATION_LANGUAGES.find((l) => l.code === langCode)?.label ?? langCode;
      const provider = ProviderManager.getActiveProvider();

      const reply = await provider.chat([
        {
          role: 'system',
          content:
            `Translate the user's message into ${langLabel}. ` +
            'Return ONLY the translated text, with no commentary, quotes, or markdown formatting.',
        },
        { role: 'user', content: originalText },
      ]);

      const translated = reply.trim() || originalText;
      translationCacheRef.current.set(cacheKey, translated);
      setLineTranslations((prev) => new Map(prev).set(originalIdx, { lang: langCode, text: translated }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Translation failed.';
      setTranslationError(message);
    } finally {
      setTranslatingIdx(null);
    }
  };

  // Scroll to bottom when switching to this meeting
  useEffect(() => {
    scrollToBottom();
  }, [meeting.id, scrollToBottom]);

  // ── Speaker colour palette ──────────────────────────────────────────────────
  const SPEAKER_COLOURS = [
    'var(--accent)',
    '#22C55E',
    '#F59E0B',
    '#EF4444',
    '#06B6D4',
    '#8B5CF6',
    '#F97316',
    '#14B8A6',
  ];

  const speakerColourMap = useRef(new Map<string, string>());
  const getColourForSpeaker = (speaker: string): string => {
    if (!speakerColourMap.current.has(speaker)) {
      const idx = speakerColourMap.current.size % SPEAKER_COLOURS.length;
      speakerColourMap.current.set(speaker, SPEAKER_COLOURS[idx]);
    }
    return speakerColourMap.current.get(speaker)!;
  };

  // Reset colour map when meeting changes
  useEffect(() => {
    speakerColourMap.current.clear();
  }, [meeting.id]);

  // ── Search filtering ────────────────────────────────────────────────────────
  // Attach the original index (for translation lookup) and resolved display
  // text BEFORE filtering, so filteredLines' indices into translatedLines
  // stay correct regardless of which lines the search term excludes.
  const linesWithDisplayText = meeting.transcript.map((line, originalIdx) => ({
    ...line,
    originalIdx,
    displayText: lineTranslations.get(originalIdx)?.text ?? line.text,
  }));

  const searchTerm = search.trim().toLowerCase();
  const filteredLines = searchTerm
    ? linesWithDisplayText.filter(
        (line) =>
          line.displayText.toLowerCase().includes(searchTerm) ||
          line.speaker.toLowerCase().includes(searchTerm)
      )
    : linesWithDisplayText;

  /** Highlight matching substrings in a string */
  const highlight = (text: string): React.ReactNode => {
    if (!searchTerm) return text;
    const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm ? (
        <mark key={i} className="bg-amber-400/25 text-amber-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
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
        className="flex items-center justify-between px-5 py-3.5 shrink-0"
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <h3
            className="text-xs font-bold uppercase tracking-wider select-none"
            style={{ color: 'var(--text-primary)' }}
          >
            Transcript
          </h3>
          {meeting.transcript.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full select-none"
              style={{
                background: 'var(--bg-hover)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {meeting.transcript.length} lines
            </span>
          )}
          {isRecording && (
            <span
              className="flex items-center gap-1 text-[10px] font-bold animate-pulse select-none"
              style={{ color: 'var(--error)' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: 'var(--error)' }}
              />
              Live
            </span>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          {/* Search input */}
          {meeting.transcript.length > 0 && (
            <div className="relative w-48 sm:w-56">
              <span
                className="absolute inset-y-0 left-3 flex items-center pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              >
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                placeholder="Search transcript…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mg-input pr-7"
                style={{ paddingLeft: '34px' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {translationError && (
        <div
          className="px-5 py-2 text-[11px] font-medium shrink-0"
          style={{ background: 'var(--error-bg)', color: 'var(--error)', borderBottom: '1px solid var(--error-border)' }}
        >
          {translationError}
        </div>
      )}

      {/* ── Transcript body ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-0"
      >
        {meeting.transcript.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center select-none">
            <MessageSquareCode className="w-9 h-9 mb-3" style={{ color: 'var(--text-disabled)' }} />
            <h4
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              No Transcript Yet
            </h4>
            <p
              className="text-xs max-w-xs mt-2 leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              Start recording to see the live transcript appear here.
            </p>
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center select-none">
            <Search className="w-7 h-7 mb-3" style={{ color: 'var(--text-disabled)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No matches for{' '}
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                "{search}"
              </span>
            </p>
            <button
              onClick={() => setSearch('')}
              className="mt-2 text-xs underline cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              Clear search
            </button>
          </div>
        ) : (
          filteredLines.map((line, idx) => {
            const speakerColour = getColourForSpeaker(line.speaker);
            const prevLine = filteredLines[idx - 1];
            const isContinuation = prevLine?.speaker === line.speaker;
            // Alternate row backgrounds for readability
            const isEven = idx % 2 === 0;
            const lineTranslation = lineTranslations.get(line.originalIdx);
            const isPickerOpen = activeLangPickerIdx === line.originalIdx;
            const isThisLineTranslating = translatingIdx === line.originalIdx;

            return (
              <div
                key={idx}
                className={`group relative flex gap-3 items-start rounded-lg px-3 ${isContinuation ? 'pt-1 pb-1' : 'pt-3 pb-2'}`}
                style={{
                  background: isEven ? 'transparent' : 'var(--bg-card)',
                }}
              >
                <span
                  className="shrink-0 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 select-none min-w-[38px] text-center"
                  style={{
                    background: 'var(--bg-hover)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {line.time}
                </span>
                <div className="flex-1 min-w-0">
                  {!isContinuation && (
                    <p
                      className="text-xs font-bold mb-1"
                      style={{ color: speakerColour }}
                    >
                      {line.speaker}
                    </p>
                  )}
                  <p
                    className="text-sm leading-relaxed break-words"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {highlight(line.displayText)}
                  </p>
                  {lineTranslation && (
                    <p
                      className="text-[10px] font-semibold mt-1 flex items-center gap-1"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Globe className="w-2.5 h-2.5" />
                      Translated to {TRANSLATION_LANGUAGES.find((l) => l.code === lineTranslation.lang)?.label}
                    </p>
                  )}
                </div>

                {/* Per-line translate icon — hidden until hover/active, scoped
                    to this single line only (not a global toolbar button). */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setActiveLangPickerIdx(isPickerOpen ? null : line.originalIdx)}
                    className={`p-1.5 rounded-lg cursor-pointer transition-opacity ${
                      isPickerOpen || lineTranslation ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    style={{
                      color: lineTranslation ? 'var(--accent)' : 'var(--text-muted)',
                      background: lineTranslation ? 'var(--accent-subtle)' : 'transparent',
                    }}
                    title="Translate this line"
                  >
                    {isThisLineTranslating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isPickerOpen && (
                    <div
                      ref={langPickerRef}
                      className="absolute right-0 top-full mt-1 w-40 rounded-lg overflow-hidden z-50 max-h-56 overflow-y-auto"
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-strong)',
                        boxShadow: 'var(--shadow-lg)',
                      }}
                    >
                      {lineTranslation && (
                        <>
                          <button
                            onClick={() => handleTranslateLine(line.originalIdx, 'original')}
                            className="w-full text-left px-3 py-2 text-xs font-semibold cursor-pointer transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            Show original
                          </button>
                          <div style={{ borderTop: '1px solid var(--border)' }} />
                        </>
                      )}
                      {TRANSLATION_LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => handleTranslateLine(line.originalIdx, lang.code)}
                          className="w-full text-left px-3 py-2 text-xs font-medium cursor-pointer transition-colors"
                          style={{
                            color: lineTranslation?.lang === lang.code ? 'var(--accent)' : 'var(--text-secondary)',
                            background: lineTranslation?.lang === lang.code ? 'var(--accent-subtle)' : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            if (lineTranslation?.lang !== lang.code) e.currentTarget.style.background = 'var(--bg-hover)';
                          }}
                          onMouseLeave={(e) => {
                            if (lineTranslation?.lang !== lang.code) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Scroll FAB ── */}
      {showScrollFab && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all mg-btn mg-btn-secondary"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Latest
        </button>
      )}
    </div>
  );
};

export default TranscriptPanel;
