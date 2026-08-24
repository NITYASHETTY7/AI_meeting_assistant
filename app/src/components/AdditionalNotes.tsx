import { useState, useEffect, useRef, useCallback } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Check, StickyNote, ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { useAppStore, type Meeting } from '../store/useAppStore';

interface AdditionalNotesProps {
  meeting: Meeting;
}

/** Debounce delay before persisting notes after the user stops typing */
const SAVE_DEBOUNCE_MS = 600;

/** Font sizes (px) the -/+ controls cycle through */
const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24];
const DEFAULT_FONT_SIZE = 13; // matches the app's existing text-xs/sm scale

/**
 * AdditionalNotes
 *
 * Rich-text notes section rendered below the transcript card. Free-form
 * text the user types manually (independent of the transcript and the
 * AI-generated summary) — bold/italic/underline/bullet/numbered-list
 * formatting plus font-size controls via a small toolbar over a
 * contentEditable surface.
 *
 * Stored as HTML in `meeting.additionalNotes`, persisted through the same
 * store → IPC → SQLite path as the rest of the meeting document. Fed into
 * AIGenerationService.runAIGeneration alongside the transcript, so
 * summaries/action items/decisions/follow-ups draw on both.
 *
 * Bold/italic/underline still use document.execCommand — reliable for
 * simple character-level styling. Bullet/numbered lists are implemented
 * manually (toggleList below) instead of execCommand('insertUnorderedList'):
 * Chromium's list execCommand silently no-ops when the caret sits in a bare
 * text node with no enclosing block element (exactly the case right after
 * typing into a freshly-focused contentEditable div), which is why the
 * toolbar button lit up as "active" but no <ul>/<ol> ever appeared.
 * Manual DOM manipulation on the current line's block element is what
 * every major rich-text editor actually falls back to for this reason.
 */
