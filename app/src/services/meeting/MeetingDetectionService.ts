import { BrowserDetector } from './BrowserDetector';
import { DesktopAppDetector } from './DesktopAppDetector';
import { useAppStore, type DetectedMeeting } from '../../store/useAppStore';

/** Poll interval in milliseconds. 5 seconds is responsive without being chatty. */
const POLL_INTERVAL_MS = 5_000;

/** Emit debug logs in development mode only. */
const DEBUG = import.meta.env.DEV === true;

function debugLog(message: string, data?: Record<string, unknown>) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  if (data) {
    console.debug(`[MeetingDetection ${ts}] ${message}`, data);
  } else {
    console.debug(`[MeetingDetection ${ts}] ${message}`);
  }
}

/**
 * MeetingDetectionService
 *
 * Orchestrates DesktopAppDetector and BrowserDetector on a polling interval.
 *
 * ── V1 DETECTION PIPELINE ───────────────────────────────────────────────────
 *
 * Each poll cycle runs three ordered passes against the OS window title list:
 *
 *   PASS 1 — Microsoft Teams Desktop  (V1 first-class)
 *     DesktopAppDetector with a Teams-only title filter.
 *     Matches native Teams app on Windows/macOS/Linux.
 *     Highest priority — avoids any ambiguity with browser titles.
 *
 *   PASS 2 — Microsoft Teams Web  (V1 first-class)
 *     BrowserDetector with a Teams-only title filter.
 *     Matches Teams running in Edge, Chrome, Brave, Arc, Firefox, or any browser.
 *     Teams-in-Edge ("... - Microsoft Edge") and Teams-in-Chrome
 *     ("... - Google Chrome") behave identically to the desktop app from the
 *     user's perspective — same notification, same recording flow.
 *
 *   PASS 3 — All other supported platforms  (future-supported)
 *     Full DesktopAppDetector scan (Zoom, Slack Huddle, Discord, Webex).
 *     Full BrowserDetector scan (Google Meet, Zoom Web, Webex Web).
 *     These are architecture-ready but not UX-polished in V1.
 *     Do NOT remove — they ensure immediate extensibility.
 *
 * ── NOTIFICATION DEDUPLICATION ──────────────────────────────────────────────
 *
 *   - Each unique meeting gets at most ONE notification.
 *   - The meeting ID is a stable hash of (detector, source, label). Some apps
 *     (e.g. Teams desktop) keep the same window title for the whole call, so
 *     the ID does not change between polls while that call is ongoing.
 *   - Once the user dismisses a meeting (or starts recording from the
 *     banner), its ID is added to `dismissedMeetingIds` and stays suppressed
 *     only while that meeting keeps being detected. The moment a poll finds
 *     no matching window at all (the call actually ended), the ID is
 *     released — so a later, distinct call that happens to produce the same
 *     title (e.g. another call with the same person) will notify normally.
 *   - The notification is also suppressed while recording is active.
 *
 * ── ARCHITECTURE NOTE ───────────────────────────────────────────────────────
 *
 *   This service is completely decoupled from the AI, Audio, and Transcription
 *   layers. It only writes to the Zustand store:
 *     - setDetectedMeeting()
 *     - setMeetingNotificationVisible()
 *
 *   BrowserDetector and DesktopAppDetector are kept as separate classes so
 *   they can be independently tested and extended without touching this file.
 */
export class MeetingDetectionService {
  private desktop = new DesktopAppDetector();
  private browser = new BrowserDetector();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastDetectedId: string | null = null;
  private pollCount = 0;
  /**
   * Timestamp (per exact meeting ID) of the last time a notification was
   * shown for that meeting. This is a safety net against a poll re-showing
   * the same still-open meeting immediately after dismissal due to a race
   * between the dismiss action and the next poll tick — it is NOT meant to
   * block a genuine leave-and-rejoin (of this meeting or an unrelated one on
   * the same platform), so it is keyed by the specific meeting ID rather
   * than the platform source, and uses a short window rather than a long one.
   */
  private lastNotifiedAtByMeetingId = new Map<string, number>();
  private static readonly RENOTIFY_COOLDOWN_MS = 10_000;
  private isPolling = false;

