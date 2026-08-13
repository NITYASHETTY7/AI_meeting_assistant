import { useAppStore } from '../../store/useAppStore';
import { ProviderManager } from '../ai/ProviderManager';

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
    const activeProvider = ProviderManager.getActiveProvider();

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

    // Run all extractions in parallel for speed
    const [summary, title, actionItems, decisions, followUps] = await Promise.all([
      activeProvider.generateSummary(transcriptText),
      activeProvider.generateMeetingTitle(transcriptText),
      activeProvider.extractActionItems(transcriptText),
      activeProvider.extractDecisions(transcriptText),
      activeProvider.extractFollowUps(transcriptText),
    ]);

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