export const AdditionalNotes = ({ meeting }: AdditionalNotesProps) => {
  const updateAdditionalNotes = useAppStore((s) => s.updateAdditionalNotes);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'empty'>(
    meeting.additionalNotes ? 'saved' : 'empty'
  );
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  /** The detected font size (px) at the current caret/selection — display only, drives the toolbar's size readout */
  const [displayFontSize, setDisplayFontSize] = useState(DEFAULT_FONT_SIZE);
  const lastMeetingIdRef = useRef(meeting.id);

  // Sync editor content when switching to a different meeting. Deliberately
  // NOT keyed on meeting.additionalNotes changing generally — this field is
  // only ever written by this component's own debounced save (or on load),
  // so re-syncing on every store update here would fight the user's cursor
  // position while they're actively typing.
  useEffect(() => {
    if (lastMeetingIdRef.current !== meeting.id) {
      lastMeetingIdRef.current = meeting.id;
      if (editorRef.current) {
        editorRef.current.innerHTML = meeting.additionalNotes || '';
        normalizeLines(editorRef.current);
      }
      setSaveState(meeting.additionalNotes ? 'saved' : 'empty');
    }
  }, [meeting.id, meeting.additionalNotes]);

  // Initial mount content
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML === '') {
      editorRef.current.innerHTML = meeting.additionalNotes || '';
      normalizeLines(editorRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = useCallback((html: string) => {
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateAdditionalNotes(meeting.id, html);
      setSaveState(html.trim() ? 'saved' : 'empty');
    }, SAVE_DEBOUNCE_MS);
  }, [meeting.id, updateAdditionalNotes]);

  const handleInput = () => {
    const html = editorRef.current?.innerHTML ?? '';
    scheduleSave(html);
  };

  const refreshActiveFormats = () => {
    const next = new Set<string>();
    try {
      if (document.queryCommandState('bold')) next.add('bold');
      if (document.queryCommandState('italic')) next.add('italic');
      if (document.queryCommandState('underline')) next.add('underline');
    } catch {
      // queryCommandState can throw in some embedded contexts — formatting
      // still works, just skip the toolbar active-state highlighting.
    }

    // List active-state is derived manually (see toggleList) rather than
    // via queryCommandState('insertUnorderedList'), which is exactly the
    // API that silently failed to reflect real DOM state in this editor.
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && editorRef.current) {
      let node: Node | null = selection.getRangeAt(0).startContainer;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as Element).tagName;
          if (tag === 'LI') {
            const parentList = (node as Element).parentElement;
            if (parentList?.tagName === 'UL') next.add('ul');
            if (parentList?.tagName === 'OL') next.add('ol');
            break;
          }
        }
        node = node.parentNode;
      }

      // Font size readout — read the computed size at the caret/selection
      // start so the toolbar reflects what THIS text run is actually sized
      // at (a span the user previously wrapped part of the note in), not a
      // single size for the whole editor.
      let sizeNode: Node | null = selection.getRangeAt(0).startContainer;
      const el = sizeNode.nodeType === Node.ELEMENT_NODE ? (sizeNode as Element) : sizeNode.parentElement;
      if (el && editorRef.current.contains(el)) {
        const computed = window.getComputedStyle(el).fontSize;
        const px = parseFloat(computed);
        if (!Number.isNaN(px)) setDisplayFontSize(Math.round(px));
      }
    }

    setActiveFormats(next);
  };

  const runInlineCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    refreshActiveFormats();
    handleInput();
  };

  /**
   * Ensures every "line" in the editor is wrapped in its own <div> block
   * element, instead of being bare text nodes separated only by <br>.
   *
   * This is the actual fix for lists affecting every line instead of just
   * one: once ANY line in the editor becomes a real <li>, Chromium's
   * native Enter-key handling takes over list continuation for that list —
   * pressing Enter at the end of an <li> auto-creates the next <li>. If
   * other lines in the editor are still bare text sharing one text run
   * with <br> separators (not their own block elements), there is no
   * reliable single-line boundary for those, which is what caused lists to
   * visually spread across multiple lines and numbers to keep incrementing
   * unexpectedly. By keeping every line as its own <div> from the start,
   * "the current line" is always one unambiguous DOM node, list toggling
   * only ever touches that one <div>, and native Enter-continuation inside
   * a list only ever affects the list itself (correctly scoped), never
   * bare text elsewhere in the note.
   *
   * Runs once on initial content load and after paste — NOT on every
   * keystroke (that would fight the caret while typing).
   */
  const normalizeLines = (editor: HTMLDivElement) => {
    const children = Array.from(editor.childNodes);
    if (children.length === 0) return;

    // Already fully block-structured (every top-level child is an element,
    // none are bare text/br) — nothing to do.
    const hasBareContent = children.some(
      (n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'BR')
    );
    if (!hasBareContent) return;

    const lines: Node[][] = [[]];
    for (const node of children) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
        lines.push([]);
      } else {
        lines[lines.length - 1].push(node);
      }
    }

    const fragment = document.createDocumentFragment();
    for (const lineNodes of lines) {
      // A block element (e.g. an existing <ul>/<div>) travels as its own
      // line unchanged rather than being wrapped in another <div>.
      if (lineNodes.length === 1 && lineNodes[0].nodeType === Node.ELEMENT_NODE) {
        fragment.appendChild(lineNodes[0]);
        continue;
      }
      const div = document.createElement('div');
      if (lineNodes.length === 0) {
        div.innerHTML = '<br>';
      } else {
        lineNodes.forEach((n) => div.appendChild(n));
      }
      fragment.appendChild(div);
    }

    editor.innerHTML = '';
    editor.appendChild(fragment);
  };

  /**
   * Toggles every line spanned by the current selection into/out of a
   * bullet or numbered list — not just the single line the selection
   * starts in. Relies on normalizeLines() having already ensured every
   * line is its own <div>, so "which lines does this selection span" is
   * answered by walking editor.childNodes between the selection's start
   * and end top-level ancestors, inclusive.
   *
   * All selected lines become <li> items inside ONE shared <ul>/<ol> (not
   * one separate list per line) so numbered lists count 1, 2, 3... across
   * the whole selection correctly, and so unwrapping later can't leave a
   * stray empty <li> behind — the previous per-line-only implementation's
   * repeated single-line list creation/merging was the source of the
   * empty/"collapsed" first and second items: converting line 1, then
   * separately converting line 2 right next to it created two adjacent
   * one-item lists that browsers/CSS can render with the first item's
   * marker visually absorbed into the second. Building one list up front
   * from the correct line range avoids that entirely.
   */
  /**
   * Toggles bullet or numbered list on the selected text / line using
   * native contentEditable execCommand.
   */
  const toggleList = (ordered: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const command = ordered ? 'insertOrderedList' : 'insertUnorderedList';
    document.execCommand(command, false);

    handleInput();
    refreshActiveFormats();
  };

  /**
   * Applies a font size to the SELECTED text only, by wrapping the
   * selection's contents in a <span style="font-size:...">. Deliberately
   * does not set fontSize on the editor container (the previous
   * implementation's bug) — that would resize every line in the note,
   * not just the text the user has highlighted. If nothing is selected
   * (collapsed caret), the new size only affects text typed from that
   * point forward, matching how bold/italic/underline behave at a caret.
   */
  const changeFontSize = (delta: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const currentIdx = FONT_SIZES.indexOf(displayFontSize);
    const baseIdx = currentIdx === -1 ? FONT_SIZES.indexOf(DEFAULT_FONT_SIZE) : currentIdx;
    const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, baseIdx + delta));
    const nextSize = FONT_SIZES[nextIdx];

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      // No text highlighted — nothing to resize. Font size for new text
      // typed at a collapsed caret isn't tracked persistently by this
      // simple editor; only applying to an existing selection keeps the
      // behavior predictable (matches the user's explicit request that
      // formatting only ever affects selected text).
      setDisplayFontSize(nextSize);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const span = document.createElement('span');
    span.style.fontSize = `${nextSize}px`;
    span.appendChild(range.extractContents());
    range.insertNode(span);

    // Re-select the newly wrapped span's contents so repeated +/- clicks on
    // the same selection keep resizing it instead of nesting a new span
    // inside the previous one each time.
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(newRange);

    setDisplayFontSize(nextSize);
    handleInput();
  };

  const toolbarButtons: { command: string; key: string; icon: typeof Bold; label: string }[] = [
    { command: 'bold', key: 'bold', icon: Bold, label: 'Bold' },
    { command: 'italic', key: 'italic', icon: Italic, label: 'Italic' },
    { command: 'underline', key: 'underline', icon: Underline, label: 'Underline' },
  ];

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden shrink-0"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center justify-between px-5 py-3 select-none cursor-pointer w-full text-left"
        style={{
          background: 'var(--bg-card)',
          borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h3
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-primary)' }}
          >
            Additional Notes
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            {saveState === 'saving' ? (
              <span className="animate-pulse" style={{ color: 'var(--accent)' }}>
                Saving…
              </span>
            ) : saveState === 'saved' ? (
              <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            ) : (
              <span style={{ color: 'var(--text-disabled)' }}>Empty</span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </button>

      {isExpanded && (
        <>
          {/* ── Toolbar ── */}
          <div
            className="flex items-center gap-1 px-3 py-2"
            style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
          >
            {toolbarButtons.map(({ command, key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                title={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runInlineCommand(command)}
                className="p-1.5 rounded-md cursor-pointer transition-colors"
                style={{
                  background: activeFormats.has(key) ? 'var(--accent-subtle)' : 'transparent',
                  color: activeFormats.has(key) ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}

            <button
              type="button"
              title="Bullet list"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleList(false)}
              className="p-1.5 rounded-md cursor-pointer transition-colors"
              style={{
                background: activeFormats.has('ul') ? 'var(--accent-subtle)' : 'transparent',
                color: activeFormats.has('ul') ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Numbered list"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggleList(true)}
              className="p-1.5 rounded-md cursor-pointer transition-colors"
              style={{
                background: activeFormats.has('ol') ? 'var(--accent-subtle)' : 'transparent',
                color: activeFormats.has('ol') ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>

            {/* Divider */}
            <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />

            {/* Font size — applies to the current selection only, see changeFontSize() */}
            <button
              type="button"
              title="Decrease font size (selected text)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeFontSize(-1)}
              disabled={displayFontSize <= FONT_SIZES[0]}
              className="p-1.5 rounded-md cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span
              className="text-[11px] font-bold tabular-nums select-none w-7 text-center"
              style={{ color: 'var(--text-secondary)' }}
              title="Font size of current selection"
            >
              {displayFontSize}
            </span>
            <button
              type="button"
              title="Increase font size (selected text)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => changeFontSize(1)}
              disabled={displayFontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
              className="p-1.5 rounded-md cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="p-5">
            <div
              ref={editorRef}
              contentEditable
              onInput={handleInput}
              onKeyUp={refreshActiveFormats}
              onMouseUp={refreshActiveFormats}
              onFocus={refreshActiveFormats}
              onPaste={() => {
                // Pasted content can land as bare text/<br> runs regardless
                // of source — normalize after the browser finishes
                // inserting it (next tick) so every line is its own <div>
                // again, keeping toggleList's one-line-per-block invariant
                // intact for content that didn't come from typing.
                setTimeout(() => {
                  if (editorRef.current) {
                    normalizeLines(editorRef.current);
                    handleInput();
                  }
                }, 0);
              }}
              className="w-full min-h-[100px] max-h-[320px] overflow-y-auto leading-relaxed focus:outline-none font-sans additional-notes-editor"
              style={{ color: 'var(--text-primary)', fontSize: `${DEFAULT_FONT_SIZE}px` }}
              data-placeholder="Add any additional context, notes, or reminders here — included when generating the AI summary."
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AdditionalNotes;
