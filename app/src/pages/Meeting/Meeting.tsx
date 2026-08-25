import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, MessageSquare, Sparkles, Plus, Bot, AlertCircle } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { MeetingHeader } from '../../components/MeetingHeader';
import { SystemAudioCriticalBanner } from '../../components/SystemAudioCriticalBanner';
import { AudioSourceDebugPanel } from '../../components/AudioSourceDebugPanel';
import { TranscriptPanel } from '../../components/TranscriptPanel';
import { AdditionalNotes } from '../../components/AdditionalNotes';
import { SummaryPanel } from '../../components/SummaryPanel';
import { ActionItemsPanel } from '../../components/ActionItemsPanel';
import { ShareMenu } from '../../components/ShareMenu';
import { EmptyState } from '../../components/EmptyState';
import { QuickActionButton } from '../../components/QuickActionButton';
import { NoteTemplateSelector } from '../../components/NoteTemplateSelector';
import { CandidateScorecard } from '../../components/CandidateScorecard';
import { ClientRequirementsPanel } from '../../components/ClientRequirementsPanel';
import { RecruitmentMetricsPanel } from '../../components/RecruitmentMetricsPanel';
import { HrStrategyPanel } from '../../components/HrStrategyPanel';
import { PerformanceFeedbackPanel } from '../../components/PerformanceFeedbackPanel';
import { TeamRecapPanel } from '../../components/TeamRecapPanel';
import { CustomTemplatePanel } from '../../components/CustomTemplatePanel';
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
  const { meetings, activeMeetingId, createMockNote, recordingStatus, isProcessingAI, transcriptionStatus, lastTranscriptionError } =
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
        {/* Transcription failure indicator — must NOT be gated on
            recordingStatus === 'recording': post-recording providers
            (AssemblyAI, Deepgram, Gemini) transcribe AFTER stop(), so a
            failure here happens while recordingStatus is already 'stopped'.
            Without this, a failed post-recording transcription was
            previously silently swallowed with zero visible feedback. */}
        {transcriptionStatus === 'error' && recordingStatus !== 'recording' && (
          <span
            title={lastTranscriptionError || 'Transcription failed. You can try recording again.'}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-default"
            style={{ color: 'var(--warning)' }}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Transcription failed
          </span>
        )}
        {recordingStatus === 'stopped' &&
          activeMeeting &&
          activeMeeting.transcript.length > 0 &&
          !activeMeeting.aiSummary &&
          !isProcessingAI && (
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--success)' }}>
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

  // ── TRANSCRIPT tab — page scrolls as one unit, transcript card keeps its
  //    full intended height (does not shrink to make room for Additional
  //    Notes below it) ─────────────────────────────────────────────────────
  if (activeTab === 'transcript') {
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
          {/* Header with recording controls built-in */}
          <MeetingHeader meeting={activeMeeting} />
          <SystemAudioCriticalBanner />
          <AudioSourceDebugPanel />
          {renderTabBar()}
          <div className="h-[65vh] min-h-[420px]">
            <TranscriptPanel meeting={activeMeeting} />
          </div>
          <AdditionalNotes meeting={activeMeeting} />
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
        <SystemAudioCriticalBanner />
        <AudioSourceDebugPanel />
        
        {/* Template Selector & Toolbar matching Granola UI */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/50">
          <NoteTemplateSelector meetingId={activeMeeting.id} currentTemplateId={activeMeeting.templateId} />
        </div>

        {renderTabBar()}

        {/* Specialized Meeting Rubrics & Panels based on selected mode */}
        {activeMeeting.templateId === 'interview' && (
          <CandidateScorecard meetingId={activeMeeting.id} candidateInfo={activeMeeting.candidateInfo} />
        )}

        {activeMeeting.templateId === 'client' && (
          <ClientRequirementsPanel meetingId={activeMeeting.id} clientInfo={activeMeeting.clientInfo} />
        )}

        {activeMeeting.templateId === 'recruitment_metrics' && (
          <RecruitmentMetricsPanel meetingId={activeMeeting.id} recruitmentMetricsInfo={activeMeeting.recruitmentMetricsInfo} />
        )}

        {activeMeeting.templateId === 'hr_strategy' && (
          <HrStrategyPanel meetingId={activeMeeting.id} hrStrategyInfo={activeMeeting.hrStrategyInfo} />
        )}

        {activeMeeting.templateId === 'performance_feedback' && (
          <PerformanceFeedbackPanel meetingId={activeMeeting.id} performanceFeedbackInfo={activeMeeting.performanceFeedbackInfo} />
        )}

        {activeMeeting.templateId === 'team_recap' && (
          <TeamRecapPanel meetingId={activeMeeting.id} teamRecapInfo={activeMeeting.teamRecapInfo} />
        )}

        {Boolean(activeMeeting.templateId?.startsWith('custom_')) && (
          <CustomTemplatePanel
            meetingId={activeMeeting.id}
            templateId={activeMeeting.templateId!}
            customInfo={activeMeeting.customTemplateInfo}
          />
        )}

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
