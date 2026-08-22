import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, FolderOpen, LayoutGrid, List, Search, X, Clock, Users, ArrowRight, Trash2 } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { MeetingCard } from '../../components/MeetingCard';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState } from '../../components/EmptyState';
import { QuickActionButton } from '../../components/QuickActionButton';
import { useAppStore } from '../../store/useAppStore';
import { stripMarkdownSyntax } from '../../services/ai/textSanitizer';
import { resolveDisplayDuration } from '../../services/meetingDuration';
import { Plus } from 'lucide-react';

type ViewMode = 'tiles' | 'list';

const VIEW_MODE_KEY = 'mirai-dashboard-view-mode';

/** Quick check for leftover markdown syntax from summaries generated before the sanitizer was added. */
const hasMarkdownArtifacts = (text: string): boolean =>
  /\*\*.+?\*\*|__.+?__|^#{1,6}\s|```|^\s*\|.*\|\s*$/m.test(text);

export const Home = () => {
  const navigate = useNavigate();
  const { meetings, createMockNote, deleteMeeting, setActiveMeetingId, recordingStatus, activeMeetingId } = useAppStore();
  const [greeting, setGreeting] = useState('Welcome');
  const [formattedDate, setFormattedDate] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return saved === 'list' ? 'list' : 'tiles';
    } catch {
      return 'tiles';
    }
  });

  useEffect(() => {
    const hours = new Date().getHours();
    setGreeting(hours < 12 ? 'Good Morning' : hours < 17 ? 'Good Afternoon' : 'Good Evening');
    setFormattedDate(
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    );
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  const handleCreateNote = () => {
    createMockNote();
    navigate('/meeting');
  };

  const handleSelectMeeting = (id: string) => {
    setActiveMeetingId(id);
    navigate('/meeting');
  };

  // Search matches the meeting title, or the date/time text shown on each
  // card (e.g. typing "Aug 20", "12:33 PM", or "Thursday" all match) — the
  // two things the user can actually see and recall about a past meeting.
  const searchTerm = search.trim().toLowerCase();
  const filteredMeetings = useMemo(() => {
    if (!searchTerm) return meetings;
    return meetings.filter((m) => {
      const haystack = `${m.title} ${m.date} ${m.time}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [meetings, searchTerm]);

  const ViewToggle = () => (
    <div
      className="flex items-center rounded-lg p-0.5 shrink-0"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <button
        onClick={() => setViewMode('tiles')}
        title="Tile view"
        className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-colors"
        style={{
          background: viewMode === 'tiles' ? 'var(--accent-subtle)' : 'transparent',
          color: viewMode === 'tiles' ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setViewMode('list')}
        title="List view"
        className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-colors"
        style={{
          background: viewMode === 'list' ? 'var(--accent-subtle)' : 'transparent',
          color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        <List className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderListView = () => (
    <div
      className="rounded-xl overflow-hidden select-none"
      style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div
        className="px-5 py-3.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
        style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <span>Meeting Title</span>
        <div className="flex gap-16 mr-16">
          <span className="hidden sm:inline">Date &amp; Time</span>
          <span className="hidden md:inline">Duration</span>
          <span className="hidden lg:inline">Attendees</span>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface-2)' }}>
        {filteredMeetings.map((meeting) => (
          <div
            key={meeting.id}
            onClick={() => handleSelectMeeting(meeting.id)}
            className="flex items-center justify-between p-5 transition-colors duration-150 cursor-pointer group"
            style={{ borderBottom: '1px solid var(--divide)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <div className="min-w-0 flex-1 pr-4">
              <h4
                className="text-sm font-bold truncate transition-colors duration-150"
                style={{ color: 'var(--text-primary)' }}
              >
                {meeting.title || 'Untitled Note'}
              </h4>
              <p className="text-xs truncate mt-0.5 leading-normal" style={{ color: 'var(--text-tertiary)' }}>
                {recordingStatus === 'recording' && activeMeetingId === meeting.id
                  ? '🔴 Recording in progress…'
                  : meeting.preview === 'Recording in progress…' || !meeting.preview
                  ? 'No summary generated yet.'
                  : hasMarkdownArtifacts(meeting.preview)
                  ? stripMarkdownSyntax(meeting.preview)
                  : meeting.preview}
              </p>
            </div>

            <div
              className="flex items-center gap-10 lg:gap-16 text-xs font-medium shrink-0"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <div className="hidden sm:block text-right">
                <span className="block" style={{ color: 'var(--text-secondary)' }}>
                  {meeting.date}
                </span>
                <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                  {meeting.time}
                </span>
              </div>
              <div className="hidden md:block w-16">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" style={{ color: 'var(--text-disabled)' }} />
                  {resolveDisplayDuration(meeting)}
                </span>
              </div>
              <div className="hidden lg:block w-24">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-disabled)' }} />
                  {meeting.participants.length} people
                </span>
              </div>
              <ArrowRight
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                style={{ color: 'var(--text-disabled)' }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMeeting(meeting.id);
                }}
                title="Delete meeting"
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all cursor-pointer shrink-0"
                style={{ color: 'var(--text-disabled)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#60A5FA';
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-disabled)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTilesView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {filteredMeetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          id={meeting.id}
          title={meeting.title}
          date={meeting.date}
          time={meeting.time}
          duration={resolveDisplayDuration(meeting)}
          preview={meeting.preview}
          participants={meeting.participants}
          onClick={() => handleSelectMeeting(meeting.id)}
          onDelete={deleteMeeting}
        />
      ))}
    </div>
  );

  return (
    // No headerActions — New Note lives in the sidebar, no duplication
    <ContentLayout
      title="Dashboard"
      description="Track upcoming sessions and review your recent meeting notes."
    >
      <div className="space-y-8 select-none">
        {/* Welcome Banner */}
        <div>
          <h2
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {greeting}
          </h2>
          <p
            className="text-sm font-medium mt-1 flex items-center gap-1.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Calendar className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            {formattedDate}
          </p>
        </div>

        {/* Recent Meeting Notes */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeader
              title="Recent Meeting Notes"
              action={
                meetings.length > 0 ? (
                  <span
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {filteredMeetings.length} {filteredMeetings.length === meetings.length ? 'Notes' : `of ${meetings.length}`}
                  </span>
                ) : undefined
              }
            />

            {meetings.length > 0 && (
              <div className="flex items-center gap-2 select-none">
                {/* Search — matches meeting title or the date/time text shown on cards */}
                <div className="relative w-56 sm:w-64">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-muted)', width: '14px', height: '14px' }}
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by title or time…"
                    className="mg-input text-xs pr-7"
                    style={{ paddingLeft: '32px' }}
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

                <ViewToggle />
              </div>
            )}
          </div>

          {meetings.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="w-6 h-6" />}
              title="No meetings yet"
              description="Capture your first meeting, format transcriptions, and run summary templates."
              action={
                <QuickActionButton
                  label="Create a Note"
                  variant="primary"
                  onClick={handleCreateNote}
                  icon={<Plus className="w-3.5 h-3.5" />}
                />
              }
            />
          ) : filteredMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center select-none">
              <Search className="w-7 h-7 mb-3" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No meetings match{' '}
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
          ) : viewMode === 'tiles' ? (
            renderTilesView()
          ) : (
            renderListView()
          )}
        </div>
      </div>
    </ContentLayout>
  );
};
