import type { BrowserDetectionResultType } from './BrowserDetector';

/**
 * Rules for detecting native desktop meeting applications by their window title.
 *
 * Rules are processed IN ORDER — place higher-priority platforms first.
 * V1 first-class support: Microsoft Teams (desktop).
 * Future-supported: Zoom, Slack Huddle, Discord, Webex.
 *
 * Each rule is matched case-insensitively against every OS window title
 * returned by the Electron IPC `get-active-window-titles` handler.
 */
interface DesktopMeetingRule {
  source: string;
  /**
   * V1 support tier:
   *  "v1"     — fully supported, UX-polished, tested.
   *  "future" — logic present, architecture-ready, not UX-prioritised in V1.
   */
  tier: 'v1' | 'future';
  /** Patterns that match a *meeting in progress* window title */
  titlePatterns: RegExp[];
  /** Patterns that identify known non-meeting windows (exclusions applied first) */
  excludePatterns?: RegExp[];
}

// ─────────────────────────────────────────────────────────────────────────────
// V1 FIRST-CLASS: Microsoft Teams (Desktop)
//
// Tested window title formats on Windows (Teams classic + new Teams):
//   "Microsoft Teams"
//   "Meeting | Microsoft Teams"
//   "Call | Microsoft Teams"
//   "Meeting with <Name> | Microsoft Teams"
//   "Teams Meeting"
//   "Meeting in progress"
//   "Call in progress"
//   "Microsoft Teams – <meeting title>"
//   "Teams"                              ← new Teams app shorthand
//   "<Meeting title> — Microsoft Teams"
// ─────────────────────────────────────────────────────────────────────────────

