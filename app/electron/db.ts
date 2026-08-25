import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq, asc, isNull, isNotNull } from 'drizzle-orm'
import { join } from 'path'
import * as schema from '../database/schema/schema'

let db: BetterSQLite3Database<typeof schema> | null = null
let sqlite: Database.Database | null = null

/**
 * Initializes the SQLite connection + Drizzle ORM instance and runs any
 * pending migrations. Safe to call once at app startup.
 *
 * @param dbDir   Absolute path to the directory that should contain granola.db
 * @param migrationsFolder  Absolute path to the drizzle migrations folder
 */
export function initDatabase(dbDir: string, migrationsFolder: string) {
  const dbPath = join(dbDir, 'granola.db')
  sqlite = new Database(dbPath, { timeout: 5000 })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('Database not initialized — call initDatabase() first.')
  return db
}

// ── Meetings ─────────────────────────────────────────────────────────────────

export interface MeetingDTO {
  id: string
  title: string
  date: string
  time: string
  duration: string
  preview: string
  participants: string[]
  timeline: { start: number; end: number; label: string }[]
  aiNotes: string
  aiSummary: string
  additionalNotes: string
  recordingFilePath: string | null
  source: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  transcript: { time: string; speaker: string; text: string }[]
  actionItems: { id: string; text: string; done: boolean }[]
}

function rowToMeetingDTO(
  row: typeof schema.meetings.$inferSelect,
  transcript: typeof schema.transcriptLines.$inferSelect[],
  actionItems: typeof schema.actionItems.$inferSelect[]
): MeetingDTO {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    duration: row.duration,
    preview: row.preview,
    participants: JSON.parse(row.participants || '[]'),
    timeline: JSON.parse(row.timeline || '[]'),
    aiNotes: row.aiNotes,
    aiSummary: row.aiSummary,
    additionalNotes: row.additionalNotes,
    recordingFilePath: row.recordingFilePath ?? null,
    source: row.source ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
    transcript: transcript.map((t) => ({ time: t.time, speaker: t.speaker, text: t.text })),
    actionItems: actionItems.map((a) => ({ id: a.id, text: a.text, done: Boolean(a.done) })),
  }
}

