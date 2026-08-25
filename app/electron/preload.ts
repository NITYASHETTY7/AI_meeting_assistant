import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Audio ────────────────────────────────────────────────────────────────────
  saveAudio: (fileName: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('save-audio', { fileName, buffer }),

  // ── Audio retention ──────────────────────────────────────────────────────────
  getAudioStorageInfo: (): Promise<{ ok: boolean; fileCount: number; totalBytes: number; error?: string }> =>
    ipcRenderer.invoke('get-audio-storage-info'),
  clearAllAudio: (): Promise<{ ok: boolean; deletedCount: number; error?: string }> =>
    ipcRenderer.invoke('clear-all-audio'),
  applyAudioRetention: (retentionDays: number): Promise<{ ok: boolean; deletedCount: number; error?: string }> =>
    ipcRenderer.invoke('apply-audio-retention', retentionDays),

  // ── Storage paths ─────────────────────────────────────────────────────────────
  getStoragePaths: (): Promise<{ ok: boolean; databasePath: string; recordingsPath: string }> =>
    ipcRenderer.invoke('get-storage-paths'),
  openRecordingsFolder: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('open-recordings-folder'),
  changeRecordingsFolder: (): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('change-recordings-folder'),

  // ── Meeting detection ────────────────────────────────────────────────────────
  /** Returns an array of visible window titles from the host OS */
  getWindowTitles: (): Promise<string[]> =>
    ipcRenderer.invoke('get-active-window-titles'),

  /**
   * Shows a native OS notification (Windows Action Center / macOS Notification
   * Center / Linux). Works even if the app window is unfocused or minimized.
   * Clicking it brings the app window to the foreground.
   */
  showNativeNotification: (options: { title: string; body: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('show-native-notification', options),

  // ── Desktop Audio & Startup ──────────────────────────────────────────────────
  getDesktopSources: (): Promise<{ id: string; name: string }[]> =>
    ipcRenderer.invoke('get-desktop-sources'),
  setOpenAtLogin: (openAtLogin: boolean): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('set-open-at-login', openAtLogin),
  getOpenAtLogin: (): Promise<{ ok: boolean; openAtLogin: boolean; error?: string }> =>
    ipcRenderer.invoke('get-open-at-login'),

  // ── OS Credential Store (keytar) ─────────────────────────────────────────────
  /**
   * Save (or overwrite) an API key for the given provider in the OS keychain.
   * Returns { ok: boolean, error?: string }
   */
  saveCredential: (provider: string, secret: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('credential-save', provider, secret),

  /**
   * Returns whether a credential for the given provider exists in the OS keychain.
   * The secret is NEVER returned to the renderer.
   */
  hasCredential: (provider: string): Promise<{ ok: boolean; exists: boolean }> =>
    ipcRenderer.invoke('credential-exists', provider),

  /**
   * Load the stored credential for the given provider.
   * Use only at startup to initialise AI providers — never for display.
   */
  loadCredential: (provider: string): Promise<{ ok: boolean; secret: string | null }> =>
    ipcRenderer.invoke('credential-load', provider),

  /**
   * Delete the credential for the given provider from the OS keychain.
   * Returns { ok: boolean, deleted: boolean, error?: string }
   */
  deleteCredential: (provider: string): Promise<{ ok: boolean; deleted?: boolean; error?: string }> =>
    ipcRenderer.invoke('credential-delete', provider),

  // ── Database: Meetings ───────────────────────────────────────────────────────
  dbListMeetings: () => ipcRenderer.invoke('db-list-meetings'),
  dbUpsertMeeting: (meeting: unknown) => ipcRenderer.invoke('db-upsert-meeting', meeting),
  /** Moves a meeting to the Bin (soft delete) — see dbPermanentlyDeleteMeeting for the real erase. */
  dbDeleteMeeting: (meetingId: string) => ipcRenderer.invoke('db-delete-meeting', meetingId),
  /** Lists meetings currently in the Bin. */
  dbListDeletedMeetings: () => ipcRenderer.invoke('db-list-deleted-meetings'),
  /** Restores a meeting from the Bin back to the active list. */
  dbRestoreMeeting: (meetingId: string) => ipcRenderer.invoke('db-restore-meeting', meetingId),
  /** Permanently erases a meeting and all related data. Cannot be undone. */
  dbPermanentlyDeleteMeeting: (meetingId: string) => ipcRenderer.invoke('db-permanently-delete-meeting', meetingId),
  dbAppendTranscriptLine: (meetingId: string, line: unknown) =>
    ipcRenderer.invoke('db-append-transcript-line', meetingId, line),
  dbReplaceActionItems: (meetingId: string, items: unknown) =>
    ipcRenderer.invoke('db-replace-action-items', meetingId, items),

  // ── Database: Chat ────────────────────────────────────────────────────────────
  dbListChatThreads: () => ipcRenderer.invoke('db-list-chat-threads'),
  dbCreateChatThread: (id: string, title: string, meetingId?: string | null) =>
    ipcRenderer.invoke('db-create-chat-thread', id, title, meetingId),
  dbRenameChatThread: (threadId: string, title: string) =>
    ipcRenderer.invoke('db-rename-chat-thread', threadId, title),
  dbDeleteChatThread: (threadId: string) => ipcRenderer.invoke('db-delete-chat-thread', threadId),
  dbAppendChatMessage: (threadId: string, message: unknown) =>
    ipcRenderer.invoke('db-append-chat-message', threadId, message),

  // ── PDF Export ─────────────────────────────────────────────────────────────
  exportPdf: (options: { html: string; defaultFileName: string }) =>
    ipcRenderer.invoke('export-pdf', options),
})
