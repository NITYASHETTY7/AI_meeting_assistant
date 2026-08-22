import type { Meeting } from '../store/useAppStore';

/**
 * Parses a transcript line's "MM:SS" (or "H:MM:SS") timestamp into seconds.
 * Returns 0 for anything unparsable rather than throwing.
 */
function parseTimestampToSeconds(time: string): number {
  const parts = time.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * The stored `meeting.duration` can end up stale/wrong from an earlier
 * recording session (e.g. a stop() that fired before the timer had
 * accumulated — since fixed, but old meetings still carry the bad value).
 * Rather than silently showing an obviously-incorrect duration like "0m"
 * next to a 50+ line transcript spanning several minutes, derive a lower
 * bound from the last transcript line's own timestamp and use whichever
 * is larger — this makes every display of a meeting's duration
 * self-correct against stale data without needing to rewrite historical
 * records.
 */
export function resolveDisplayDuration(meeting: Meeting): string {
  const lastLine = meeting.transcript[meeting.transcript.length - 1];
  if (!lastLine) return meeting.duration;

  const transcriptSeconds = parseTimestampToSeconds(lastLine.time);
  const storedMatch = meeting.duration.match(/(?:(\d+)h\s*)?(\d+)m/);
  const storedMinutes = storedMatch
    ? (parseInt(storedMatch[1] || '0', 10) * 60) + parseInt(storedMatch[2], 10)
    : 0;
  const storedSeconds = storedMinutes * 60;

  if (transcriptSeconds <= storedSeconds) return meeting.duration;

  const minutes = Math.max(1, Math.round(transcriptSeconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
}
