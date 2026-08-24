import { create } from 'zustand';

export interface TranscriptLine {
  time: string;
  speaker: string;
  text: string;
  /**
   * Audio Source Attribution layer output for this line (see
   * AudioSourceAttribution.ts) — deterministic, not inferred: microphone →
   * "Speaker 1", system output → "Speaker 2". In-memory only for now —
   * not yet persisted to the SQLite schema, so this does not survive an
   * app restart. Live-session UI/debugging can still read it directly off
   * transcriptSegments while the recording is active.
   */
  attributionSource?: 'microphone' | 'system';
  attributionSpeaker?: 'Speaker 1' | 'Speaker 2';
  attributionConfidence?: number;
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

export type MeetingTemplateId = 
  | 'default' 
  | 'interview' 
  | 'client' 
  | 'recruitment_metrics' 
  | 'hr_strategy' 
  | 'performance_feedback' 
  | 'team_recap';

export interface ScorecardCriterion {
  id: string;
  category: string;
  score?: number; // 1 to 5
  comments: string;
}

export interface CandidateInfo {
  name: string;
  role: string;
  scorecard: ScorecardCriterion[];
  overallRecommendation?: 'Strong Hire' | 'Hire' | 'Leaning Hire' | 'No Hire';
}

export interface ClientRequirement {
  id: string;
  title: string;
  category: 'Feature Request' | 'Constraint / Budget' | 'Feedback / Pain Point' | 'Action Item';
  priority: 'High' | 'Medium' | 'Low';
  notes: string;
}

export interface ClientMeetingInfo {
  clientName: string;
  projectName: string;
  requirements: ClientRequirement[];
}

/**
 * Shared list-item shape used by the four newer template types
 * (Recruitment Metrics, HR Strategy, Performance Feedback, Team Recap).
 * Each template reuses this instead of a bespoke shape per template —
 * the meaning of "category" and "label" differs per template (e.g. a
 * hiring-funnel stage vs. a review goal), but the CRUD/display shape is
 * identical, so one generic interface + one set of store actions covers
 * all four rather than duplicating near-identical code four times.
 */
export interface TemplateInsightItem {
  id: string;
  /** Short label — e.g. "Applicants → Interviews", "Q3 Headcount Freeze", "Missed sprint deadline twice" */
  label: string;
  /** Template-specific category/tag — see each *_CATEGORIES const for the allowed values per template */
  category: string;
  /** Optional numeric value for metrics-style templates (e.g. count, %, days) — omitted where not applicable */
  value?: string;
  /** Supporting detail extracted from the transcript */
  notes: string;
}

export interface RecruitmentMetricsInfo {
  /** Free-text AI summary of the overall hiring funnel discussion */
  summary: string;
  metrics: TemplateInsightItem[];
}

export interface HrStrategyInfo {
  summary: string;
  points: TemplateInsightItem[];
}

export interface PerformanceFeedbackInfo {
  employeeName: string;
  role: string;
  summary: string;
  items: TemplateInsightItem[];
  overallRating?: 'Exceeds Expectations' | 'Meets Expectations' | 'Needs Improvement' | 'Unsatisfactory';
}

export interface TeamRecapInfo {
  summary: string;
  highlights: TemplateInsightItem[];
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
  /**
   * Free-form rich-text notes the user types manually below the transcript
   * card. Stored as sanitized HTML (bold/italic/lists survive reloads).
   * Included in AI generation alongside the transcript so summaries/action
   * items/decisions/follow-ups account for anything typed manually.
   */
  additionalNotes: string;
  actionItems: ActionItem[];
  timeline: TimelineSegment[];
  /** Meeting template type */
  templateId?: MeetingTemplateId;
  candidateInfo?: CandidateInfo;
  clientInfo?: ClientMeetingInfo;
  recruitmentMetricsInfo?: RecruitmentMetricsInfo;
  hrStrategyInfo?: HrStrategyInfo;
  performanceFeedbackInfo?: PerformanceFeedbackInfo;
  teamRecapInfo?: TeamRecapInfo;
  /** Unix ms timestamp of when this meeting was moved to the Bin. Only set on entries in `deletedMeetings`. */
  deletedAt?: number;
  /**
   * Unix ms timestamp this meeting was originally created. Used to keep the
   * Home dashboard's newest-first ordering correct when a meeting is
   * restored from the Bin back into the middle of the existing list, rather
   * than always re-appearing at the very top regardless of its real date.
   */
  createdAt?: number;
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
  // Recording Mode & Template selection
  selectedRecordingTemplate: MeetingTemplateId;
  setSelectedRecordingTemplate: (templateId: MeetingTemplateId) => void;
  setMeetingTemplate: (meetingId: string, templateId: MeetingTemplateId) => void;
  updateCandidateScorecard: (meetingId: string, criterionId: string, score?: number, comments?: string) => void;
  addScorecardCriterion: (meetingId: string, category: string) => void;
  removeScorecardCriterion: (meetingId: string, criterionId: string) => void;
  updateCandidateInfo: (meetingId: string, candidateInfo: Partial<CandidateInfo>) => void;
  addClientRequirement: (meetingId: string, req: Omit<ClientRequirement, 'id'>) => void;
  updateClientRequirement: (meetingId: string, reqId: string, updates: Partial<ClientRequirement>) => void;
  deleteClientRequirement: (meetingId: string, reqId: string) => void;
  updateClientInfo: (meetingId: string, updates: Partial<Pick<ClientMeetingInfo, 'clientName' | 'projectName'>>) => void;

