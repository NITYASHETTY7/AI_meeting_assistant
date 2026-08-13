export interface IElectronAPI {
  // ── Audio ──────────────────────────────────────────────────────────────────
  saveAudio: (fileName: string, buffer: ArrayBuffer) => Promise<string>;

  // ── Audio retention ──────────────────────────────────────────────────────────
  getAudioStorageInfo: () => Promise<{ ok: boolean; fileCount: number; totalBytes: number; error?: string }>;
  clearAllAudio: () => Promise<{ ok: boolean; deletedCount: number; error?: string }>;
  applyAudioRetention: (retentionDays: number) => Promise<{ ok: boolean; deletedCount: number; error?: string }>;

  // ── Storage paths ─────────────────────────────────────────────────────────────
  getStoragePaths: () => Promise<{ ok: boolean; databasePath: string; recordingsPath: string }>;
  openRecordingsFolder: () => Promise<{ ok: boolean; error?: string }>;
  changeRecordingsFolder: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;

  // ── Meeting detection ──────────────────────────────────────────────────────
  /** Returns all visible window titles from the host OS for meeting detection */
  getWindowTitles: () => Promise<string[]>;

  /**
   * Shows a native OS notification (Windows Action Center / macOS Notification
   * Center / Linux). Works even when the app window is unfocused or minimized.
   */
  showNativeNotification: (options: { title: string; body: string }) => Promise<{ ok: boolean; error?: string }>;

  // ── OS Credential Store (keytar) ───────────────────────────────────────────
  /**
   * Save (or overwrite) an API key for the given provider in the OS keychain.
   * Windows → Credential Manager · macOS → Keychain · Linux → libsecret
   */
  saveCredential: (provider: string, secret: string) => Promise<{ ok: boolean; error?: string }>;

  /**
   * Returns whether a credential for the given provider exists.
   * The actual secret is NEVER returned to the renderer.
   */
  hasCredential: (provider: string) => Promise<{ ok: boolean; exists: boolean }>;

  /**
   * Load the stored credential for the given provider.
   * Intended for startup AI-provider initialisation only — not for display.
   */
  loadCredential: (provider: string) => Promise<{ ok: boolean; secret: string | null }>;

  /**
   * Delete the credential for the given provider from the OS keychain.
   */
  deleteCredential: (provider: string) => Promise<{ ok: boolean; deleted?: boolean; error?: string }>;

  // ── Database: Meetings ───────────────────────────────────────────────────────
  dbListMeetings: () => Promise<{ ok: boolean; meetings: MeetingDTO[]; error?: string }>;
  dbUpsertMeeting: (meeting: MeetingUpsertInput) => Promise<{ ok: boolean; error?: string }>;
  dbDeleteMeeting: (meetingId: string) => Promise<{ ok: boolean; error?: string }>;
  dbAppendTranscriptLine: (
    meetingId: string,
    line: { time: string; speaker: string; text: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  dbReplaceActionItems: (
    meetingId: string,
    items: { id: string; text: string; done: boolean }[]
  ) => Promise<{ ok: boolean; error?: string }>;

  // ── Database: Chat ────────────────────────────────────────────────────────────
  dbListChatThreads: () => Promise<{ ok: boolean; threads: ChatThreadDTO[]; error?: string }>;
  dbCreateChatThread: (
    id: string,
    title: string,
    meetingId?: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  dbRenameChatThread: (threadId: string, title: string) => Promise<{ ok: boolean; error?: string }>;
  dbDeleteChatThread: (threadId: string) => Promise<{ ok: boolean; error?: string }>;
  dbAppendChatMessage: (
    threadId: string,
    message: { id: string; role: 'user' | 'assistant' | 'system'; content: string }
  ) => Promise<{ ok: boolean; error?: string }>;
}

export interface MeetingDTO {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  preview: string;
  participants: string[];
  timeline: { start: number; end: number; label: string }[];
  aiNotes: string;
  aiSummary: string;
  recordingFilePath: string | null;
  source: string | null;
  createdAt: number;
  updatedAt: number;
  transcript: { time: string; speaker: string; text: string }[];
  actionItems: { id: string; text: string; done: boolean }[];
}

export interface MeetingUpsertInput {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  preview: string;
  participants: string[];
  timeline: { start: number; end: number; label: string }[];
  aiNotes: string;
  aiSummary: string;
  recordingFilePath?: string | null;
  source?: string | null;
}

export interface ChatThreadDTO {
  id: string;
  meetingId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number }[];
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
