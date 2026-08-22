/**
 * Strips common markdown syntax that models frequently emit even when
 * explicitly instructed to return plain text. Used anywhere AI-generated
 * text is displayed without a markdown renderer (summary panels, chat
 * messages) or copied verbatim into email shares — literal **bold**,
 * # headers, _italic_ markers, or raw pipe-table syntax would show up as
 * garbled punctuation in all of those places rather than being rendered.
 * Prompt instructions alone are not reliable enough to prevent this, so it
 * is enforced here regardless of which provider/model produced the text.
 */
export function stripMarkdownSyntax(text: string): string {
  return text
    // Bold/italic: **text**, __text__, *text*, _text_ → text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1')
    // Headers: "## Title" → "Title"
    .replace(/^#{1,6}\s+/gm, '')
    // Inline code / code fences: `text` or ```text``` → text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    // Markdown tables: only convert a genuine table block (a header row
    // immediately followed by a "|---|---|" separator row, then 1+ data
    // rows) into readable plain-text lines. Requiring the separator row
    // specifically avoids false-positives on ordinary sentences that
    // happen to contain a pipe character (e.g. a shell command like
    // "grep foo | wc -l" in a transcript) — those never have a
    // dashes-only separator line right after them.
    .replace(
      /^(.*\|.*)\n\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*\n((?:.*\|.*\n?)+)/gm,
      (_match, headerRow: string, _sep: string, dataRows: string) => {
        const toPlainRow = (row: string) =>
          row
            .split('|')
            .map((cell) => cell.trim())
            .filter(Boolean)
            .join(' — ');
        const lines = [toPlainRow(headerRow), ...dataRows.split('\n').filter((l) => l.trim()).map(toPlainRow)];
        return lines.join('\n') + '\n';
      }
    )
    // Markdown bullet markers "* " / "+ " at line start → "- " (keep dashes,
    // the convention used elsewhere for plain-text lists)
    .replace(/^\s*[*+]\s+/gm, '- ')
    // Collapse 3+ blank lines left behind by removed table separator rows
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
