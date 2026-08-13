import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, FolderOpen } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { MeetingCard } from '../../components/MeetingCard';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState } from '../../components/EmptyState';
import { QuickActionButton } from '../../components/QuickActionButton';
import { useAppStore } from '../../store/useAppStore';
import { Plus } from 'lucide-react';

export const Home = () => {
  const navigate = useNavigate();
  const { meetings, createMockNote, deleteMeeting, setActiveMeetingId } = useAppStore();
  const [greeting, setGreeting] = useState('Welcome');
  const [formattedDate, setFormattedDate] = useState('');

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

  const handleCreateNote = () => {
    createMockNote();
    navigate('/meeting');
  };

  const handleSelectMeeting = (id: string) => {
    setActiveMeetingId(id);
    navigate('/meeting');
  };

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
                  {meetings.length} Notes
                </span>
              ) : undefined
            }
          />

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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  id={meeting.id}
                  title={meeting.title}
                  date={meeting.date}
                  time={meeting.time}
                  duration={meeting.duration}
                  preview={meeting.preview}
                  participants={meeting.participants}
                  onClick={() => handleSelectMeeting(meeting.id)}
                  onDelete={deleteMeeting}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentLayout>
  );
};
