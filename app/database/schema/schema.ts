import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Mirai Granola — SQLite schema (Drizzle ORM)
 *
 * Design notes:
 *  - All IDs are TEXT (app-generated, e.g. `meeting-${Date.now()}`) to match the
 *    existing Zustand store's ID scheme — no migration of ID format needed.
 *  - Timestamps are stored as INTEGER unix ms (`Date.now()`), sorted/queried
 *    numerically. Display formatting stays a renderer concern.
 *  - `meetings` is the aggregate root. transcript_lines, notes(action items),
 *    and chat_messages all cascade-delete when a meeting is deleted.
 *  - JSON-ish free-form fields (participants, timeline) are stored as TEXT
 *    (JSON.stringify) rather than normalized tables — they are small,
 *    read-mostly, and always loaded/saved with their parent meeting.
 */

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled Note'),
  date: text('date').notNull(),
  time: text('time').notNull(),
  duration: text('duration').notNull().default('0m'),
  preview: text('preview').notNull().default(''),
  /** JSON-encoded string[] of participant names */
  participants: text('participants').notNull().default('[]'),
  /** JSON-encoded TimelineSegment[] */
  timeline: text('timeline').notNull().default('[]'),
  aiNotes: text('ai_notes').notNull().default(''),
  aiSummary: text('ai_summary').notNull().default(''),
  /**
   * Free-form rich-text notes typed by the user below the transcript card,
   * independent of the AI-generated aiNotes/aiSummary. Stored as HTML
   * (from the contentEditable editor) so bold/italic/list formatting
   * survives reloads. Fed into AI generation alongside the transcript so
   * summaries/action items/decisions/follow-ups account for anything the
   * user typed manually during or after the meeting.
   */
  additionalNotes: text('additional_notes').notNull().default(''),
  recordingFilePath: text('recording_file_path'),
  source: text('source'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  /**
   * Unix ms timestamp of when this meeting was moved to the Bin, or null
   * if it's active. Soft-delete rather than an immediate hard DELETE so
   * accidental deletions (and their transcript/notes/chat history) can be
   * restored from the Bin, or permanently erased on purpose later.
   */
  deletedAt: integer('deleted_at'),
});

export const transcriptLines = sqliteTable('transcript_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  meetingId: text('meeting_id').notNull(),
  time: text('time').notNull(),
  speaker: text('speaker').notNull().default('Speaker'),
  text: text('text').notNull(),
  /** Ordering guarantee independent of `time` string formatting */
  sequence: integer('sequence').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const actionItems = sqliteTable('action_items', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id').notNull(),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

/** Notes independent of a meeting (e.g. quick notes) — currently 1:1 with a meeting via meetingId, nullable for future standalone notes. */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id'),
  title: text('title').notNull().default('Untitled Note'),
  content: text('content').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** AI chat — supports meeting-scoped threads (meetingId set) and general chat (meetingId null). */
export const chatThreads = sqliteTable('chat_threads', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id'),
  title: text('title').notNull().default('New chat'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type MeetingRow = typeof meetings.$inferSelect;
export type NewMeetingRow = typeof meetings.$inferInsert;
export type TranscriptLineRow = typeof transcriptLines.$inferSelect;
export type NewTranscriptLineRow = typeof transcriptLines.$inferInsert;
export type ActionItemRow = typeof actionItems.$inferSelect;
export type NewActionItemRow = typeof actionItems.$inferInsert;
export type ChatThreadRow = typeof chatThreads.$inferSelect;
export type NewChatThreadRow = typeof chatThreads.$inferInsert;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
