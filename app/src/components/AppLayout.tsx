import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MeetingNotification } from './MeetingNotification';
import { meetingDetectionService } from '../services/meeting/MeetingDetectionService';
import { useAppStore } from '../store/useAppStore';

export const AppLayout = () => {
  const hydrateFromDb = useAppStore((state) => state.hydrateFromDb);
  const hydrateChatFromDb = useAppStore((state) => state.hydrateChatFromDb);
  const audioRetentionDays = useAppStore((state) => state.audioRetentionDays);

  useEffect(() => {
    void hydrateFromDb();
    void hydrateChatFromDb();
  }, [hydrateFromDb, hydrateChatFromDb]);

  // Apply the audio retention policy once per app launch — deletes any
  // recording older than the configured window. Runs after hydration so it
  // doesn't race the initial DB/UI setup; failures are logged only, never
  // block startup.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.applyAudioRetention) return;
    api
      .applyAudioRetention(audioRetentionDays)
      .then((result) => {
        if (result.ok && result.deletedCount > 0) {
          console.info(`[AppLayout] Audio retention: deleted ${result.deletedCount} expired recording(s).`);
        }
      })
      .catch((err) => console.error('[AppLayout] Audio retention cleanup failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    meetingDetectionService.start();
    return () => meetingDetectionService.stop();
  }, []);

  return (
    <div
      className="flex w-screen h-screen overflow-hidden font-sans antialiased"
      style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Outlet />
      </div>
      <MeetingNotification />
    </div>
  );
};