export function listMeetings(): MeetingDTO[] {
  const d = getDb()
  const meetingRows = d
    .select()
    .from(schema.meetings)
    .where(isNull(schema.meetings.deletedAt))
    .orderBy(asc(schema.meetings.createdAt))
    .all()
  return meetingRows
    .map((row) => {
      const transcript = d
        .select()
        .from(schema.transcriptLines)
        .where(eq(schema.transcriptLines.meetingId, row.id))
        .orderBy(asc(schema.transcriptLines.sequence))
        .all()
      const items = d
        .select()
        .from(schema.actionItems)
        .where(eq(schema.actionItems.meetingId, row.id))
        .all()
      return rowToMeetingDTO(row, transcript, items)
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Returns meetings currently in the Bin (deletedAt set), newest-deleted first. */
export function listDeletedMeetings(): MeetingDTO[] {
  const d = getDb()
  const meetingRows = d
    .select()
    .from(schema.meetings)
    .where(isNotNull(schema.meetings.deletedAt))
    .orderBy(asc(schema.meetings.createdAt))
    .all()
  return meetingRows
    .map((row) => {
      const transcript = d
        .select()
        .from(schema.transcriptLines)
        .where(eq(schema.transcriptLines.meetingId, row.id))
        .orderBy(asc(schema.transcriptLines.sequence))
        .all()
      const items = d
        .select()
        .from(schema.actionItems)
        .where(eq(schema.actionItems.meetingId, row.id))
        .all()
      return rowToMeetingDTO(row, transcript, items)
    })
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export function upsertMeeting(meeting: {
  id: string
  title: string
  date: string
  time: string
  duration: string
  preview: string
  participants: string[]
  timeline: { start: number; end: number; label: string }[]
  aiNotes: string
  aiSummary: string
  additionalNotes?: string
  recordingFilePath?: string | null
  source?: string | null
}) {
  const d = getDb()
  const now = Date.now()
  const existing = d.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id)).get()

  const values = {
    title: meeting.title,
    date: meeting.date,
    time: meeting.time,
    duration: meeting.duration,
    preview: meeting.preview,
    participants: JSON.stringify(meeting.participants ?? []),
    timeline: JSON.stringify(meeting.timeline ?? []),
    aiNotes: meeting.aiNotes ?? '',
    aiSummary: meeting.aiSummary ?? '',
    additionalNotes: meeting.additionalNotes ?? '',
    recordingFilePath: meeting.recordingFilePath ?? null,
    source: meeting.source ?? null,
    updatedAt: now,
  }

  if (existing) {
    d.update(schema.meetings).set(values).where(eq(schema.meetings.id, meeting.id)).run()
  } else {
    d.insert(schema.meetings)
      .values({ id: meeting.id, ...values, createdAt: now })
      .run()
  }
}

/**
 * Moves a meeting to the Bin (sets deletedAt) instead of removing it.
 * Transcript/notes/action items/chat history are left untouched so
 * restore() brings everything back exactly as it was.
 */
export function softDeleteMeeting(meetingId: string) {
  const d = getDb()
  d.update(schema.meetings).set({ deletedAt: Date.now() }).where(eq(schema.meetings.id, meetingId)).run()
}

/** Restores a meeting from the Bin back to the active list. */
export function restoreMeeting(meetingId: string) {
  const d = getDb()
  d.update(schema.meetings).set({ deletedAt: null }).where(eq(schema.meetings.id, meetingId)).run()
}

/** Permanently erases a meeting and all related rows. Cannot be undone. */
export function permanentlyDeleteMeeting(meetingId: string) {
  const d = getDb()
  d.delete(schema.transcriptLines).where(eq(schema.transcriptLines.meetingId, meetingId)).run()
  d.delete(schema.actionItems).where(eq(schema.actionItems.meetingId, meetingId)).run()
  d.delete(schema.notes).where(eq(schema.notes.meetingId, meetingId)).run()
  const threads = d.select().from(schema.chatThreads).where(eq(schema.chatThreads.meetingId, meetingId)).all()
  for (const t of threads) {
    d.delete(schema.chatMessages).where(eq(schema.chatMessages.threadId, t.id)).run()
  }
  d.delete(schema.chatThreads).where(eq(schema.chatThreads.meetingId, meetingId)).run()
  d.delete(schema.meetings).where(eq(schema.meetings.id, meetingId)).run()
}

// ── Transcript lines ─────────────────────────────────────────────────────────

export function appendTranscriptLine(
  meetingId: string,
  line: { time: string; speaker: string; text: string }
) {
  const d = getDb()
  const maxSeqRow = d
    .select()
    .from(schema.transcriptLines)
    .where(eq(schema.transcriptLines.meetingId, meetingId))
    .orderBy(asc(schema.transcriptLines.sequence))
    .all()
  const nextSeq = maxSeqRow.length > 0 ? maxSeqRow[maxSeqRow.length - 1].sequence + 1 : 0
  d.insert(schema.transcriptLines)
    .values({
      meetingId,
      time: line.time,
      speaker: line.speaker,
      text: line.text,
      sequence: nextSeq,
      createdAt: Date.now(),
    })
    .run()
}

// ── Action items ─────────────────────────────────────────────────────────────

export function replaceActionItems(
  meetingId: string,
  items: { id: string; text: string; done: boolean }[]
) {
  const d = getDb()
  d.delete(schema.actionItems).where(eq(schema.actionItems.meetingId, meetingId)).run()
  const now = Date.now()
  for (const item of items) {
    d.insert(schema.actionItems)
      .values({ id: item.id, meetingId, text: item.text, done: item.done, createdAt: now })
      .run()
  }
}

// ── Chat threads & messages ──────────────────────────────────────────────────

export interface ChatThreadDTO {
  id: string
  meetingId: string | null
  title: string
  createdAt: number
  updatedAt: number
  messages: { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number }[]
}

export function listChatThreads(): ChatThreadDTO[] {
  const d = getDb()
  const threads = d.select().from(schema.chatThreads).orderBy(asc(schema.chatThreads.createdAt)).all()
  return threads
    .map((t) => {
      const messages = d
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.threadId, t.id))
        .orderBy(asc(schema.chatMessages.createdAt))
        .all()
      return {
        id: t.id,
        meetingId: t.meetingId ?? null,
        title: t.title,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          createdAt: m.createdAt,
        })),
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function createChatThread(id: string, title: string, meetingId?: string | null) {
  const d = getDb()
  const now = Date.now()
  d.insert(schema.chatThreads)
    .values({ id, title, meetingId: meetingId ?? null, createdAt: now, updatedAt: now })
    .run()
}

export function renameChatThread(threadId: string, title: string) {
  const d = getDb()
  d.update(schema.chatThreads).set({ title, updatedAt: Date.now() }).where(eq(schema.chatThreads.id, threadId)).run()
}

export function deleteChatThread(threadId: string) {
  const d = getDb()
  d.delete(schema.chatMessages).where(eq(schema.chatMessages.threadId, threadId)).run()
  d.delete(schema.chatThreads).where(eq(schema.chatThreads.id, threadId)).run()
}

export function appendChatMessage(
  threadId: string,
  message: { id: string; role: 'user' | 'assistant' | 'system'; content: string }
) {
  const d = getDb()
  const now = Date.now()
  d.insert(schema.chatMessages)
    .values({ id: message.id, threadId, role: message.role, content: message.content, createdAt: now })
    .run()
  d.update(schema.chatThreads).set({ updatedAt: now }).where(eq(schema.chatThreads.id, threadId)).run()
}

export function closeDatabase() {
  sqlite?.close()
  sqlite = null
  db = null
}
