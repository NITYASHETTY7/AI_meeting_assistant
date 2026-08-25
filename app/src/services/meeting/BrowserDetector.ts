import type { DetectedMeeting } from '../../store/useAppStore';

/**
 * Each rule describes one meeting platform that may appear in a browser window title.
 *
 * Rules are processed IN ORDER — higher-priority platforms must appear first.
 * V1 first-class support: Microsoft Teams (web, Edge, Chrome, any browser).
 * Future-supported: Google Meet, Zoom Web, Webex Web.
 *
 * HOW BROWSER TITLE MATCHING WORKS
 * ──────────────────────────────────
 * On Windows, every browser propagates the active tab's title into the OS window
 * title that PowerShell reads via Get-Process.MainWindowTitle.
 *
 * Browser-specific title formats:
 *   Chrome / Brave / Arc / Chromium:  "<tab title> - Google Chrome"
 *                                     "<tab title> - Brave"
 *   Microsoft Edge:                   "<tab title> - Microsoft Edge"
 *   Firefox:                          "<tab title> — Mozilla Firefox"
 *
 * Because we match SUBSTRINGS (not exact titles), patterns fire regardless of
 * which browser hosts the tab. The browser name suffix is irrelevant —
 * we only need the meeting platform identifier to appear anywhere in the title.
 *
 * Teams-in-Edge examples (all matched by /microsoft teams/i):
 *   "Microsoft Teams - Microsoft Edge"
 *   "Meeting | Microsoft Teams - Microsoft Edge"
 *   "Project Sync | Microsoft Teams - Microsoft Edge"
 *   "Microsoft Teams - Google Chrome"
 *   "Meeting | Microsoft Teams - Google Chrome"
 */
interface BrowserMeetingRule {
  source: string;
  /**
   * V1 support tier:
   *  "v1"     — fully supported, UX-polished, Teams-focused.
   *  "future" — logic present, architecture-ready, not UX-prioritised in V1.
   */
  tier: 'v1' | 'future';
  titlePatterns: RegExp[];
  /** Patterns that identify known non-meeting windows (exclusions applied first) */
  excludePatterns?: RegExp[];
}

