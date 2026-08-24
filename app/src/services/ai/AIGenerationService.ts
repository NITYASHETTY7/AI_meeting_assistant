import { useAppStore } from '../../store/useAppStore';
import { ProviderManager } from '../ai/ProviderManager';
import { stripMarkdownSyntax } from './textSanitizer';

/**
 * Converts the Additional Notes editor's stored HTML (bold/italic/lists from
 * contentEditable) into plain text before it's sent to an AI provider. Uses
 * DOMParser rather than a regex strip so block-level tags (</p>, </div>,
 * </li>, <br>) are converted into actual line breaks instead of being
 * deleted and running words together — a naive tag-stripping regex would
 * turn "<p>First</p><p>Second</p>" into "FirstSecond".
 */
function htmlToPlainText(html: string): string {
  if (!html || !html.trim()) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Insert a newline marker after block-level/line-break elements before
  // reading textContent, so paragraph and list-item boundaries survive.
  const blockSelectors = 'p, div, li, br, h1, h2, h3, h4, h5, h6';
  doc.body.querySelectorAll(blockSelectors).forEach((el) => {
    el.insertAdjacentText('afterend', '\n');
  });

  return (doc.body.textContent || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join('\n')
    .trim();
}

/**
 * runAIGeneration
 *
 * Standalone, on-demand AI processing for a meeting.
 * Called explicitly by the user clicking "Generate AI Summary" — never automatically.
 *
 * Reads the meeting transcript, calls the active AI provider, and writes the
 * structured summary + action items back into the Zustand store.
 *
 * Provider capability handling:
 *   - STT providers (OpenAI, Groq, AssemblyAI): use the real transcript from recording.
 *   - Summarization-only providers (Gemini, Anthropic, AWS, OpenRouter, Ollama):
 *     the transcript is empty (no STT was possible). We still allow generation —
 *     the provider receives a note that no transcript was captured and can acknowledge
 *     that gracefully, or the user can have typed manual notes into the transcript.
 *     We do NOT block generation based on transcript length.
 *
 * Returns true on success, false on failure.
 */
export async function runAIGeneration(meetingId: string): Promise<boolean> {
  const store = useAppStore.getState();
  const meeting = store.meetings.find((m) => m.id === meetingId);

  if (!meeting) {
    return false;
  }

  store.setIsProcessingAI(true);

  try {
    const activeProvider = ProviderManager.getChatProvider();

    // Build the transcript text block.
    // For providers without STT, the transcript may be empty. We still attempt
    // generation — providers will either return a minimal summary or an informational
    // message. This avoids blocking the user from getting any output at all.
    const transcriptText =
      meeting.transcript.length > 0
        ? meeting.transcript
            .map((line) => `[${line.time}] ${line.speaker}: ${line.text}`)
            .join('\n')
        : '[No transcript captured. Meeting notes were not recorded via audio.]';

    // Additional Notes — free-form rich text the user typed manually below
    // the transcript card. Stored as HTML from the contentEditable editor,
    // so it's stripped to plain text before being sent to the model (raw
    // tags would otherwise leak into the prompt and confuse extraction).
    // Appended as a clearly separated section so summary/action items/
    // decisions/follow-ups all draw on both the transcript AND whatever the
    // user wrote by hand, not just one or the other.
    const additionalNotesText = htmlToPlainText(meeting.additionalNotes);
    const combinedTranscriptText = additionalNotesText
      ? `${transcriptText}\n\n--- Additional Notes (typed by user) ---\n${additionalNotesText}`
      : transcriptText;

    // Guard against thin/empty transcripts — rather than sending a near-empty
    // transcript to the model (which tends to hallucinate a plausible-sounding
    // but fabricated summary/action items), detect insufficient context up
    // front and write a clear, honest message instead. Additional Notes text
    // counts toward this too — a meeting with no audio transcript but a
    // substantial typed note should still be allowed to generate.
    const transcriptWordCount = meeting.transcript
      .map((line) => line.text)
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const notesWordCount = additionalNotesText.trim().split(/\s+/).filter(Boolean).length;
    const wordCount = transcriptWordCount + notesWordCount;
    const MIN_WORDS_FOR_GENERATION = 12;
    const hasEnoughContext =
      (meeting.transcript.length > 0 || additionalNotesText.length > 0) && wordCount >= MIN_WORDS_FOR_GENERATION;

    if (!hasEnoughContext) {
      const notice = 'Not enough context to generate a summary. Record more of the meeting, or add notes, then try again.';

      useAppStore.setState((state) => ({
        meetings: state.meetings.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                aiNotes: notice,
                aiSummary: notice,
                actionItems: [],
                preview: notice,
              }
            : m
        ),
      }));

      const savedMeeting = useAppStore.getState().meetings.find((m) => m.id === meetingId);
      if (savedMeeting && window.electronAPI?.dbUpsertMeeting) {
        window.electronAPI
          .dbUpsertMeeting({
            id: savedMeeting.id,
            title: savedMeeting.title,
            date: savedMeeting.date,
            time: savedMeeting.time,
            duration: savedMeeting.duration,
            preview: savedMeeting.preview,
            participants: savedMeeting.participants,
            timeline: savedMeeting.timeline,
            aiNotes: savedMeeting.aiNotes,
            aiSummary: savedMeeting.aiSummary,
            additionalNotes: savedMeeting.additionalNotes,
          })
          .catch((err: unknown) => console.error('[runAIGeneration] Failed to persist meeting:', err));
      }
      if (window.electronAPI?.dbReplaceActionItems) {
        window.electronAPI
          .dbReplaceActionItems(meetingId, [])
          .catch((err: unknown) => console.error('[runAIGeneration] Failed to persist action items:', err));
      }

      return true;
    }

    // Stage 1: Generate primary summary and title first. This ensures the core
    // document succeeds before secondary extractions and stays well within
    // tokens-per-minute (TPM) limits on providers like Groq.
    const [summaryResult, titleResult] = await Promise.allSettled([
      activeProvider.generateSummary(combinedTranscriptText),
      activeProvider.generateMeetingTitle(combinedTranscriptText),
    ]);

    // Stage 2: Generate secondary extractions (action items, decisions, follow-ups)
    const [actionItemsResult, decisionsResult, followUpsResult] = await Promise.allSettled([
      activeProvider.extractActionItems(combinedTranscriptText),
      activeProvider.extractDecisions(combinedTranscriptText),
      activeProvider.extractFollowUps(combinedTranscriptText),
    ]);

    const results = [summaryResult, titleResult, actionItemsResult, decisionsResult, followUpsResult];

    const failures = results
      .map((r, i) => (r.status === 'rejected' ? { field: ['summary', 'title', 'action items', 'decisions', 'follow-ups'][i], reason: r.reason } : null))
      .filter((f): f is { field: string; reason: unknown } => f !== null);

    if (failures.length > 0) {
      for (const f of failures) {
        console.warn(`[runAIGeneration] Failed to generate ${f.field}:`, f.reason);
      }
    }

    // A completely failed summary (the one field the rest of the document is
    // built around) means there's nothing meaningful to save — surface that
    // as an overall failure. Partial failures on the other fields still
    // proceed with whatever succeeded, using an empty/omitted fallback for
    // whichever ones didn't.
    if (summaryResult.status === 'rejected') {
      throw summaryResult.reason instanceof Error
        ? summaryResult.reason
        : new Error(String(summaryResult.reason));
    }

    const summary = stripMarkdownSyntax(summaryResult.value);
    const title = titleResult.status === 'fulfilled' ? stripMarkdownSyntax(titleResult.value) : '';
    let actionItems = (actionItemsResult.status === 'fulfilled' ? actionItemsResult.value : []).map(stripMarkdownSyntax);
    const decisions = (decisionsResult.status === 'fulfilled' ? decisionsResult.value : []).map(stripMarkdownSyntax);
    const followUps = (followUpsResult.status === 'fulfilled' ? followUpsResult.value : []).map(stripMarkdownSyntax);

    // If no action items were returned directly (e.g. call failed or provider found no explicit tasks),
    // extract actionable commitments from the generated summary so the Action Items panel is always populated.
    if (actionItems.length === 0 && summary) {
      const candidateLines = summary
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10 && /agreed|commit|share|train|document|monitor|review|schedule|follow|plan|will|should|need to/i.test(s))
        .map((s) => s.replace(/^[-*•\s]+/, '').replace(/^Overall outcome:?\s*/i, ''));
      if (candidateLines.length > 0) {
        actionItems = candidateLines.slice(0, 4);
      }
    }

    // Legacy aiNotes field (plain text, no markdown symbols — this content is
    // also used verbatim in email shares, so it must render correctly as
    // plain text with no literal #/* characters)
    const structuredNotes = [
      `Summary\n${summary}`,
      decisions.length > 0 ? `Decisions\n${decisions.map((d) => `- ${d}`).join('\n')}` : '',
      followUps.length > 0 ? `Follow-ups\n${followUps.map((f) => `- ${f}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // Primary aiSummary — Granola-style editable document.
    // Plain text only: no markdown headers (##) or bold markers (**), since
    // this same text is displayed as-is in the app and copied verbatim into
    // email shares — literal markdown symbols would show up in both places.
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const docLines: string[] = [
      `${title || meeting.title} — ${dateLabel}`,
      '',
      `Participants: ${meeting.participants.join(', ')}`,
      '',
      'SUMMARY',
      '',
      summary,
      '',
    ];

    if (decisions.length > 0) {
      docLines.push('DECISIONS', '', ...decisions.map((d) => `- ${d}`), '');
    }
    if (followUps.length > 0) {
      docLines.push('FOLLOW-UPS', '', ...followUps.map((f) => `- ${f}`));
    }

    const aiSummaryDoc = docLines.join('\n');

    const formattedActionItems = actionItems.map((item, idx) => ({
      id: `ai-item-${Date.now()}-${idx}`,
      text: item,
      done: false,
    }));

    // Persist to Zustand store AND to the local database. Using raw setState
    // here (as before) only updated in-memory state — the generated summary
    // and action items were never written to SQLite, so they silently
    // disappeared on app restart even though the transcript and manually
    // toggled action items survived (those go through appendTranscriptLine /
    // toggleActionItem, which do call the persistence IPC helpers).
    useAppStore.setState((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              title: title || m.title,
              aiNotes: structuredNotes,
              aiSummary: aiSummaryDoc,
              actionItems: formattedActionItems,
              preview: summary.substring(0, 120) + '...',
            }
          : m
      ),
    }));

    const savedMeeting = useAppStore.getState().meetings.find((m) => m.id === meetingId);
    if (savedMeeting && window.electronAPI?.dbUpsertMeeting) {
      window.electronAPI
        .dbUpsertMeeting({
          id: savedMeeting.id,
          title: savedMeeting.title,
          date: savedMeeting.date,
          time: savedMeeting.time,
          duration: savedMeeting.duration,
          preview: savedMeeting.preview,
          participants: savedMeeting.participants,
          timeline: savedMeeting.timeline,
          aiNotes: savedMeeting.aiNotes,
          aiSummary: savedMeeting.aiSummary,
          additionalNotes: savedMeeting.additionalNotes,
        })
        .catch((err: unknown) => console.error('[runAIGeneration] Failed to persist meeting:', err));
    }
    if (window.electronAPI?.dbReplaceActionItems) {
      window.electronAPI
        .dbReplaceActionItems(meetingId, formattedActionItems)
        .catch((err: unknown) => console.error('[runAIGeneration] Failed to persist action items:', err));
    }

    return true;
  } catch (err) {
    console.error('[runAIGeneration] Failed:', err);
    return false;
  } finally {
    useAppStore.getState().setIsProcessingAI(false);
  }
}