  // Recruitment Metrics / HR Strategy / Performance Feedback / Team Recap —
  // all four share the same generic TemplateInsightItem CRUD shape, keyed by
  // which top-level info field on the Meeting the caller targets.
  setRecruitmentMetricsInfo: (meetingId: string, info: RecruitmentMetricsInfo) => void;
  addRecruitmentMetric: (meetingId: string, item: Omit<TemplateInsightItem, 'id'>) => void;
  updateRecruitmentMetric: (meetingId: string, itemId: string, updates: Partial<TemplateInsightItem>) => void;
  deleteRecruitmentMetric: (meetingId: string, itemId: string) => void;

  setHrStrategyInfo: (meetingId: string, info: HrStrategyInfo) => void;
  addHrStrategyPoint: (meetingId: string, item: Omit<TemplateInsightItem, 'id'>) => void;
  updateHrStrategyPoint: (meetingId: string, itemId: string, updates: Partial<TemplateInsightItem>) => void;
  deleteHrStrategyPoint: (meetingId: string, itemId: string) => void;

  setPerformanceFeedbackInfo: (meetingId: string, info: PerformanceFeedbackInfo) => void;
  addPerformanceFeedbackItem: (meetingId: string, item: Omit<TemplateInsightItem, 'id'>) => void;
  updatePerformanceFeedbackItem: (meetingId: string, itemId: string, updates: Partial<TemplateInsightItem>) => void;
  deletePerformanceFeedbackItem: (meetingId: string, itemId: string) => void;

  setTeamRecapInfo: (meetingId: string, info: TeamRecapInfo) => void;
  addTeamRecapHighlight: (meetingId: string, item: Omit<TemplateInsightItem, 'id'>) => void;
  updateTeamRecapHighlight: (meetingId: string, itemId: string, updates: Partial<TemplateInsightItem>) => void;
  deleteTeamRecapHighlight: (meetingId: string, itemId: string) => void;

  createMeetingForRecording: (source?: string, templateId?: MeetingTemplateId) => string;
  toggleActionItem: (meetingId: string, itemId: string) => void;
  /** Moves a meeting to the Bin. It disappears from the main list but can be restored or permanently erased from there. */
  deleteMeeting: (id: string) => void;
  appendTranscriptLine: (meetingId: string, line: TranscriptLine) => void;

  // Bin (soft-deleted meetings)
  deletedMeetings: Meeting[];
  isBinHydrated: boolean;
  /** Loads meetings currently in the Bin from the local database. */
  hydrateBinFromDb: () => Promise<void>;
  /** Moves a meeting from the Bin back to the active list. */
  restoreMeeting: (id: string) => void;
  /** Permanently erases a meeting and all its data (transcript, notes, chat). Cannot be undone. */
  permanentlyDeleteMeeting: (id: string) => void;
  
  // Action Item CRUD
  addActionItem: (meetingId: string, text: string) => void;
  editActionItem: (meetingId: string, itemId: string, text: string) => void;
  deleteActionItem: (meetingId: string, itemId: string) => void;

  // AI Summary
  updateAiSummary: (meetingId: string, summary: string) => void;
  updateAdditionalNotes: (meetingId: string, notes: string) => void;

  // Duration
  /** Writes the final recorded duration (e.g. "12m", "1h 05m") onto a meeting. */
  setMeetingDuration: (meetingId: string, duration: string) => void;

