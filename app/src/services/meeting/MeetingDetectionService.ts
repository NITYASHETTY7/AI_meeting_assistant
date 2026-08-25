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
  private consecutiveAbsenceCount = 0;
  /**
   * Tracks IDs of meetings that have already fired a notification in the current session.
   * Guarantees that each meeting session only notifies the user ONCE.
   */
  private notifiedMeetingIds = new Set<string>();
  /**
   * Timestamp (per meeting ID or platform key) of when a notification was shown.
   * Uses a 30-minute cooldown to prevent repetitive spam for ongoing calls.
   */
  private lastNotifiedAtByMeetingId = new Map<string, number>();
  private static readonly RENOTIFY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
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
      // switch, and the meeting-detection-specific toggle.
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
      const desktopResult = this.desktop.detect(titles);
      const browserResult = this.browser.detect(titles);

      let result = desktopResult.detected ? desktopResult : browserResult;

      // Explicit Teams-first tie-break: if desktop found a non-Teams platform
      // but browser found Teams, prefer the browser Teams result.
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
        this.consecutiveAbsenceCount++;

        // After 3 consecutive missing polls (15s), hide banner and reset session memory
        // so leaving and rejoining later will immediately trigger a fresh notification.
        if (this.consecutiveAbsenceCount >= 3) {
          if (store.isMeetingNotificationVisible) {
            store.setMeetingNotificationVisible(false);
            store.setDetectedMeeting(null);
            debugLog('Meeting no longer detected — notification and session memory cleared');
          }
          if (this.lastDetectedId) {
            store.clearDismissedMeeting(this.lastDetectedId);
          }
          this.notifiedMeetingIds.clear();
          this.lastNotifiedAtByMeetingId.clear();
          this.lastDetectedId = null;
        }
        return;
      }

      // Meeting is actively detected: reset absence counter
      this.consecutiveAbsenceCount = 0;

      const meeting: DetectedMeeting = {
        ...result.meeting,
        detectedAt: Date.now(),
      };

      // Canonical session key normalizing platform and label variants
      const cleanLabel = meeting.label
        .toLowerCase()
        .replace(/^(chat\s*\|\s*|meet\s*[-–:]\s*)/i, '')
        .replace(/[^a-z0-9]/g, '');
      const sessionKey = `${meeting.source.toLowerCase()}:${cleanLabel}`;

      debugLog('Meeting detected', {
        platform: meeting.source,
        label: meeting.label,
        meetingId: meeting.id,
        sessionKey,
      });

      // ── Skip dismissed meetings ─────────────────────────────────────────────
      if (store.dismissedMeetingIds.has(meeting.id)) {
        debugLog('Notification suppressed — meeting dismissed by user', {
          meetingId: meeting.id,
        });
        this.lastDetectedId = meeting.id;
        return;
      }

      // ── Skip if already showing notification for this exact meeting ─────────
      if (this.lastDetectedId === meeting.id && store.isMeetingNotificationVisible) {
        debugLog('Notification already visible — no-op', { meetingId: meeting.id });
        return;
      }

      // ── Single-notification check per meeting session ──────────────────────
      const lastNotifiedAt = this.lastNotifiedAtByMeetingId.get(meeting.id) || this.lastNotifiedAtByMeetingId.get(sessionKey);
      if (
        this.notifiedMeetingIds.has(meeting.id) ||
        this.notifiedMeetingIds.has(sessionKey) ||
        (lastNotifiedAt && Date.now() - lastNotifiedAt < MeetingDetectionService.RENOTIFY_COOLDOWN_MS)
      ) {
        debugLog('Notification suppressed — already notified for this meeting session', {
          meetingId: meeting.id,
          sessionKey,
        });
        this.lastDetectedId = meeting.id;
        return;
      }

      // ── Show notification (EXACTLY ONCE) ────────────────────────────────────
      debugLog('Showing meeting notification', {
        platform: meeting.source,
        label: meeting.label,
        meetingId: meeting.id,
      });

      this.lastDetectedId = meeting.id;
      this.notifiedMeetingIds.add(meeting.id);
      this.notifiedMeetingIds.add(sessionKey);
      this.lastNotifiedAtByMeetingId.set(meeting.id, Date.now());
      this.lastNotifiedAtByMeetingId.set(sessionKey, Date.now());

      store.setDetectedMeeting(meeting);
      store.setMeetingNotificationVisible(true);

      // Fire a single native OS notification (Windows Action Center)
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
