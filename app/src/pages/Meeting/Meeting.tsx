import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, MessageSquare, Sparkles, Plus, Bot } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { MeetingHeader } from '../../components/MeetingHeader';
import { TranscriptPanel } from '../../components/TranscriptPanel';
import { SummaryPanel } from '../../components/SummaryPanel';
import { ActionItemsPanel } from '../../components/ActionItemsPanel';
import { ShareMenu } from '../../components/ShareMenu';
import { EmptyState } from '../../components/EmptyState';
import { QuickActionButton } from '../../components/QuickActionButton';
import { useAppStore } from '../../store/useAppStore';

type WorkspaceTab = 'transcript' | 'summary';

/**
 * Meeting Workspace
 *
 * Recording controls live inside MeetingHeader (right side).
 * The standalone AudioRecorder card has been removed.
 *
 * Layout strategy — two distinct scroll modes:
 *
 *  TRANSCRIPT tab:
 *    The outer container stays fixed-height (flex-1, overflow-hidden).
 *    Only the TranscriptPanel's inner list scrolls.
 *    Preserves live-scroll behaviour during recording.
 *
 *  SUMMARY tab:
 *    Single vertical scroll — header + tabs + summary + actions + share.
 *    No nested scrollbars.
 */
export const Meeting = () => {
  const navigate = useNavigate();
  const { meetings, activeMeetingId, createMockNote, recordingStatus, isProcessingAI } =
    useAppStore();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('transcript');

  const activeMeeting =
    meetings.find((m) => m.id === activeMeetingId) || meetings[0];

  const handleCreateNote = () => { createMockNote(); };

  const handleGenerationComplete = () => { setActiveTab('summary'); };

  const summaryTabLabel = isProcessingAI ? 'Generating…' : 'Summary';

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const renderTabBar = () => (
    <div className="flex items-center gap-1 select-none">
      <button
        onClick={() => setActiveTab('transcript')}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer"
        style={{
          background: activeTab === 'transcript' ? 'var(--bg-card)' : 'transparent',
          color: activeTab === 'transcript' ? 'var(--text-primary)' : 'var(--text-muted)',
          border: `1px solid ${activeTab === 'transcript' ? 'var(--border-strong)' : 'transparent'}`,
          boxShadow: activeTab === 'transcript' ? 'var(--shadow-sm)' : 'none',
        }}
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Transcript
        {activeMeeting && activeMeeting.transcript.length > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{
              background: activeTab === 'transcript' ? 'var(--bg-hover)' : 'var(--bg-card)',
              color: 'var(--text-muted)',
            }}
          >
            {activeMeeting.transcript.length}
          </span>
        )}
      </button>

      <button
        onClick={() => setActiveTab('summary')}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer"
        style={{
          background: activeTab === 'summary' ? 'var(--bg-card)' : 'transparent',
          color: activeTab === 'summary' ? 'var(--text-primary)' : 'var(--text-muted)',
          border: `1px solid ${activeTab === 'summary' ? 'var(--border-strong)' : 'transparent'}`,
          boxShadow: activeTab === 'summary' ? 'var(--shadow-sm)' : 'none',
        }}
      >
        <Sparkles
          className={`w-3.5 h-3.5 ${isProcessingAI ? 'animate-pulse' : ''}`}
          style={{ color: isProcessingAI ? 'var(--accent)' : 'currentColor' }}
        />
        {summaryTabLabel}
        {activeMeeting?.aiSummary && !isProcessingAI && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{
              background: activeTab === 'summary' ? 'var(--accent-subtle)' : 'var(--bg-card)',
              color: activeTab === 'summary' ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            Ready
          </span>
        )}
      </button>

      {/* Status pill */}
      <div className="ml-auto flex items-center gap-3">
        {activeMeeting && (
          <button
            onClick={() => navigate(`/chat?meetingId=${activeMeeting.id}`)}
            className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
            style={{ color: 'var(--accent)', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
          >
            <Bot className="w-3.5 h-3.5" />
            Ask AI
          </button>
        )}
        {recordingStatus === 'recording' && (
          <span
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--error)' }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--error)' }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--error)' }} />
            </span>
            Recording
          </span>
        )}
        {recordingStatus === 'stopped' &&
          activeMeeting &&
          activeMeeting.transcript.length > 0 &&
          !activeMeeting.aiSummary &&
          !isProcessingAI && (
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
              Ready to summarise
            </span>
          )}
      </div>
    </div>
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!activeMeeting) {
    return (
      <ContentLayout
        title="Meeting Workspace"
        description="Start a session to inspect notes."
        fullHeight={false}
        headerActions={
          <QuickActionButton
            label="New Note"
            variant="primary"
            onClick={handleCreateNote}
            icon={<Plus className="w-3.5 h-3.5" />}
          />
        }
      >
        <div className="flex items-center justify-center py-24 select-none">
          <EmptyState
            icon={<ListTodo className="w-6 h-6" />}
            title="No meeting selected"
            description="Create a new note or choose an existing meeting from the dashboard."
            action={
              <QuickActionButton
                label="Create a Note"
                variant="primary"
                onClick={handleCreateNote}
                icon={<Plus className="w-3.5 h-3.5" />}
              />
            }
          />
        </div>
      </ContentLayout>
    );
  }

  // ── TRANSCRIPT tab — fixed-height, internal scroll ────────────────────────
  if (activeTab === 'transcript') {
    return (
      <ContentLayout
        title="Meeting Workspace"
        description="Record, transcribe, and generate AI summaries for your meetings."
        fullHeight={true}
        headerActions={
          <QuickActionButton
            label="New Note"
            variant="primary"
            onClick={handleCreateNote}
            icon={<Plus className="w-3.5 h-3.5" />}
          />
        }
      >
        <div className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Header with recording controls built-in */}
          <div className="shrink-0">
            <MeetingHeader meeting={activeMeeting} />
          </div>
          <div className="shrink-0">{renderTabBar()}</div>
          <div className="flex-1 min-h-0">
            <TranscriptPanel meeting={activeMeeting} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  // ── SUMMARY tab — natural document scroll ─────────────────────────────────
  return (
    <ContentLayout
      title="Meeting Workspace"
      description="Record, transcribe, and generate AI summaries for your meetings."
      fullHeight={false}
      headerActions={
        <QuickActionButton
          label="New Note"
          variant="primary"
          onClick={handleCreateNote}
          icon={<Plus className="w-3.5 h-3.5" />}
        />
      }
    >
      <div className="flex flex-col gap-4 pb-6">
        <MeetingHeader meeting={activeMeeting} />
        {renderTabBar()}
        <SummaryPanel
          meeting={activeMeeting}
          onGenerationComplete={handleGenerationComplete}
          naturalHeight
        />
        <ActionItemsPanel meeting={activeMeeting} />
        <ShareMenu
          meeting={activeMeeting}
          senderName={activeMeeting.participants[0]}
        />
      </div>
    </ContentLayout>
  );
};

export default Meeting;