const DESKTOP_MEETING_RULES: DesktopMeetingRule[] = [
  {
    source: 'Microsoft Teams',
    tier: 'v1',
    titlePatterns: [
      // New Teams app — title is simply "Teams" when in a call/meeting
      /^teams$/i,
      // In-call overlay windows
      /(meeting|call)\s*\|\s*microsoft teams/i,
      /(meeting|call)\s*in\s*progress/i,
      // "Meeting with <Person>" — Teams desktop generates this during 1:1 calls.
      // NOTE: does not match "Chat with <Person>" or "Chat | <Person>".
      /meeting with\s+\S+/i,
      // "Teams Meeting" standalone
      /teams meeting/i,
      // "<Title> – Microsoft Teams" or "<Title> — Microsoft Teams" — the title
      // segment must itself signal a call ("Meeting"/"Call"), otherwise this
      // also matches idle windows like "Calendar – Microsoft Teams".
      /(meeting|call).*[-–—]\s*microsoft teams/i,
      /microsoft teams\s*[-–—]\s*(meeting|call)/i,
    ],
    excludePatterns: [
      // Splash / login screens — not an active meeting
      /sign\s*in.*teams/i,
      /sign\s*up.*teams/i,
      /teams.*sign\s*in/i,
      /microsoft teams.*update/i,
      // Chat, calendar, activity, and other non-call Teams surfaces —
      // "Microsoft Teams" appears in these titles too, but there is
      // normally no active call. HOWEVER: Teams prefixes an active call's
      // title with "Chat |" when viewed from the Chat panel (observed title:
      // "Chat | Meeting with X | Microsoft Teams") — so these exclusions
      // must NOT fire when the title also contains an actual meeting/call
      // signal. Negative lookahead: exclude "Chat |" ONLY if nothing later
      // in the title says "meeting" or "call".
      /^chat\s*\|(?!.*\b(meeting|call)\b)/i,
      /^calendar\s*\|(?!.*\b(meeting|call)\b)/i,
      /^activity\s*\|/i,
      /^teams\s*\|/i,
      /^files\s*\|/i,
      /^apps\s*\|/i,
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUTURE-SUPPORTED PLATFORMS
  // Detection logic is complete and architecture-ready.
  // These will become first-class in a future release with minimal changes.
  // Do NOT remove — they ensure the service is immediately extensible.
  // ─────────────────────────────────────────────────────────────────────────

  {
    // FUTURE: Zoom Desktop
    source: 'Zoom',
    tier: 'future',
    titlePatterns: [
      /zoom meeting/i,
      /zoom\s*-\s*meeting/i,
      /^zoom$/i,
    ],
    excludePatterns: [
      /zoom\s*-\s*sign in/i,
      /zoom\s*-\s*sign up/i,
      /zoom cloud meetings/i,
    ],
  },

  {
    // FUTURE: Slack Huddles (desktop client)
    source: 'Slack Huddle',
    tier: 'future',
    titlePatterns: [
      /slack.*huddle/i,
      /huddle.*slack/i,
      /-\s*huddle/i,
    ],
    excludePatterns: [],
  },

  {
    // FUTURE: Discord Voice Calls (desktop client)
    source: 'Discord',
    tier: 'future',
    titlePatterns: [
      /discord.*voice/i,
      /voice connected.*discord/i,
      /^discord$/i,
    ],
    excludePatterns: [],
  },

  {
    // FUTURE: Cisco Webex (desktop client)
    source: 'Webex',
    tier: 'future',
    titlePatterns: [
      /cisco webex/i,
      /webex meeting/i,
      /webex\s*-\s*meeting/i,
    ],
    excludePatterns: [],
  },
];

/**
 * DesktopAppDetector
 *
 * Inspects OS window titles for active desktop meeting applications.
 * It is completely passive — no process injection, no API calls, no side effects.
 *
 * Works on:
 *   Windows  — via PowerShell Get-Process MainWindowTitle
 *   macOS    — via AppleScript
 *   Linux    — via wmctrl
 *
 * V1 DETECTION ORDER (rules are evaluated top-to-bottom):
 *   1. Microsoft Teams  ← V1 first-class, tested, UX-polished
 *   2. Zoom             ← future
 *   3. Slack Huddle     ← future
 *   4. Discord          ← future
 *   5. Webex            ← future
 *
 * Extensibility: to promote a future platform to V1, change its `tier` to 'v1'
 * and move it above any rule it should take priority over.
 */
export class DesktopAppDetector {
  /**
   * Given a list of OS window titles, returns the first detected desktop meeting.
   * Returns `{ detected: false }` if no meeting window is found.
   */
  detect(windowTitles: string[]): BrowserDetectionResultType {
    for (const title of windowTitles) {
      for (const rule of DESKTOP_MEETING_RULES) {
        // Exclusions always take precedence — evaluated before positive patterns
        const isExcluded = rule.excludePatterns?.some((p) => p.test(title)) ?? false;
        if (isExcluded) continue;

        const matchesAny = rule.titlePatterns.some((p) => p.test(title));
        if (!matchesAny) continue;

        const label = this.extractLabel(title, rule.source);
        const meetingId = [
          'desktop',
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
   * Extract a human-readable meeting label from the OS window title.
   *
   * Examples (Teams):
   *   "Meeting | Microsoft Teams"         → "Meeting"
   *   "Project Kickoff | Microsoft Teams" → "Project Kickoff"
   *   "Call in progress"                  → "Call in progress"
   *   "Teams"                             → "Teams Meeting"
   *   "Microsoft Teams"                   → "Teams Meeting"
   */
  private extractLabel(title: string, source: string): string {
    // Teams: "Meeting | Microsoft Teams" → "Meeting"
    // Teams: "Project Sync | Microsoft Teams" → "Project Sync"
    const pipeMatch = title.match(/^(.+?)\s*\|\s*microsoft teams/i);
    if (pipeMatch) {
      const candidate = pipeMatch[1].trim();
      if (candidate.length > 2) return candidate;
    }

    // Teams: "<Title> – Microsoft Teams" or "<Title> — Microsoft Teams"
    const dashMatch = title.match(/^(.+?)\s*[-–—]\s*microsoft teams/i);
    if (dashMatch) {
      const candidate = dashMatch[1].trim();
      if (candidate.length > 2) return candidate;
    }

    // "Meeting with <Name>" — keep as-is, it's already descriptive
    if (/^meeting with\s+\S+/i.test(title)) return title.trim();

    // "Call in progress" / "Meeting in progress" — keep as-is
    if (/(call|meeting)\s+in\s+progress/i.test(title)) return title.trim();

    // Bare app name normalisations
    if (/^teams$/i.test(title)) return 'Teams Meeting';
    if (/^discord$/i.test(title)) return 'Discord Voice Call';
    if (/^zoom$/i.test(title)) return 'Zoom Meeting';
    if (/^microsoft teams$/i.test(title)) return 'Teams Meeting';

    // Generic: strip known app name fragments and trailing separators
    const stripped = title
      .replace(/microsoft teams/gi, '')
      .replace(/\|?\s*slack/gi, '')
      .replace(/\|?\s*discord/gi, '')
      .replace(/\|?\s*zoom/gi, '')
      .replace(/\|?\s*webex/gi, '')
      .replace(/[-–—|]\s*$/g, '')
      .trim();

    if (stripped && stripped.length > 2) return stripped;
    return `${source} Meeting`;
  }
}