  /** Start polling. Safe to call multiple times — will not double-start. */
  start() {
    if (this.intervalId !== null) return;
    debugLog('Detection service started', { interval: `${POLL_INTERVAL_MS}ms` });
    // Run immediately on first call so detection is instant on app load
    void this.poll();
    this.intervalId = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  /** Stop polling and clear internal state. */
  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isPolling = false;
      debugLog('Detection service stopped', { totalPolls: this.pollCount });
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      this.pollCount++;
      const store = useAppStore.getState();

    // Respect the Settings > Notifications toggles: master "disable all"
    // switch, and the meeting-detection-specific toggle. Skip polling
    // entirely rather than detecting-but-not-notifying, since there is no
    // other purpose for this poll cycle if notifications are off.
    if (store.notificationsDisabled || !store.meetingDetectionNotifications) {
      if (store.isMeetingNotificationVisible) {
        store.setMeetingNotificationVisible(false);
      }
      debugLog('Poll skipped — meeting detection notifications disabled in Settings');
      return;
    }

    // Never show a detection notification while recording is active
    if (store.recordingStatus === 'recording' || store.recordingStatus === 'paused') {
      if (store.isMeetingNotificationVisible) {
        store.setMeetingNotificationVisible(false);
      }
      debugLog('Poll skipped — recording in progress');
      return;
    }

    // ── Retrieve OS window titles via Electron IPC ──────────────────────────
    let titles: string[] = [];
    try {
      if (window.electronAPI?.getWindowTitles) {
        titles = await window.electronAPI.getWindowTitles();
      } else {
        debugLog('IPC unavailable (browser dev mode) — skipping poll');
        return;
      }
    } catch (err) {
      debugLog('IPC error fetching window titles', { error: String(err) });
      return;
    }

    debugLog(`Poll #${this.pollCount} — ${titles.length} window title(s)`, {
      titles: titles.slice(0, 10),
    });

    // ── V1 DETECTION PIPELINE ───────────────────────────────────────────────
    //
    // PASS 1: Microsoft Teams Desktop
    //   Run DesktopAppDetector — its first rule is Teams (V1), so if Teams
    //   Desktop is open it will be returned before any other platform.
    //
    // PASS 2: Microsoft Teams Web (Edge / Chrome / any browser)
    //   Run BrowserDetector — its first rule is Teams (V1), so if a Teams
    //   browser tab is open it will be returned before Google Meet etc.
    //
    // PASS 3: All other future-supported platforms
    //   Both detectors have already run; if they found nothing above it means
    //   Teams is not active. Re-run them here would double-match, so we rely
    //   on the existing pass-through: if pass 1 returned a non-Teams result,
    //   it is used. Same for pass 2.
    //
    // Implementation detail: each detector evaluates ALL its rules in order
    // (Teams first, then future platforms). A single call to each detector is
    // therefore sufficient — the three logical passes collapse into two calls.
    // ───────────────────────────────────────────────────────────────────────

    // Pass 1: Desktop (Teams Desktop wins first; Zoom/Slack/Discord/Webex are
    //         fallbacks if Teams is not open)
    const desktopResult = this.desktop.detect(titles);

    // Pass 2: Browser (Teams Web wins first; Google Meet/Zoom Web/Webex Web are
    //         fallbacks)
    const browserResult = this.browser.detect(titles);

    // V1 priority resolution:
    //   If Teams Desktop found → use it.
    //   Else if Teams Web found → use it.
    //   Else use whichever of the two detectors found something first.
    //   If both found non-Teams results → prefer Desktop (native > browser).
    let result = desktopResult.detected ? desktopResult : browserResult;

    // Explicit Teams-first tie-break: if desktop found a future platform but
    // browser found Teams, prefer the browser Teams result.
    if (
      desktopResult.detected &&
      desktopResult.meeting.source !== 'Microsoft Teams' &&
      browserResult.detected &&
      browserResult.meeting.source === 'Microsoft Teams'
    ) {
      result = browserResult;
      debugLog('Teams Web takes priority over non-Teams desktop platform');
    }

    // ── No meeting detected ─────────────────────────────────────────────────
    if (!result.detected) {
      if (store.isMeetingNotificationVisible) {
        store.setMeetingNotificationVisible(false);
        store.setDetectedMeeting(null);
        debugLog('Meeting no longer detected — notification cleared');
      } else {
        debugLog('No meeting detected');
      }
      // The meeting window/tab is gone, so this specific detection has truly
      // ended. Release its ID from the dismissed set — meeting IDs are
      // content-based (source + label), so apps whose title stays static for
      // the whole call (e.g. Teams desktop) would otherwise never be able to
      // notify again for any later, distinct call with the same title.
      if (this.lastDetectedId) {
        store.clearDismissedMeeting(this.lastDetectedId);
        this.lastNotifiedAtByMeetingId.delete(this.lastDetectedId);
      }
      this.lastDetectedId = null;
      return;
    }

    const meeting: DetectedMeeting = {
      ...result.meeting,
      detectedAt: Date.now(),
    };

    debugLog('Meeting detected', {
      platform: meeting.source,
      label: meeting.label,
      meetingId: meeting.id,
    });

    // ── Skip dismissed meetings ─────────────────────────────────────────────
    if (store.dismissedMeetingIds.has(meeting.id)) {
      debugLog('Notification suppressed — meeting dismissed by user', {
        meetingId: meeting.id,
      });
      // Keep tracking this as the "current" detection even while suppressed,
      // so that once the meeting genuinely ends (poll finds nothing), the
      // no-meeting-detected branch above can reliably release this exact ID
      // from the dismissed set — regardless of which code path dismissed it.
      this.lastDetectedId = meeting.id;
      return;
    }

    // ── Skip if already showing notification for this exact meeting ─────────
    if (this.lastDetectedId === meeting.id && store.isMeetingNotificationVisible) {
      debugLog('Notification already visible — no-op', { meetingId: meeting.id });
      return;
    }

    // ── Cooldown safety net ──────────────────────────────────────────────────
    // Keyed by the exact meeting ID (not platform) and kept short — this only
    // guards against a poll re-showing a notification microseconds after it
    // was already shown/dismissed in the same tick; it must not block a
    // genuine leave-and-rejoin of this or any other meeting.
    const lastNotifiedAt = this.lastNotifiedAtByMeetingId.get(meeting.id);
    if (lastNotifiedAt && Date.now() - lastNotifiedAt < MeetingDetectionService.RENOTIFY_COOLDOWN_MS) {
      debugLog('Notification suppressed — within re-notify cooldown', {
        meetingId: meeting.id,
        msSinceLast: Date.now() - lastNotifiedAt,
      });
      return;
    }

    // ── Show notification ───────────────────────────────────────────────────
    debugLog('Showing meeting notification', {
      platform: meeting.source,
      label: meeting.label,
      meetingId: meeting.id,
    });

    this.lastDetectedId = meeting.id;
    this.lastNotifiedAtByMeetingId.set(meeting.id, Date.now());
    store.setDetectedMeeting(meeting);
    store.setMeetingNotificationVisible(true);

    // Fire a real OS-level notification (Windows Action Center, etc.) in
    // addition to the in-app banner. This is what actually alerts the user
    // when Mirai Granola is in the background/unfocused — the in-app banner
    // handles the foreground case. Clicking the native notification brings
    // the app window to focus (handled in main.ts).
    if (window.electronAPI?.showNativeNotification) {
      window.electronAPI
        .showNativeNotification({
          title: 'Meeting in progress',
          body: `${meeting.label}\nClick to open Mirai Granola and start taking notes.`,
        })
        .catch((err) => debugLog('Native notification failed', { error: String(err) }));
    }
    } finally {
      this.isPolling = false;
    }
  }
}

/** Singleton instance — created once, shared across the entire React tree */
export const meetingDetectionService = new MeetingDetectionService();
