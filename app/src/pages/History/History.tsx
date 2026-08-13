import { useNavigate } from 'react-router-dom';
import { Clock, Users, ArrowRight, FolderClosed } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { useAppStore } from '../../store/useAppStore';
import { EmptyState } from '../../components/EmptyState';

export const History = () => {
  const navigate = useNavigate();
  const { meetings, setActiveMeetingId } = useAppStore();

  const handleSelectMeeting = (id: string) => {
    setActiveMeetingId(id);
    navigate('/meeting');
  };

  return (
    <ContentLayout
      title="History"
      description="View details and notes from all your captured meetings."
    >
      {meetings.length === 0 ? (
        <div className="flex items-center justify-center h-[450px]">
          <EmptyState
            icon={<FolderClosed className="w-6 h-6" />}
            title="History is empty"
            description="Your past recorded sessions will be indexed here for quick retrieval."
          />
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden select-none"
          style={{
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            className="px-5 py-3.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            <span>Meeting Title</span>
            <div className="flex gap-16 mr-16">
              <span className="hidden sm:inline">Date &amp; Time</span>
              <span className="hidden md:inline">Duration</span>
              <span className="hidden lg:inline">Attendees</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface-2)' }}>
            {meetings.map((meeting) => (
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
                  <p
                    className="text-xs truncate mt-0.5 leading-normal"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {meeting.preview}
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
                      {meeting.duration}
                    </span>
                  </div>
                  <div className="hidden lg:block w-24">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-disabled)' }} />
                      {meeting.participants.length} people
                    </span>
                  </div>
                  <ArrowRight
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 pr-2"
                    style={{ color: 'var(--text-disabled)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ContentLayout>
  );
};