// ─────────────────────────────────────────────────────────────────────────────
// V1 FIRST-CLASS: Microsoft Teams (Web / Edge / Chrome / any browser)
//
// Teams web app title patterns:
//   "Microsoft Teams"
//   "Microsoft Teams - Microsoft Edge"          ← Teams tab in Edge
//   "Microsoft Teams - Google Chrome"           ← Teams tab in Chrome
//   "Meeting | Microsoft Teams"
//   "Meeting | Microsoft Teams - Microsoft Edge"
//   "Call | Microsoft Teams"
//   "Teams Meeting"
//   "teams.microsoft.com"                       ← URL exposed in some title modes
//
// IMPORTANT: matching must require an actual call/meeting signal, not just
// "Microsoft Teams" anywhere in the title — a plain Teams chat tab's title
// is e.g. "Chat | Nitya Shetty (You) | Microsoft Teams - Microsoft Edge",
// which also contains "Microsoft Teams" but is NOT an active call.
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_MEETING_RULES: BrowserMeetingRule[] = [
  {
    source: 'Microsoft Teams',
    tier: 'v1',
    titlePatterns: [
      // teams.microsoft.com URL sometimes surfaces in the window title —
      // only meaningful combined with an explicit call/meeting signal below.
      /(meeting|call|video\s*call)\s*\|\s*microsoft teams/i,
      // "Teams Meeting" standalone
      /teams meeting/i,
      // "Meeting with <Person>" — 1:1 call title
      /meeting with\s+\S+/i,
      // Bare "Microsoft Teams" or "Microsoft Teams - <browser>" with NO other
      // page-type prefix (Chat|/Calendar|/Activity| etc. are excluded below) —
      // this is what the standalone Teams web app tab shows while in a call.
      /^microsoft teams(\s*[-–]\s*(microsoft edge|google chrome|brave|arc|chromium))?$/i,
    ],
    excludePatterns: [
      // Chat, calendar, activity, and other non-call Teams surfaces — these
      // titles also contain "Microsoft Teams" but there is normally no
      // active call. HOWEVER: Teams prefixes an active call's title with
      // "Chat |" when viewed from the Chat panel (observed:
      // "Chat | Meeting with X | Microsoft Teams - Microsoft Edge") — so
      // these must NOT exclude when a real meeting/call signal is also
      // present later in the title.
      /^chat\s*\|(?!.*\b(meeting|call)\b)/i,
      /^calendar\s*\|(?!.*\b(meeting|call)\b)/i,
      /^activity\s*\|/i,
      /^teams\s*\|(?!.*\b(meeting|call)\b)/i,
      /^files\s*\|/i,
      /^apps\s*\|/i,
      /sign\s*in.*teams/i,
      /teams.*sign\s*in/i,
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUTURE-SUPPORTED BROWSER PLATFORMS
  // Detection logic is complete and architecture-ready.
  // To promote to V1, change tier to 'v1' and move above Teams if needed.
  // Do NOT remove — ensures immediate extensibility.
  // ─────────────────────────────────────────────────────────────────────────

  {
    // Google Meet (any browser)
    source: 'Google Meet',
    tier: 'v1',
    titlePatterns: [
      // Active meeting room pattern (e.g. "Meet – abc-defg-hij" or "Meet: Weekly Standup")
      /\bmeet\s*[-–:]\s*[a-z0-9]/i,
      /\bmeet\s*[-–:]\s*\S+/i,
      /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
      /\bgoogle meet\b.*(call|meeting|\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b)/i,
    ],
    excludePatterns: [
      // Landing page / tab groups / schedule home screen
      /^google meet(\s*and\s*\d+\s*more\s*pages)?(\s*[-–]\s*.*)?$/i,
      /meet\.google\.com\/home/i,
      /sign\s*in.*meet/i,
    ],
  },

  {
    // Zoom Web Client
    source: 'Zoom',
    tier: 'v1',
    titlePatterns: [
      /zoom meeting/i,
      /zoom webinar/i,
      /zoom\s*[-–]\s*launch meeting/i,
      /\bzoom\b.*(meeting|webinar|\/j\/\d+|\/wc\/\d+)/i,
    ],
    excludePatterns: [
      /^zoom(\s*and\s*\d+\s*more\s*pages)?(\s*[-–]\s*.*)?$/i,
      /zoom\.us\/(home|signin|signup|profile|schedule|pricing|plans)/i,
      /sign\s*in.*zoom/i,
      /zoom.*sign\s*in/i,
    ],
  },

  {
    // Cisco Webex Web
    source: 'Webex',
    tier: 'v1',
    titlePatterns: [
      /webex meeting/i,
      /cisco webex meeting/i,
      /webex\s*[-–]\s*meeting/i,
      /meet.*webex\.com\/meet/i,
    ],
    excludePatterns: [
      /^cisco webex(\s*and\s*\d+\s*more\s*pages)?(\s*[-–]\s*.*)?$/i,
      /webex\.com\/(home|signin|signup|pricing)/i,
      /sign\s*in.*webex/i,
      /webex.*sign\s*in/i,
    ],
  },
];

export type BrowserDetectionResultType =
  | { detected: false }
  | { detected: true; meeting: Omit<DetectedMeeting, 'detectedAt'> };

/**
 * BrowserDetector
 *
 * Inspects OS window titles for browser-hosted meeting platforms.
 * Detection is title-based and completely browser-agnostic — it works with
 * Edge, Chrome, Brave, Arc, Chromium, and Firefox because they all propagate
 * the active tab title into the OS window title that PowerShell reads.
 *
 * V1 DETECTION ORDER (rules are evaluated top-to-bottom):
 *   1. Microsoft Teams  ← V1 first-class: web app, Edge, Chrome, any browser
 *   2. Google Meet      ← future
 *   3. Zoom Web         ← future
 *   4. Webex Web        ← future
 *
 * Teams-in-Edge is explicitly first-class. A Teams session in Edge produces
 * a window title like "Meeting | Microsoft Teams - Microsoft Edge", which is
 * matched by /microsoft teams/i — identical behaviour to the desktop app.
 *
 * Extensibility: to promote a future platform to V1, change its `tier` to 'v1'
 * and move it above any rule it should take priority over.
 */
export class BrowserDetector {
  detect(windowTitles: string[]): BrowserDetectionResultType {
    for (const rawTitle of windowTitles) {
      // Normalize: strip unread count badges, bullet marks, leading digits, and trailing counts
      const title = rawTitle
        .replace(/^[\s\(\[\{]*\d+[\s\)\]\}]*/, '')
        .replace(/^[\s\*•]+/, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .trim();

      for (const rule of BROWSER_MEETING_RULES) {
        // Exclusions always take precedence — evaluated before positive patterns
        const isExcluded = rule.excludePatterns?.some((p) => p.test(title) || p.test(rawTitle)) ?? false;
        if (isExcluded) continue;

        const matchesAny = rule.titlePatterns.some((p) => p.test(title) || p.test(rawTitle));
        if (!matchesAny) continue;

        const label = this.extractMeetingLabel(title, rule.source);
        const meetingId = [
          'browser',
          rule.source.toLowerCase().replace(/\s+/g, '-'),
          label.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40),
        ].join(':');

        return {
          detected: true,
          meeting: {
            id: meetingId,
            source: rule.source,
            label,
          },
        };
      }
    }
    return { detected: false };
  }

  /**
   * Extract a human-readable meeting label from the browser window title.
   *
   * Teams examples:
   *   "Meeting | Microsoft Teams - Microsoft Edge"  → "Meeting"
   *   "Project Sync | Microsoft Teams - Google Chrome" → "Project Sync"
   *   "Microsoft Teams - Microsoft Edge"            → "Microsoft Teams Meeting"
   *   "Microsoft Teams"                             → "Microsoft Teams Meeting"
   *
   * Google Meet examples:
   *   "Daily Standup – Google Meet - Microsoft Edge"  → "Daily Standup"
   *   "Google Meet - Microsoft Edge"                  → "Google Meet Meeting"
   */
  private extractMeetingLabel(title: string, source: string): string {
    // Step 1: strip notification counts and trailing browser name
    let working = title
      .replace(/^[\s\(\[\{]*\d+[\s\)\]\}]*/, '')
      .replace(/^[\s\*•]+/, '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .replace(/\s*[-–]\s*microsoft edge\s*$/i, '')
      .replace(/\s*[-–]\s*google chrome\s*$/i, '')
      .replace(/\s*[-–]\s*brave\s*$/i, '')
      .replace(/\s*[-–]\s*arc\s*$/i, '')
      .replace(/\s*[—–]\s*mozilla firefox\s*$/i, '')
      .replace(/\s*[-–]\s*chromium\s*$/i, '')
      .trim();

    // Step 2: Teams pipe format "Meeting | Microsoft Teams"
    const pipeMatch = working.match(/^(.+?)\s*\|\s*microsoft teams/i);
    if (pipeMatch) {
      const candidate = pipeMatch[1].trim();
      if (candidate.length > 2) return candidate;
    }

    // Step 3: Google Meet dash format "Daily Standup – Google Meet"
    const meetDashMatch = working.match(/^(.+?)\s*[-–—]\s*google meet/i);
    if (meetDashMatch) {
      const candidate = meetDashMatch[1].trim();
      if (candidate.length > 2) return candidate;
    }

    // Step 4: strip platform name suffixes
    working = working
      .replace(/[-–|]\s*google meet\s*/gi, '')
      .replace(/[-–|]\s*microsoft teams\s*/gi, '')
      .replace(/[-–|]\s*zoom.*$/gi, '')
      .replace(/[-–|]\s*webex.*$/gi, '')
      .replace(/\s*[-–|]\s*$/g, '')
      .trim();

    if (working && working.length > 2 && working.toLowerCase() !== source.toLowerCase()) {
      return working;
    }

    return `${source} Meeting`;
  }
}
