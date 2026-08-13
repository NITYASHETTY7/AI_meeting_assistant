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
 *   - The meeting ID is a stable hash of (detector, source, label).
 *   - Once the user dismisses a meeting, it is added to `dismissedMeetingIds`
 *     in the Zustand store and is never shown again for that session.
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
   * Timestamp (per platform source) of the last time a notification was
   * shown, independent of exact meeting ID. This is a safety net against
   * the meetingId changing slightly between polls (e.g. if a browser tab
   * title's variable suffix leaks into label extraction in some edge case)
   * — without it, an unstable ID would defeat the dismissedMeetingIds/
   * lastDetectedId dedup entirely and the same real meeting could
   * re-notify repeatedly within seconds of being dismissed.
   */
  private lastNotifiedAtBySource = new Map<string, number>();
  private static readonly RENOTIFY_COOLDOWN_MS = 60_000;

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
      debugLog('Detection service stopped', { totalPolls: this.pollCount });
    }
  }

  private async poll(): Promise<void> {
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
      return;
    }

    // ── Skip if already showing notification for this exact meeting ─────────
    if (this.lastDetectedId === meeting.id && store.isMeetingNotificationVisible) {
      debugLog('Notification already visible — no-op', { meetingId: meeting.id });
      return;
    }

    // ── Cooldown safety net ──────────────────────────────────────────────────
    // Independent of exact meetingId matching — suppresses re-notifying for
    // the same platform source within RENOTIFY_COOLDOWN_MS, even if the
    // computed meetingId happened to differ from the previous poll.
    const lastNotifiedAt = this.lastNotifiedAtBySource.get(meeting.source);
    if (lastNotifiedAt && Date.now() - lastNotifiedAt < MeetingDetectionService.RENOTIFY_COOLDOWN_MS) {
      debugLog('Notification suppressed — within re-notify cooldown', {
        source: meeting.source,
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
    this.lastNotifiedAtBySource.set(meeting.source, Date.now());
    store.setDetectedMeeting(meeting);
    store.setMeetingNotificationVisible(true);

    // Fire a real OS-level notification (Windows Action Center, etc.) in
    // addition to the in-app banner. This is what actually alerts the user
    // when Mirai Granola is in the background/unfocused — the in-app banner
    // alone is only visible if the user happens to already be looking at
    // the app window.
    if (window.electronAPI?.showNativeNotification) {
      window.electronAPI
        .showNativeNotification({
          title: `Meeting detected — ${meeting.source}`,
          body: `${meeting.label}\nClick to open Mirai Granola and start taking notes.`,
        })
        .catch((err) => debugLog('Native notification failed', { error: String(err) }));
    }
  }
}

/** Singleton instance — created once, shared across the entire React tree */
export const meetingDetectionService = new MeetingDetectionService();
