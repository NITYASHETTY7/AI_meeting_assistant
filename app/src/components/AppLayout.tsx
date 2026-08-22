import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MeetingNotification } from './MeetingNotification';
import { meetingDetectionService } from '../services/meeting/MeetingDetectionService';
import { useAppStore } from '../store/useAppStore';

/** localStorage key for the last visited route — see App.tsx for where this is restored. */
export const LAST_ROUTE_KEY = 'mirai-last-route';

export const AppLayout = () => {
  const hydrateFromDb = useAppStore((state) => state.hydrateFromDb);
  const hydrateChatFromDb = useAppStore((state) => state.hydrateChatFromDb);
  const hydrateBinFromDb = useAppStore((state) => state.hydrateBinFromDb);
  const audioRetentionDays = useAppStore((state) => state.audioRetentionDays);
  const location = useLocation();

  // Persist the current route (path + query string, e.g. "/chat?meetingId=x")
  // on every navigation. If the renderer ever hard-reloads unexpectedly
  // (e.g. a Chromium network-service crash taking the page down mid-request),
  // HashRouter resets to the bare "/" hash on reload — this lets App.tsx
  // send the user back to whatever page/thread they were actually on instead
  // of always landing on Home with no explanation.
  useEffect(() => {
    try {
      localStorage.setItem(LAST_ROUTE_KEY, location.pathname + location.search);
    } catch {
      // ignore — this is a best-effort recovery aid, not required for correctness
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    void hydrateFromDb();
    void hydrateChatFromDb();
    void hydrateBinFromDb();
  }, [hydrateFromDb, hydrateChatFromDb, hydrateBinFromDb]);

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
      className="flex w-screen h-screen overflow-hidden font-sans antialiased relative"
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
