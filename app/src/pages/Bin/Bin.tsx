import { useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, Search, X, Clock, AlertTriangle } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { SectionHeader } from '../../components/SectionHeader';
import { EmptyState } from '../../components/EmptyState';
import { useAppStore } from '../../store/useAppStore';
import { stripMarkdownSyntax } from '../../services/ai/textSanitizer';

/** Quick check for leftover markdown syntax from summaries generated before the sanitizer was added. */
const hasMarkdownArtifacts = (text: string): boolean =>
  /\*\*.+?\*\*|__.+?__|^#{1,6}\s|```|^\s*\|.*\|\s*$/m.test(text);

/** Formats a deletedAt timestamp as a relative "X ago" string, falling back to a date for older entries. */
const formatDeletedAt = (ms?: number): string => {
  if (!ms) return '';
  const diffMs = Date.now() - ms;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const Bin = () => {
  const { deletedMeetings, isBinHydrated, hydrateBinFromDb, restoreMeeting, permanentlyDeleteMeeting, emptyBin } = useAppStore();
  const [search, setSearch] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isConfirmingEmpty, setIsConfirmingEmpty] = useState(false);

  useEffect(() => {
    if (!isBinHydrated) {
      void hydrateBinFromDb();
    }
  }, [isBinHydrated, hydrateBinFromDb]);

  const searchTerm = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchTerm) return deletedMeetings;
    return deletedMeetings.filter((m) => {
      const haystack = `${m.title} ${m.date} ${m.time}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [deletedMeetings, searchTerm]);

  const handlePermanentDelete = (id: string) => {
    if (confirmingId !== id) {
      // First click asks for confirmation instead of deleting immediately —
      // this action is irreversible (transcript, notes, and chat history
      // for the meeting are erased for good).
      setConfirmingId(id);
      return;
    }
    permanentlyDeleteMeeting(id);
    setConfirmingId(null);
  };

  const handleEmptyBin = () => {
    if (!isConfirmingEmpty) {
      setIsConfirmingEmpty(true);
      return;
    }
    emptyBin();
    setIsConfirmingEmpty(false);
  };

  return (
    <ContentLayout
      title="Bin"
      description="Deleted meetings are kept here until you restore or permanently delete them."
      headerActions={
        deletedMeetings.length > 0 ? (
          <button
            onClick={handleEmptyBin}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              isConfirmingEmpty
                ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-zinc-800/80 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-zinc-200 dark:border-zinc-700'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isConfirmingEmpty ? 'Click to Confirm Empty' : 'Empty Bin'}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6 select-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            title="Deleted Meetings"
            action={
              deletedMeetings.length > 0 ? (
                <span
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: 'var(--bg-card)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {filtered.length} {filtered.length === deletedMeetings.length ? 'Items' : `of ${deletedMeetings.length}`}
                </span>
              ) : undefined
            }
          />

          {deletedMeetings.length > 0 && (
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
          )}
        </div>

        {!isBinHydrated ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
          </div>
        ) : deletedMeetings.length === 0 ? (
          <EmptyState
            icon={<Trash2 className="w-6 h-6" />}
            title="Bin is empty"
            description="Meetings you delete from Home will show up here, where you can restore them or delete them for good."
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
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
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          >
            <div style={{ background: 'var(--bg-surface-2)' }}>
              {filtered.map((meeting) => {
                const preview =
                  meeting.preview === 'Recording in progress…' || !meeting.preview
                    ? 'No summary generated yet.'
                    : hasMarkdownArtifacts(meeting.preview)
                    ? stripMarkdownSyntax(meeting.preview)
                    : meeting.preview;
                const isConfirming = confirmingId === meeting.id;

                return (
                  <div
                    key={meeting.id}
                    className="flex items-center justify-between p-5"
                    style={{ borderBottom: '1px solid var(--divide)' }}
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <h4 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {meeting.title || 'Untitled Note'}
                      </h4>
                      <p className="text-xs truncate mt-0.5 leading-normal" style={{ color: 'var(--text-tertiary)' }}>
                        {preview}
                      </p>
                      <p
                        className="text-[11px] mt-1.5 flex items-center gap-1.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Clock className="w-3 h-3" />
                        Deleted {formatDeletedAt(meeting.deletedAt)} · originally {meeting.date} · {meeting.time}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => restoreMeeting(meeting.id)}
                        title="Restore meeting"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        style={{
                          background: 'var(--accent-subtle)',
                          color: 'var(--accent)',
                          border: '1px solid var(--accent-border)',
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore
                      </button>

                      <button
                        onClick={() => handlePermanentDelete(meeting.id)}
                        onBlur={() => setConfirmingId((current) => (current === meeting.id ? null : current))}
                        title={isConfirming ? 'Click again to permanently delete' : 'Delete forever'}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        style={{
                          background: isConfirming ? 'rgba(239, 68, 68, 0.16)' : 'transparent',
                          color: isConfirming ? '#EF4444' : 'var(--text-disabled)',
                          border: `1px solid ${isConfirming ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)'}`,
                        }}
                      >
                        {isConfirming ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                        {isConfirming ? 'Confirm delete' : 'Delete forever'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
};
