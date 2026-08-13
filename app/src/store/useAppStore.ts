import { create } from 'zustand';

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export interface ActionItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TimelineSegment {
  start: number;
  end: number;
  label: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  preview: string;
  participants: string[];
  transcript: TranscriptLine[];
  aiNotes: string;
  /** Editable AI-generated summary document (Granola-style). Separate from legacy aiNotes. */
  aiSummary: string;
  actionItems: ActionItem[];
  timeline: TimelineSegment[];
}

export type AppTheme = 'dark' | 'light' | 'system';
export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';
export type TranscriptionStatus = 'idle' | 'processing' | 'error';
export type StreamState = 'disconnected' | 'connecting' | 'connected';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface ChatThread {
  id: string;
  meetingId: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

/** A meeting that was automatically detected by the MeetingDetectionService */
export interface DetectedMeeting {
  /** Stable unique ID for deduplication (e.g. "google-meet:Daily Standup") */
  id: string;
  /** Human-readable source label shown in the notification */
  source: 'Google Meet' | 'Microsoft Teams' | 'Zoom' | 'Slack Huddle' | 'Discord' | string;
  /** Meeting title or window title snippet */
  label: string;
  /** When this detection fired */
  detectedAt: number;
}

export interface ProviderCapabilities {
  chat: boolean;
  speech_to_text: boolean;
  audio_generation: boolean;
  realtime: boolean;
  vision: boolean;
  embeddings: boolean;
  function_calling: boolean;
}

interface AppState {
  calendarConnected: boolean;
  toggleCalendarConnected: () => void;
  meetings: Meeting[];
  activeMeetingId: string | null;
  setActiveMeetingId: (id: string | null) => void;
  createMockNote: () => string;
  /**
   * Creates a new meeting record at recording start time.
   * Sets it as the active meeting and returns its ID.
   * Called by RecordingController.start() so the transcript always has a target.
   */
  createMeetingForRecording: (source?: string) => string;
  toggleActionItem: (meetingId: string, itemId: string) => void;
  deleteMeeting: (id: string) => void;
  appendTranscriptLine: (meetingId: string, line: TranscriptLine) => void;
  
  // Action Item CRUD
  addActionItem: (meetingId: string, text: string) => void;
  editActionItem: (meetingId: string, itemId: string, text: string) => void;
  deleteActionItem: (meetingId: string, itemId: string) => void;

  // AI Summary
  updateAiSummary: (meetingId: string, summary: string) => void;

  // Duration
  /** Writes the final recorded duration (e.g. "12m", "1h 05m") onto a meeting. */
  setMeetingDuration: (meetingId: string, duration: string) => void;

  /** Updates a meeting's preview text (shown on Home/History cards). */
  setMeetingPreview: (meetingId: string, preview: string) => void;

  // Settings State variables
  provider: string;
  setProvider: (provider: string) => void;
  model: string;
  setModel: (model: string) => void;
  apiKeys: Record<string, string>;
  setApiKeyForProvider: (provider: string, key: string) => void;
  baseUrls: Record<string, string>;
  setBaseUrlForProvider: (provider: string, url: string) => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  availableModels: string[];
  setAvailableModels: (models: string[]) => void;
  connectionStatus: 'idle' | 'testing' | 'success' | 'failed';
  setConnectionStatus: (status: 'idle' | 'testing' | 'success' | 'failed') => void;
  cachedModels: Record<string, string[]>;

  // Secure credential store tracking (OS keychain via keytar)
  /** Set of provider names that have a key saved in the OS keychain */
  savedKeyProviders: Set<string>;
  markProviderKeySaved: (provider: string) => void;
  clearProviderKeySaved: (provider: string) => void;
  setCachedModelsForProvider: (provider: string, models: string[]) => void;
  capabilities: ProviderCapabilities;
  setCapabilities: (caps: ProviderCapabilities) => void;

  // AWS Bedrock parameters
  awsAccessKeyId: string;
  setAwsAccessKeyId: (val: string) => void;
  awsSecretAccessKey: string;
  setAwsSecretAccessKey: (val: string) => void;
  awsRegion: string;
  setAwsRegion: (val: string) => void;

  // Azure OpenAI parameters
  azureEndpoint: string;
  setAzureEndpoint: (val: string) => void;
  azureDeploymentName: string;
  setAzureDeploymentName: (val: string) => void;
  azureApiVersion: string;
  setAzureApiVersion: (val: string) => void;

  // Recording State variables
  recordingStatus: RecordingStatus;
  setRecordingStatus: (status: RecordingStatus) => void;
  recordingDuration: number;
  setRecordingDuration: (duration: number) => void;
  incrementRecordingDuration: () => void;
  recordingFilePath: string | null;
  setRecordingFilePath: (path: string | null) => void;
  /** Set when RecordingController.start() fails (mic permission denied, no
   *  input device, etc). Cleared on the next successful start attempt.
   *  Global (not component-local) so the auto-start path triggered from the
   *  meeting-detection notification — which navigates away before it can
   *  show its own inline error — can still surface the failure wherever the
   *  user lands. */
  recordingStartError: string | null;
  setRecordingStartError: (error: string | null) => void;

  // Streaming & Live Transcription variables
  transcriptionStatus: TranscriptionStatus;
  setTranscriptionStatus: (status: TranscriptionStatus) => void;
  lastTranscriptionError: string | null;
  setLastTranscriptionError: (message: string | null) => void;
  streamState: StreamState;
  setStreamState: (state: StreamState) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  lastTranscriptTime: number;
  setLastTranscriptTime: (time: number) => void;
  providerLatency: number;
  setProviderLatency: (latency: number) => void;
  transcriptSegments: TranscriptLine[];
  setTranscriptSegments: (segments: TranscriptLine[]) => void;
  
  // AI Note Generation Progress
  isProcessingAI: boolean;
  setIsProcessingAI: (val: boolean) => void;

  // Recording Settings
  micDevice: string;
  setMicDevice: (device: string) => void;
  systemAudio: boolean;
  setSystemAudio: (enabled: boolean) => void;
  sampleRate: string;
  setSampleRate: (rate: string) => void;
  quality: string;
  setQuality: (quality: string) => void;

  // Storage Settings
  dbLocation: string;
  setDbLocation: (path: string) => void;
  recordingFolder: string;
  setRecordingFolder: (path: string) => void;

  // Advanced Developer Settings
  debugLogs: boolean;
  setDebugLogs: (enabled: boolean) => void;
  devMode: boolean;
  setDevMode: (enabled: boolean) => void;
  experimentalFeatures: boolean;
  setExperimentalFeatures: (enabled: boolean) => void;
  autoUpdate: boolean;
  setAutoUpdate: (enabled: boolean) => void;

  // Notifications
  /** Master switch — when true, suppresses all in-app + native notifications except errors. */
  notificationsDisabled: boolean;
  setNotificationsDisabled: (disabled: boolean) => void;
  /** Whether meeting-detection notifications (in-app banner + native OS toast) are shown. */
  meetingDetectionNotifications: boolean;
  setMeetingDetectionNotifications: (enabled: boolean) => void;
  /**
   * Placeholder — no calendar integration exists in this app (the fake
   * Google/Outlook connect UI was removed). Kept as a stored preference so
   * the toggle is ready to wire in once real calendar sync is built, rather
   * than silently doing nothing with no indication why.
   */
  calendarReminderNotifications: boolean;
  setCalendarReminderNotifications: (enabled: boolean) => void;

  // Language
  /** UI display language. Note: changing this only updates the stored
   *  preference — the interface strings themselves are not yet localized
   *  (this app has no i18n infrastructure). Wiring real translations is a
   *  separate, larger effort. */
  interfaceLanguage: string;
  setInterfaceLanguage: (code: string) => void;
  /** Whisper/transcription language hint — passed as the `language` param
   *  to STT providers that support it (OpenAI/Groq Whisper). 'auto' omits
   *  the param entirely and lets the model auto-detect. */
  transcriptionLanguage: string;
  setTranscriptionLanguage: (code: string) => void;

  // Audio Retention
  /** How long recorded audio files are kept before automatic deletion. '-1' = forever. */
  audioRetentionDays: number;
  setAudioRetentionDays: (days: number) => void;

  // Meeting Detection
  detectedMeeting: DetectedMeeting | null;
  setDetectedMeeting: (meeting: DetectedMeeting | null) => void;
  dismissedMeetingIds: Set<string>;
  dismissDetectedMeeting: (meetingId: string) => void;
  isMeetingNotificationVisible: boolean;
  setMeetingNotificationVisible: (visible: boolean) => void;

  // Persistence (SQLite via Drizzle, main process)
  /** True once the initial load from the local database has completed. */
  isHydrated: boolean;
  /** Loads all meetings from the local SQLite database into the store. Call once on app mount. */
  hydrateFromDb: () => Promise<void>;

  // AI Chat
  chatThreads: ChatThread[];
  activeChatThreadId: string | null;
  isChatHydrated: boolean;
  isChatStreaming: boolean;
  hydrateChatFromDb: () => Promise<void>;
  setActiveChatThreadId: (id: string | null) => void;
  createChatThread: (meetingId?: string | null) => string;
  renameChatThread: (threadId: string, title: string) => void;
  deleteChatThread: (threadId: string) => void;
  appendChatMessage: (threadId: string, role: 'user' | 'assistant' | 'system', content: string) => string;
  setIsChatStreaming: (val: boolean) => void;
}



/**
 * Fire-and-forget persistence to the local SQLite database via IPC.
 * Never throws into the caller — failures are logged only, so recording/note
 * flows are never blocked or broken by a persistence error.
 */
function persistMeeting(meeting: Meeting) {
  if (!window.electronAPI?.dbUpsertMeeting) return;
  window.electronAPI
    .dbUpsertMeeting({
      id: meeting.id,
      title: meeting.title,
      date: meeting.date,
      time: meeting.time,
      duration: meeting.duration,
      preview: meeting.preview,
      participants: meeting.participants,
      timeline: meeting.timeline,
      aiNotes: meeting.aiNotes,
      aiSummary: meeting.aiSummary,
    })
    .catch((err: unknown) => console.error('[persist] upsert-meeting failed:', err));
}

function persistDeleteMeeting(meetingId: string) {
  if (!window.electronAPI?.dbDeleteMeeting) return;
  window.electronAPI
    .dbDeleteMeeting(meetingId)
    .catch((err: unknown) => console.error('[persist] delete-meeting failed:', err));
}

function persistTranscriptLine(meetingId: string, line: TranscriptLine) {
  if (!window.electronAPI?.dbAppendTranscriptLine) return;
  window.electronAPI
    .dbAppendTranscriptLine(meetingId, line)
    .catch((err: unknown) => console.error('[persist] append-transcript-line failed:', err));
}

function persistActionItems(meetingId: string, items: ActionItem[]) {
  if (!window.electronAPI?.dbReplaceActionItems) return;
  window.electronAPI
    .dbReplaceActionItems(meetingId, items)
    .catch((err: unknown) => console.error('[persist] replace-action-items failed:', err));
}

export const useAppStore = create<AppState>((set, get) => ({
  calendarConnected: false,
  toggleCalendarConnected: () => set((state) => ({ calendarConnected: !state.calendarConnected })),
  meetings: [],
  isHydrated: false,
  hydrateFromDb: async () => {
    if (!window.electronAPI?.dbListMeetings) {
      set({ isHydrated: true });
      return;
    }
    try {
      const result = await window.electronAPI.dbListMeetings();
      if (result.ok) {
        set({
          meetings: result.meetings.map((m) => ({
            id: m.id,
            title: m.title,
            date: m.date,
            time: m.time,
            duration: m.duration,
            preview: m.preview,
            participants: m.participants,
            transcript: m.transcript,
            aiNotes: m.aiNotes,
            aiSummary: m.aiSummary,
            actionItems: m.actionItems,
            timeline: m.timeline,
          })),
          isHydrated: true,
        });
      } else {
        console.error('[hydrate] list-meetings returned error:', result.error);
        set({ isHydrated: true });
      }
    } catch (err) {
      console.error('[hydrate] Failed to load meetings from database:', err);
      set({ isHydrated: true });
    }
  },

  // ── AI Chat ─────────────────────────────────────────────────────────────────
  chatThreads: [],
  activeChatThreadId: null,
  isChatHydrated: false,
  isChatStreaming: false,
  hydrateChatFromDb: async () => {
    if (!window.electronAPI?.dbListChatThreads) {
      set({ isChatHydrated: true });
      return;
    }
    try {
      const result = await window.electronAPI.dbListChatThreads();
      if (result.ok) {
        set({ chatThreads: result.threads, isChatHydrated: true });
      } else {
        console.error('[hydrate] list-chat-threads returned error:', result.error);
        set({ isChatHydrated: true });
      }
    } catch (err) {
      console.error('[hydrate] Failed to load chat threads from database:', err);
      set({ isChatHydrated: true });
    }
  },
  setActiveChatThreadId: (id) => set({ activeChatThreadId: id }),
  createChatThread: (meetingId) => {
    const id = `thread-${Date.now()}`;
    const now = Date.now();
    const newThread: ChatThread = {
      id,
      meetingId: meetingId ?? null,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    set((state) => ({
      chatThreads: [newThread, ...state.chatThreads],
      activeChatThreadId: id,
    }));
    if (window.electronAPI?.dbCreateChatThread) {
      window.electronAPI
        .dbCreateChatThread(id, newThread.title, meetingId ?? null)
        .catch((err: unknown) => console.error('[persist] create-chat-thread failed:', err));
    }
    return id;
  },
  renameChatThread: (threadId, title) => {
    set((state) => ({
      chatThreads: state.chatThreads.map((t) => (t.id === threadId ? { ...t, title } : t)),
    }));
    if (window.electronAPI?.dbRenameChatThread) {
      window.electronAPI
        .dbRenameChatThread(threadId, title)
        .catch((err: unknown) => console.error('[persist] rename-chat-thread failed:', err));
    }
  },
  deleteChatThread: (threadId) => {
    set((state) => ({
      chatThreads: state.chatThreads.filter((t) => t.id !== threadId),
      activeChatThreadId: state.activeChatThreadId === threadId ? null : state.activeChatThreadId,
    }));
    if (window.electronAPI?.dbDeleteChatThread) {
      window.electronAPI
        .dbDeleteChatThread(threadId)
        .catch((err: unknown) => console.error('[persist] delete-chat-thread failed:', err));
    }
  },
  appendChatMessage: (threadId, role, content) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    set((state) => ({
      chatThreads: state.chatThreads.map((t) => {
        if (t.id !== threadId) return t;
        const isFirstUserMessage = role === 'user' && t.messages.length === 0;
        return {
          ...t,
          updatedAt: now,
          title: isFirstUserMessage ? content.slice(0, 48) : t.title,
          messages: [...t.messages, { id, role, content, createdAt: now }],
        };
      }),
    }));
    // Persist title alongside the first user message so the sidebar label is saved
    const thread = get().chatThreads.find((t) => t.id === threadId);
    if (thread && role === 'user' && thread.messages.length === 1 && window.electronAPI?.dbRenameChatThread) {
      window.electronAPI
        .dbRenameChatThread(threadId, thread.title)
        .catch((err: unknown) => console.error('[persist] rename-chat-thread failed:', err));
    }
    if (window.electronAPI?.dbAppendChatMessage) {
      window.electronAPI
        .dbAppendChatMessage(threadId, { id, role, content })
        .catch((err: unknown) => console.error('[persist] append-chat-message failed:', err));
    }
    return id;
  },
  setIsChatStreaming: (val) => set({ isChatStreaming: val }),

  activeMeetingId: null,
  setActiveMeetingId: (id) => set({ activeMeetingId: id }),
  createMockNote: () => {
    const id = `note-${Date.now()}`;
    const newMeeting: Meeting = {
      id,
      title: 'Untitled Note',
      date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: '0m',
      preview: 'Empty meeting note workspace. Start typing notes or record transcription.',
      participants: ['You'],
      transcript: [],
      aiNotes: '',
      aiSummary: '',
      actionItems: [],
      timeline: []
    };
    set((state) => ({
      meetings: [newMeeting, ...state.meetings],
      activeMeetingId: id
    }));
    persistMeeting(newMeeting);
    return id;
  },
  createMeetingForRecording: (source?: string) => {
    const id = `meeting-${Date.now()}`;
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const title = source ? `${source} — ${timeLabel}` : `Meeting — ${timeLabel}`;
    const newMeeting: Meeting = {
      id,
      title,
      date: dateLabel,
      time: timeLabel,
      duration: '0m',
      preview: 'Recording in progress…',
      participants: ['You'],
      transcript: [],
      aiNotes: '',
      aiSummary: '',
      actionItems: [],
      timeline: [],
    };
    set((state) => ({
      meetings: [newMeeting, ...state.meetings],
      activeMeetingId: id,
    }));
    persistMeeting(newMeeting);
    return id;
  },
  toggleActionItem: (meetingId, itemId) => {
    set((state) => ({
      meetings: state.meetings.map((meeting) => {
        if (meeting.id === meetingId) {
          return {
            ...meeting,
            actionItems: meeting.actionItems.map((item) =>
              item.id === itemId ? { ...item, done: !item.done } : item
            )
          };
        }
        return meeting;
      })
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistActionItems(meetingId, updated.actionItems);
  },
  deleteMeeting: (id) => {
    set((state) => ({
      meetings: state.meetings.filter((meeting) => meeting.id !== id),
      activeMeetingId: state.activeMeetingId === id ? null : state.activeMeetingId
    }));
    persistDeleteMeeting(id);
  },
  appendTranscriptLine: (meetingId, line) => {
    set((state) => ({
      meetings: state.meetings.map((meeting) => {
        if (meeting.id === meetingId) {
          return {
            ...meeting,
            transcript: [...meeting.transcript, line]
          };
        }
        return meeting;
      })
    }));
    persistTranscriptLine(meetingId, line);
  },
  // AI Summary
  updateAiSummary: (meetingId, summary) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId ? { ...m, aiSummary: summary } : m
      )
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistMeeting(updated);
  },

  // Duration
  setMeetingDuration: (meetingId, duration) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId ? { ...m, duration } : m
      )
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistMeeting(updated);
  },
  setMeetingPreview: (meetingId, preview) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId ? { ...m, preview } : m
      )
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistMeeting(updated);
  },



  // Action Item CRUD
  addActionItem: (meetingId, text) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              actionItems: [
                ...m.actionItems,
                { id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, text, done: false }
              ]
            }
          : m
      )
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistActionItems(meetingId, updated.actionItems);
  },
  editActionItem: (meetingId, itemId, text) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              actionItems: m.actionItems.map((item) =>
                item.id === itemId ? { ...item, text } : item
              )
            }
          : m
      )
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistActionItems(meetingId, updated.actionItems);
  },
  deleteActionItem: (meetingId, itemId) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              actionItems: m.actionItems.filter((item) => item.id !== itemId)
            }
          : m
      )
    }));
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistActionItems(meetingId, updated.actionItems);
  },

  // Settings State variables
  provider: 'OpenAI',
  setProvider: (provider) => {
    set((state) => {
      const cached = state.cachedModels[provider] || [];
      return {
        provider,
        availableModels: cached,
        model: cached[0] || '',
        connectionStatus: cached.length > 0 ? 'success' : 'idle'
      };
    });
  },
  model: '',
  setModel: (model) => set({ model }),
  apiKeys: {
    'OpenAI': '',
    'Azure OpenAI': '',
    'Anthropic': '',
    'Gemini': '',
    'Groq': '',
    'AssemblyAI': '',
    'Deepgram': '',
    'OpenRouter': '',
    'Custom OpenAI-Compatible': ''
  },
  setApiKeyForProvider: (provider, key) => set((state) => ({
    apiKeys: {
      ...state.apiKeys,
      [provider]: key
    }
  })),
  baseUrls: {
    'OpenRouter': 'https://openrouter.ai/api/v1',
    'Ollama': 'http://localhost:11434',
    'Custom OpenAI-Compatible': 'http://localhost:11434'
  },
  setBaseUrlForProvider: (provider, url) => set((state) => ({
    baseUrls: {
      ...state.baseUrls,
      [provider]: url
    }
  })),
  theme: 'system',
  setTheme: (theme) => set({ theme }),
  availableModels: [],
  setAvailableModels: (availableModels) => set({ availableModels }),
  connectionStatus: 'idle',
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  cachedModels: {},
  setCachedModelsForProvider: (provider, models) => set((state) => ({
    cachedModels: {
      ...state.cachedModels,
      [provider]: models
    }
  })),

  // Secure credential store tracking
  savedKeyProviders: new Set<string>(),
  markProviderKeySaved: (provider) => set((state) => ({
    savedKeyProviders: new Set([...state.savedKeyProviders, provider])
  })),
  clearProviderKeySaved: (provider) => set((state) => {
    const next = new Set(state.savedKeyProviders);
    next.delete(provider);
    return { savedKeyProviders: next };
  }),

  capabilities: {
    chat: true,
    speech_to_text: true,
    audio_generation: false,
    realtime: true,
    vision: true,
    embeddings: true,
    function_calling: true
  },
  setCapabilities: (capabilities) => set({ capabilities }),

  // AWS Bedrock parameters
  awsAccessKeyId: '',
  setAwsAccessKeyId: (awsAccessKeyId) => set({ awsAccessKeyId }),
  awsSecretAccessKey: '',
  setAwsSecretAccessKey: (awsSecretAccessKey) => set({ awsSecretAccessKey }),
  awsRegion: 'us-east-1',
  setAwsRegion: (awsRegion) => set({ awsRegion }),

  // Azure OpenAI parameters
  azureEndpoint: '',
  setAzureEndpoint: (azureEndpoint) => set({ azureEndpoint }),
  azureDeploymentName: '',
  setAzureDeploymentName: (azureDeploymentName) => set({ azureDeploymentName }),
  azureApiVersion: '2024-02-15-preview',
  setAzureApiVersion: (azureApiVersion) => set({ azureApiVersion }),

  // Recording State variables
  recordingStatus: 'idle',
  setRecordingStatus: (recordingStatus) => set({ recordingStatus }),
  recordingDuration: 0,
  setRecordingDuration: (recordingDuration) => set({ recordingDuration }),
  incrementRecordingDuration: () => set((state) => ({ recordingDuration: state.recordingDuration + 1 })),
  recordingFilePath: null,
  setRecordingFilePath: (recordingFilePath) => set({ recordingFilePath }),
  recordingStartError: null,
  setRecordingStartError: (recordingStartError) => set({ recordingStartError }),

  // Streaming & Live Transcription variables
  transcriptionStatus: 'idle',
  setTranscriptionStatus: (transcriptionStatus) => set({ transcriptionStatus }),
  lastTranscriptionError: null,
  setLastTranscriptionError: (lastTranscriptionError) => set({ lastTranscriptionError }),
  streamState: 'disconnected',
  setStreamState: (streamState) => set({ streamState }),
  activeSessionId: null,
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  lastTranscriptTime: 0,
  setLastTranscriptTime: (lastTranscriptTime) => set({ lastTranscriptTime }),
  providerLatency: 0,
  setProviderLatency: (providerLatency) => set({ providerLatency }),
  transcriptSegments: [],
  setTranscriptSegments: (transcriptSegments) => set({ transcriptSegments }),
  
  // AI processing status
  isProcessingAI: false,
  setIsProcessingAI: (isProcessingAI) => set({ isProcessingAI }),

  // Recording Settings
  micDevice: 'default',
  setMicDevice: (micDevice) => set({ micDevice }),
  systemAudio: true,
  setSystemAudio: (systemAudio) => set({ systemAudio }),
  sampleRate: '44100',
  setSampleRate: (sampleRate) => set({ sampleRate }),
  quality: 'high',
  setQuality: (quality) => set({ quality }),

  // Storage
  dbLocation: 'database/granola.db',
  setDbLocation: (dbLocation) => set({ dbLocation }),
  recordingFolder: 'recordings/',
  setRecordingFolder: (recordingFolder) => set({ recordingFolder }),

  // Advanced Developer Settings
  debugLogs: false,
  setDebugLogs: (debugLogs) => set({ debugLogs }),
  devMode: false,
  setDevMode: (devMode) => set({ devMode }),
  experimentalFeatures: false,
  setExperimentalFeatures: (experimentalFeatures) => set({ experimentalFeatures }),
  autoUpdate: true,
  setAutoUpdate: (autoUpdate) => set({ autoUpdate }),

  // Notifications
  notificationsDisabled: false,
  setNotificationsDisabled: (notificationsDisabled) => set({ notificationsDisabled }),
  meetingDetectionNotifications: true,
  setMeetingDetectionNotifications: (meetingDetectionNotifications) => set({ meetingDetectionNotifications }),
  calendarReminderNotifications: true,
  setCalendarReminderNotifications: (calendarReminderNotifications) => set({ calendarReminderNotifications }),

  // Language
  interfaceLanguage: 'en',
  setInterfaceLanguage: (interfaceLanguage) => set({ interfaceLanguage }),
  transcriptionLanguage: 'auto',
  setTranscriptionLanguage: (transcriptionLanguage) => set({ transcriptionLanguage }),

  // Audio Retention
  audioRetentionDays: 30,
  setAudioRetentionDays: (audioRetentionDays) => set({ audioRetentionDays }),

  // Meeting Detection
  detectedMeeting: null,
  setDetectedMeeting: (detectedMeeting) => set({ detectedMeeting }),
  dismissedMeetingIds: new Set(),
  dismissDetectedMeeting: (meetingId) => set((state) => ({
    dismissedMeetingIds: new Set([...state.dismissedMeetingIds, meetingId]),
    detectedMeeting: state.detectedMeeting?.id === meetingId ? null : state.detectedMeeting,
    isMeetingNotificationVisible: state.detectedMeeting?.id === meetingId ? false : state.isMeetingNotificationVisible
  })),
  isMeetingNotificationVisible: false,
  setMeetingNotificationVisible: (isMeetingNotificationVisible) => set({ isMeetingNotificationVisible })
}));