  /** Updates a meeting's preview text (shown on Home dashboard cards). */
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
  isMicMuted: boolean;
  setIsMicMuted: (isMicMuted: boolean) => void;
  toggleMicMute: () => void;
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
  /**
   * Set when the active microphone track reports it has ended or muted
   * unexpectedly mid-recording — most commonly a Bluetooth mic's audio
   * profile switching or briefly dropping the connection, which Windows
   * surfaces as the audio endpoint device being invalidated
   * (AUDCLNT_E_DEVICE_INVALIDATED). Recording continues, but voice
   * detection accuracy degrades while the track is in this state, so the
   * user is shown a visible warning rather than silently getting a worse
   * transcript with no explanation.
   */
  micDeviceWarning: string | null;
  setMicDeviceWarning: (message: string | null) => void;

  // ── Audio source debug panel state ──────────────────────────────────────
  // Per the deterministic two-source attribution architecture: microphone
  // → Speaker 1, system output → Speaker 2, always. These fields exist so
  // that BEFORE anyone questions the transcription/diarization output, it's
  // possible to directly verify both audio streams actually exist and are
  // producing signal — a debug panel reads these live during a recording.
  /** 'active' once the mic stream is acquired and flowing; 'inactive' otherwise (muted, not started, or a device health issue). */
  micAudioStatus: 'active' | 'inactive';
  setMicAudioStatus: (status: 'active' | 'inactive') => void;
  /** 'active' only once system-output loopback capture is CONFIRMED producing real signal (not just that getDisplayMedia resolved). */
  systemAudioStatus: 'active' | 'inactive';
  setSystemAudioStatus: (status: 'active' | 'inactive') => void;
  /** Real-time microphone input level, 0-100, for the debug panel's level meter. */
  micInputLevel: number;
  setMicInputLevel: (level: number) => void;
  /** Real-time system-output level, 0-100, for the debug panel's level meter. */
  systemOutputLevel: number;
  setSystemOutputLevel: (level: number) => void;
  /**
   * True when system/loopback audio capture is confirmed unavailable for
   * the current recording. Drives a visible, non-dismissable-by-silence
   * banner stating "System audio capture unavailable. Two-speaker
   * attribution cannot be guaranteed." — the app must never pretend
   * two-source attribution is working when it isn't.
   */
  systemAudioCritical: boolean;
  setSystemAudioCritical: (critical: boolean) => void;
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
  isMeetingNotificationVisible: boolean;
  setMeetingNotificationVisible: (visible: boolean) => void;
  dismissedMeetingIds: Set<string>;
  dismissDetectedMeeting: (meetingId: string) => void;
  /**
   * Releases a meeting ID from the dismissed set once its detection window
   * has actually ended (the meeting app/tab is no longer open). Meeting IDs
   * are content-based hashes of (detector, source, label) — for apps whose
   * window title stays static for the whole call (e.g. Teams desktop shows
   * "Chat | <name> | Microsoft Teams" throughout), a later, distinct call
   * with the same person produces the identical ID. Without releasing it
   * here, dismissing or starting a recording once would permanently block
   * that same title from ever notifying again for the rest of the app
   * session — this call keeps the block scoped to only the single
   * continuous detection window it was dismissed during.
   */
  clearDismissedMeeting: (meetingId: string) => void;

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
      additionalNotes: meeting.additionalNotes,
    })
    .catch((err: unknown) => console.error('[persist] upsert-meeting failed:', err));
}

function persistDeleteMeeting(meetingId: string) {
  if (!window.electronAPI?.dbDeleteMeeting) return;
  window.electronAPI
    .dbDeleteMeeting(meetingId)
    .catch((err: unknown) => console.error('[persist] delete-meeting failed:', err));
}

function persistRestoreMeeting(meetingId: string) {
  if (!window.electronAPI?.dbRestoreMeeting) return;
  window.electronAPI
    .dbRestoreMeeting(meetingId)
    .catch((err: unknown) => console.error('[persist] restore-meeting failed:', err));
}

function persistPermanentlyDeleteMeeting(meetingId: string) {
  if (!window.electronAPI?.dbPermanentlyDeleteMeeting) return;
  window.electronAPI
    .dbPermanentlyDeleteMeeting(meetingId)
    .catch((err: unknown) => console.error('[persist] permanently-delete-meeting failed:', err));
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
export const DEFAULT_PROVIDER_MODELS: Record<string, string[]> = {
  'Groq': [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'deepseek-r1-distill-llama-70b',
    'gemma2-9b-it',
  ],
  'OpenAI': [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  'Anthropic': [
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
  ],
  'Gemini': [
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  'Deepgram': ['nova-2', 'nova-2-general', 'nova-2-meeting'],
};

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
            additionalNotes: m.additionalNotes ?? '',
            actionItems: m.actionItems,
            timeline: m.timeline,
            createdAt: m.createdAt,
          })),
          isHydrated: true,
        });
      } else {
        console.error('[hydrate] list-meetings returned error:', result.error);
        set({ isHydrated: true });
      }

      // Auto-load all credentials from OS keychain
      if (window.electronAPI?.loadCredential) {
        const supported = ['Groq', 'OpenAI', 'Azure OpenAI', 'Anthropic', 'Gemini', 'AssemblyAI', 'Deepgram', 'OpenRouter', 'Custom OpenAI-Compatible'];
        for (const p of supported) {
          try {
            const cred = await window.electronAPI.loadCredential(p);
            if (cred.ok && cred.secret) {
              get().setApiKeyForProvider(p, cred.secret);
              get().markProviderKeySaved(p);
            }
          } catch { /* ignore */ }
        }
      }

      // Sanitize obsolete or decommissioned models — reset to groq/compound-mini which is confirmed working
      const currentModel = get().model;
      if (
        !currentModel ||
        currentModel.includes('gemma') ||
        currentModel.includes('mixtral') ||
        currentModel.includes('qwen') ||
        currentModel.includes('deepseek') ||
        currentModel.includes('70b') ||
        currentModel === 'llama-3.1-8b-instant' ||
        currentModel === 'llama-3.3-70b-versatile'
      ) {
        set({ model: 'groq/compound-mini' });
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
        // Restore whichever thread was open before a remount (e.g. after a
        // renderer crash/reload) rather than always landing on no thread
        // selected — see setActiveChatThreadId for where this is persisted.
        let restoredActiveId: string | null = null;
        try {
          const savedId = localStorage.getItem('mirai-active-chat-thread-id');
          if (savedId && result.threads.some((t) => t.id === savedId)) {
            restoredActiveId = savedId;
          }
        } catch {
          // localStorage unavailable — not critical, just skip restoration
        }
        set({
          chatThreads: result.threads,
          isChatHydrated: true,
          ...(restoredActiveId ? { activeChatThreadId: restoredActiveId } : {}),
        });
      } else {
        console.error('[hydrate] list-chat-threads returned error:', result.error);
        set({ isChatHydrated: true });
      }
    } catch (err) {
      console.error('[hydrate] Failed to load chat threads from database:', err);
      set({ isChatHydrated: true });
    }
  },
  setActiveChatThreadId: (id) => {
    set({ activeChatThreadId: id });
    try {
      if (id) localStorage.setItem('mirai-active-chat-thread-id', id);
      else localStorage.removeItem('mirai-active-chat-thread-id');
    } catch {
      // ignore — persistence is a nice-to-have, not required for correctness
    }
  },
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
    try {
      localStorage.setItem('mirai-active-chat-thread-id', id);
    } catch {
      // ignore
    }
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
      additionalNotes: '',
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
  selectedRecordingTemplate: 'default',
  setSelectedRecordingTemplate: (templateId) => set({ selectedRecordingTemplate: templateId }),

  setMeetingTemplate: (meetingId, templateId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;

        let candidateInfo = m.candidateInfo;
        let clientInfo = m.clientInfo;
        let recruitmentMetricsInfo = m.recruitmentMetricsInfo;
        let hrStrategyInfo = m.hrStrategyInfo;
        let performanceFeedbackInfo = m.performanceFeedbackInfo;
        let teamRecapInfo = m.teamRecapInfo;

        // Every template starts with EMPTY info objects — no placeholder/
        // mock content (no fabricated candidate name, scores, comments, or
        // fake client name/requirements). All of these are populated only
        // by the real transcript-based AI extraction ("Auto-Score via AI" /
        // "Extract via AI" buttons in each panel) or manual entry — never
        // by sample data the user never actually said or typed.
        if (templateId === 'interview' && !candidateInfo) {
          candidateInfo = {
            name: m.title.includes('<>') ? m.title.split('<>')[1].trim() : '',
            role: m.title.includes('<>') ? m.title.split('<>')[0].trim() : '',
            scorecard: [
              { id: '1', category: 'Problem-solving Skills', score: 0, comments: '' },
              { id: '2', category: 'Communication', score: 0, comments: '' },
              { id: '3', category: 'Technical Depth', score: 0, comments: '' },
              { id: '4', category: 'Culture & Alignment', score: 0, comments: '' },
            ],
            overallRecommendation: undefined,
          };
        }

        if (templateId === 'client' && !clientInfo) {
          clientInfo = {
            clientName: '',
            projectName: '',
            requirements: [],
          };
        }

        // Recruitment Metrics / HR Strategy / Performance Feedback / Team
        // Recap intentionally start with EMPTY info objects (no placeholder/
        // mock content) — unlike the interview/client templates above, these
        // are meant to be populated only by the real transcript-based AI
        // extraction or manual entry, never by fabricated sample data.
        if (templateId === 'recruitment_metrics' && !recruitmentMetricsInfo) {
          recruitmentMetricsInfo = { summary: '', metrics: [] };
        }
        if (templateId === 'hr_strategy' && !hrStrategyInfo) {
          hrStrategyInfo = { summary: '', points: [] };
        }
        if (templateId === 'performance_feedback' && !performanceFeedbackInfo) {
          performanceFeedbackInfo = { employeeName: 'Employee', role: '', summary: '', items: [] };
        }
        if (templateId === 'team_recap' && !teamRecapInfo) {
          teamRecapInfo = { summary: '', highlights: [] };
        }

        const updated = {
          ...m,
          templateId,
          candidateInfo,
          clientInfo,
          recruitmentMetricsInfo,
          hrStrategyInfo,
          performanceFeedbackInfo,
          teamRecapInfo,
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  updateCandidateScorecard: (meetingId, criterionId, score, comments) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.candidateInfo) return m;
        const updatedScorecard = m.candidateInfo.scorecard.map((c) =>
          c.id === criterionId ? { ...c, score, comments: comments !== undefined ? comments : c.comments } : c
        );
        const updated = {
          ...m,
          candidateInfo: { ...m.candidateInfo, scorecard: updatedScorecard }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  addScorecardCriterion: (meetingId, category) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.candidateInfo) return m;
        // Random suffix alongside Date.now() — same reasoning as
        // addClientRequirement: guards against duplicate IDs if this is
        // ever called more than once within the same millisecond.
        const newCriterion = {
          id: `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          category,
          score: undefined,
          comments: '',
        };
        const updated = {
          ...m,
          candidateInfo: { ...m.candidateInfo, scorecard: [...m.candidateInfo.scorecard, newCriterion] }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  removeScorecardCriterion: (meetingId, criterionId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.candidateInfo) return m;
        const updated = {
          ...m,
          candidateInfo: {
            ...m.candidateInfo,
            scorecard: m.candidateInfo.scorecard.filter((c) => c.id !== criterionId),
          }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  updateCandidateInfo: (meetingId, candidateInfo) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.candidateInfo) return m;
        const updated = {
          ...m,
          candidateInfo: { ...m.candidateInfo, ...candidateInfo }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  addClientRequirement: (meetingId, req) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const currentClientInfo = m.clientInfo || { clientName: 'Client', projectName: 'Project', requirements: [] };
        // Random suffix (not just Date.now()) — when the AI auto-extract
        // flow calls this in a tight loop for multiple requirements, they
        // can all land within the same millisecond, producing duplicate IDs
        // and a React "two children with the same key" warning/misrender.
        const newReq = { ...req, id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        const updated = {
          ...m,
          clientInfo: {
            ...currentClientInfo,
            requirements: [newReq, ...currentClientInfo.requirements]
          }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  updateClientRequirement: (meetingId, reqId, updates) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.clientInfo) return m;
        const updatedReqs = m.clientInfo.requirements.map((r) => r.id === reqId ? { ...r, ...updates } : r);
        const updated = {
          ...m,
          clientInfo: { ...m.clientInfo, requirements: updatedReqs }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  deleteClientRequirement: (meetingId, reqId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.clientInfo) return m;
        const updatedReqs = m.clientInfo.requirements.filter((r) => r.id !== reqId);
        const updated = {
          ...m,
          clientInfo: { ...m.clientInfo, requirements: updatedReqs }
        };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  updateClientInfo: (meetingId, updates) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.clientInfo) return m;
        const updated = { ...m, clientInfo: { ...m.clientInfo, ...updates } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  // ── Recruitment Metrics ──────────────────────────────────────────────────
  setRecruitmentMetricsInfo: (meetingId, info) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const updated = { ...m, recruitmentMetricsInfo: info };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  addRecruitmentMetric: (meetingId, item) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const current = m.recruitmentMetricsInfo || { summary: '', metrics: [] };
        const newItem = { ...item, id: `metric-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        const updated = { ...m, recruitmentMetricsInfo: { ...current, metrics: [newItem, ...current.metrics] } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  updateRecruitmentMetric: (meetingId, itemId, updates) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.recruitmentMetricsInfo) return m;
        const metrics = m.recruitmentMetricsInfo.metrics.map((i) => i.id === itemId ? { ...i, ...updates } : i);
        const updated = { ...m, recruitmentMetricsInfo: { ...m.recruitmentMetricsInfo, metrics } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  deleteRecruitmentMetric: (meetingId, itemId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.recruitmentMetricsInfo) return m;
        const metrics = m.recruitmentMetricsInfo.metrics.filter((i) => i.id !== itemId);
        const updated = { ...m, recruitmentMetricsInfo: { ...m.recruitmentMetricsInfo, metrics } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  // ── HR Strategy ───────────────────────────────────────────────────────────
  setHrStrategyInfo: (meetingId, info) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const updated = { ...m, hrStrategyInfo: info };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  addHrStrategyPoint: (meetingId, item) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const current = m.hrStrategyInfo || { summary: '', points: [] };
        const newItem = { ...item, id: `hrpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        const updated = { ...m, hrStrategyInfo: { ...current, points: [newItem, ...current.points] } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  updateHrStrategyPoint: (meetingId, itemId, updates) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.hrStrategyInfo) return m;
        const points = m.hrStrategyInfo.points.map((i) => i.id === itemId ? { ...i, ...updates } : i);
        const updated = { ...m, hrStrategyInfo: { ...m.hrStrategyInfo, points } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  deleteHrStrategyPoint: (meetingId, itemId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.hrStrategyInfo) return m;
        const points = m.hrStrategyInfo.points.filter((i) => i.id !== itemId);
        const updated = { ...m, hrStrategyInfo: { ...m.hrStrategyInfo, points } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  // ── Performance Feedback ─────────────────────────────────────────────────
  setPerformanceFeedbackInfo: (meetingId, info) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const updated = { ...m, performanceFeedbackInfo: info };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  addPerformanceFeedbackItem: (meetingId, item) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const current = m.performanceFeedbackInfo || { employeeName: 'Employee', role: '', summary: '', items: [] };
        const newItem = { ...item, id: `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        const updated = { ...m, performanceFeedbackInfo: { ...current, items: [newItem, ...current.items] } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  updatePerformanceFeedbackItem: (meetingId, itemId, updates) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.performanceFeedbackInfo) return m;
        const items = m.performanceFeedbackInfo.items.map((i) => i.id === itemId ? { ...i, ...updates } : i);
        const updated = { ...m, performanceFeedbackInfo: { ...m.performanceFeedbackInfo, items } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  deletePerformanceFeedbackItem: (meetingId, itemId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.performanceFeedbackInfo) return m;
        const items = m.performanceFeedbackInfo.items.filter((i) => i.id !== itemId);
        const updated = { ...m, performanceFeedbackInfo: { ...m.performanceFeedbackInfo, items } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  // ── Team Recap ────────────────────────────────────────────────────────────
  setTeamRecapInfo: (meetingId, info) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const updated = { ...m, teamRecapInfo: info };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  addTeamRecapHighlight: (meetingId, item) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const current = m.teamRecapInfo || { summary: '', highlights: [] };
        const newItem = { ...item, id: `recap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        const updated = { ...m, teamRecapInfo: { ...current, highlights: [newItem, ...current.highlights] } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  updateTeamRecapHighlight: (meetingId, itemId, updates) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.teamRecapInfo) return m;
        const highlights = m.teamRecapInfo.highlights.map((i) => i.id === itemId ? { ...i, ...updates } : i);
        const updated = { ...m, teamRecapInfo: { ...m.teamRecapInfo, highlights } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },
  deleteTeamRecapHighlight: (meetingId, itemId) => {
    set((state) => ({
      meetings: state.meetings.map((m) => {
        if (m.id !== meetingId || !m.teamRecapInfo) return m;
        const highlights = m.teamRecapInfo.highlights.filter((i) => i.id !== itemId);
        const updated = { ...m, teamRecapInfo: { ...m.teamRecapInfo, highlights } };
        persistMeeting(updated);
        return updated;
      })
    }));
  },

  createMeetingForRecording: (source?: string, overrideTemplate?: MeetingTemplateId) => {
    const templateId = overrideTemplate || get().selectedRecordingTemplate || 'default';
    const id = `meeting-${Date.now()}`;
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let defaultTitle = `Meeting — ${timeLabel}`;
    if (templateId === 'interview') defaultTitle = `PM Interview <> Candidate`;
    else if (templateId === 'client') defaultTitle = `Client Alignment Sync — ${timeLabel}`;
    else if (templateId === 'recruitment_metrics') defaultTitle = `Recruitment Sync — ${timeLabel}`;
    else if (templateId === 'hr_strategy') defaultTitle = `HR Strategy Meeting — ${timeLabel}`;
    else if (templateId === 'performance_feedback') defaultTitle = `Performance Review — ${timeLabel}`;
    else if (templateId === 'team_recap') defaultTitle = `Team Sync — ${timeLabel}`;
    else if (source) defaultTitle = `${source} — ${timeLabel}`;

    const newMeeting: Meeting = {
      id,
      title: defaultTitle,
      date: dateLabel,
      time: timeLabel,
      duration: '0m',
      preview: 'No summary generated yet.',
      participants: ['You'],
      transcript: [],
      aiNotes: '',
      aiSummary: '',
      additionalNotes: '',
      actionItems: [],
      timeline: [],
      templateId,
      createdAt: Date.now(),
      // Every template starts with EMPTY info objects — no placeholder/mock
      // content. Populated only by the real transcript-based AI extraction
      // (the "Auto-Score via AI" / "Extract via AI" button in each panel)
      // or manual entry, never by fabricated sample data.
      candidateInfo: templateId === 'interview' ? {
        name: '',
        role: '',
        scorecard: [
          { id: '1', category: 'Problem-solving Skills', score: 0, comments: '' },
          { id: '2', category: 'Communication', score: 0, comments: '' },
          { id: '3', category: 'Technical Depth', score: 0, comments: '' },
          { id: '4', category: 'Culture & Alignment', score: 0, comments: '' },
        ],
        overallRecommendation: undefined,
      } : undefined,
      clientInfo: templateId === 'client' ? {
        clientName: '',
        projectName: '',
        requirements: [],
      } : undefined,
      // Recruitment Metrics / HR Strategy / Performance Feedback / Team
      // Recap start with EMPTY info objects — no placeholder/mock content.
      // They are populated only by the real transcript-based AI extraction
      // (the "Extract via AI" button in each panel) or manual entry.
      recruitmentMetricsInfo: templateId === 'recruitment_metrics' ? { summary: '', metrics: [] } : undefined,
      hrStrategyInfo: templateId === 'hr_strategy' ? { summary: '', points: [] } : undefined,
      performanceFeedbackInfo: templateId === 'performance_feedback'
        ? { employeeName: 'Employee', role: '', summary: '', items: [] }
        : undefined,
      teamRecapInfo: templateId === 'team_recap' ? { summary: '', highlights: [] } : undefined,
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
    set((state) => {
      const target = state.meetings.find((meeting) => meeting.id === id);
      const deletedEntry = target ? { ...target, deletedAt: Date.now() } : undefined;
      return {
        meetings: state.meetings.filter((meeting) => meeting.id !== id),
        activeMeetingId: state.activeMeetingId === id ? null : state.activeMeetingId,
        // Move into the in-memory Bin immediately so the UI reflects it
        // right away, even before hydrateBinFromDb() has ever run.
        deletedMeetings: deletedEntry ? [deletedEntry, ...state.deletedMeetings] : state.deletedMeetings,
      };
    });
    persistDeleteMeeting(id);
  },

  deletedMeetings: [],
  isBinHydrated: false,
  hydrateBinFromDb: async () => {
    if (!window.electronAPI?.dbListDeletedMeetings) {
      set({ isBinHydrated: true });
      return;
    }
    try {
      const result = await window.electronAPI.dbListDeletedMeetings();
      if (result.ok) {
        set({
          deletedMeetings: result.meetings.map((m) => ({
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
            additionalNotes: m.additionalNotes ?? '',
            actionItems: m.actionItems,
            timeline: m.timeline,
            deletedAt: m.deletedAt ?? undefined,
            createdAt: m.createdAt,
          })),
          isBinHydrated: true,
        });
      } else {
        console.error('[hydrate] list-deleted-meetings returned error:', result.error);
        set({ isBinHydrated: true });
      }
    } catch (err) {
      console.error('[hydrate] list-deleted-meetings failed:', err);
      set({ isBinHydrated: true });
    }
  },
  restoreMeeting: (id) => {
    set((state) => {
      const target = state.deletedMeetings.find((meeting) => meeting.id === id);
      if (!target) return {};
      const { deletedAt: _deletedAt, ...restored } = target;

      // Re-insert in newest-first order by createdAt (matching the DB's own
      // sort in listMeetings()) instead of always prepending — otherwise a
      // restored meeting from days ago would jump to the top of Home ahead
      // of genuinely newer meetings.
      const restoredCreatedAt = restored.createdAt ?? 0;
      const insertIndex = state.meetings.findIndex((m) => (m.createdAt ?? 0) < restoredCreatedAt);
      const nextMeetings =
        insertIndex === -1
          ? [...state.meetings, restored]
          : [...state.meetings.slice(0, insertIndex), restored, ...state.meetings.slice(insertIndex)];

      return {
        deletedMeetings: state.deletedMeetings.filter((meeting) => meeting.id !== id),
        meetings: nextMeetings,
      };
    });
    persistRestoreMeeting(id);
  },
  permanentlyDeleteMeeting: (id) => {
    // Normally called on an entry already in the Bin, but also handles
    // being called directly on a still-active meeting (e.g. RecordingController
    // discarding a meeting record it just created when mic access fails) —
    // removing from both lists keeps this safe either way.
    set((state) => ({
      deletedMeetings: state.deletedMeetings.filter((meeting) => meeting.id !== id),
      meetings: state.meetings.filter((meeting) => meeting.id !== id),
    }));
    persistPermanentlyDeleteMeeting(id);
  },
  appendTranscriptLine: (meetingId, line) => {
    set((state) => ({
      meetings: state.meetings.map((meeting) => {
        if (meeting.id === meetingId) {
          // Prefer the Audio Source Attribution layer's verdict over the
          // raw track label when available — deterministic per
          // AudioSourceAttribution.ts: microphone -> Speaker 1 (You),
          // system output -> Speaker 2 (Other Participant). No inference.
          const rawSpeaker = line.speaker?.trim() || 'Speaker';
          const speakerName =
            line.attributionSpeaker === 'Speaker 2' ? 'Other Participant' :
            line.attributionSpeaker === 'Speaker 1' ? 'You' :
            rawSpeaker === 'You' ? 'You' :
            rawSpeaker === 'Speaker' ? 'Other Participant' :
            rawSpeaker;
          const currentParticipants = meeting.participants && meeting.participants.length > 0 ? meeting.participants : ['You'];
          const nextParticipants = currentParticipants.includes(speakerName)
            ? currentParticipants
            : [...currentParticipants, speakerName];

          return {
            ...meeting,
            transcript: [...meeting.transcript, line],
            participants: nextParticipants,
          };
        }
        return meeting;
      })
    }));
    persistTranscriptLine(meetingId, line);
    const updated = get().meetings.find((m) => m.id === meetingId);
    if (updated) persistMeeting(updated);
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

  updateAdditionalNotes: (meetingId, notes) => {
    set((state) => ({
      meetings: state.meetings.map((m) =>
        m.id === meetingId ? { ...m, additionalNotes: notes } : m
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
  provider: 'Groq',
  setProvider: (provider) => {
    set((state) => {
      const cached = (state.cachedModels[provider] && state.cachedModels[provider].length > 0)
        ? state.cachedModels[provider]
        : (DEFAULT_PROVIDER_MODELS[provider] || []);
      const chosenModel = cached.includes(state.model) && !state.model.includes('qwen')
        ? state.model
        : (cached[0] || '');

      return {
        provider,
        availableModels: cached,
        model: chosenModel,
        connectionStatus: cached.length > 0 ? 'success' : 'idle'
      };
    });
  },
  model: 'llama-3.3-70b-versatile',
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
  isMicMuted: false,
  setIsMicMuted: (isMicMuted) => set({ isMicMuted }),
  toggleMicMute: () => set((state) => ({ isMicMuted: !state.isMicMuted })),
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
  micDeviceWarning: null,
  setMicDeviceWarning: (micDeviceWarning) => set({ micDeviceWarning }),
  micAudioStatus: 'inactive',
  setMicAudioStatus: (micAudioStatus) => set({ micAudioStatus }),
  systemAudioStatus: 'inactive',
  setSystemAudioStatus: (systemAudioStatus) => set({ systemAudioStatus }),
  micInputLevel: 0,
  setMicInputLevel: (micInputLevel) => set({ micInputLevel }),
  systemOutputLevel: 0,
  setSystemOutputLevel: (systemOutputLevel) => set({ systemOutputLevel }),
  systemAudioCritical: false,
  setSystemAudioCritical: (systemAudioCritical) => set({ systemAudioCritical }),
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
  clearDismissedMeeting: (meetingId) => set((state) => {
    if (!state.dismissedMeetingIds.has(meetingId)) return {};
    const next = new Set(state.dismissedMeetingIds);
    next.delete(meetingId);
    return { dismissedMeetingIds: next };
  }),
  isMeetingNotificationVisible: false,
  setMeetingNotificationVisible: (isMeetingNotificationVisible) => set({ isMeetingNotificationVisible })
}));
