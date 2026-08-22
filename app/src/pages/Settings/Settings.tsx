import { useState, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { ContentLayout } from '../../components/ContentLayout';
import { SettingsLayout, type SettingsTab } from '../../components/SettingsLayout';
import { SettingsSection } from '../../components/SettingsSection';
import { ProviderQuickSelect } from '../../components/ProviderQuickSelect';
import { SettingsCard } from '../../components/SettingsCard';
import { SettingsRow } from '../../components/SettingsRow';
import { ApiKeyInput } from '../../components/ApiKeyInput';
import { ThemeSelector } from '../../components/ThemeSelector';
import { ToggleRow } from '../../components/ToggleRow';
import { DropdownRow } from '../../components/DropdownRow';
import { ActionButton } from '../../components/ActionButton';
import { useAppStore, DEFAULT_PROVIDER_MODELS } from '../../store/useAppStore';
import { ProviderManager } from '../../services/ai/ProviderManager';
import { POST_RECORDING_ONLY_PROVIDERS } from '../../services/transcription/TranscriptionManager';

export const Settings = () => {
  const store = useAppStore();
  
  // Connection Test States (synchronized with store status)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'failed'>(store.connectionStatus);
  const [testErrorMessage, setTestErrorMessage] = useState('');
  /**
   * Explains what a successful connection actually gets the user for THIS
   * provider — e.g. AssemblyAI/Deepgram authenticate fine but have no chat
   * model at all, and Gemini/AssemblyAI/Deepgram only produce a transcript
   * after the recording stops, not live. A bare "Connection Succeeded!" is
   * technically true for all of these but misleads the user into expecting
   * capabilities (a chat tab, a live transcript) the provider doesn't have.
   */
  const [testCapabilityMessage, setTestCapabilityMessage] = useState('');

  // Sync testState with store on switch
  useEffect(() => {
    setTestState(store.connectionStatus);
    setTestErrorMessage('');
    setTestCapabilityMessage('');
  }, [store.provider]);

  // ── Startup / provider-switch credential check ─────────────────────────────
  // Silently checks the OS credential store whenever the active provider changes.
  // If a key exists, marks the provider as saved and loads the key into the
  // in-memory apiKeys map so the AI provider can use it this session.
  useEffect(() => {
    const checkCredential = async () => {
      const api = window.electronAPI;
      if (!api?.hasCredential) return;

      try {
        const { ok, exists } = await api.hasCredential(store.provider);
        if (!ok) return;

        if (exists) {
          store.markProviderKeySaved(store.provider);

          // Load the actual key into memory for the active session so the AI
          // provider can authenticate. The key is never displayed.
          const loadResult = await api.loadCredential?.(store.provider);
          if (loadResult?.ok && loadResult.secret) {
            store.setApiKeyForProvider(store.provider, loadResult.secret);
          }
        } else {
          // Key was deleted externally (e.g. Credential Manager UI) — clear mark
          store.clearProviderKeySaved(store.provider);
        }
      } catch {
        // IPC not available (browser dev mode) — no-op
      }
    };

    checkCredential();
  }, [store.provider]);

  // ── Storage paths: real, fetched from main process ──────────────────────────
  const [storagePaths, setStoragePaths] = useState<{ databasePath: string; recordingsPath: string } | null>(null);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const [folderChangeMessage, setFolderChangeMessage] = useState('');

  const refreshStoragePaths = async () => {
    const api = window.electronAPI;
    if (!api?.getStoragePaths) return;
    const result = await api.getStoragePaths();
    if (result.ok) {
      setStoragePaths({ databasePath: result.databasePath, recordingsPath: result.recordingsPath });
    }
  };

  useEffect(() => {
    void refreshStoragePaths();
  }, []);

  // ── Audio retention: real storage scan ──────────────────────────────────────
  const [audioStorageInfo, setAudioStorageInfo] = useState<{ fileCount: number; totalBytes: number } | null>(null);
  const [isClearingAudio, setIsClearingAudio] = useState(false);
  const [clearAudioMessage, setClearAudioMessage] = useState('');

  const refreshAudioStorageInfo = async () => {
    const api = window.electronAPI;
    if (!api?.getAudioStorageInfo) return;
    const result = await api.getAudioStorageInfo();
    if (result.ok) {
      setAudioStorageInfo({ fileCount: result.fileCount, totalBytes: result.totalBytes });
    }
  };

  useEffect(() => {
    void refreshAudioStorageInfo();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleClearAllAudio = async () => {
    const api = window.electronAPI;
    if (!api?.clearAllAudio) return;
    setIsClearingAudio(true);
    setClearAudioMessage('');
    try {
      const result = await api.clearAllAudio();
      if (result.ok) {
        setClearAudioMessage(`Deleted ${result.deletedCount} audio file(s).`);
        await refreshAudioStorageInfo();
      } else {
        setClearAudioMessage(result.error || 'Failed to clear audio files.');
      }
    } finally {
      setIsClearingAudio(false);
      setTimeout(() => setClearAudioMessage(''), 4000);
    }
  };

  /**
   * Builds a short capability-explainer shown right after a successful
   * connection test, so the user isn't left assuming a provider does more
   * (or less) than it actually does:
   *   - STT-only providers with no chat model at all (AssemblyAI, Deepgram)
   *     — clarify summaries/chat won't work with this provider alone.
   *   - Post-recording-only STT providers (AssemblyAI, Deepgram, Gemini)
   *     — clarify the transcript appears after recording stops, not live.
   *   - Chat-only providers with no transcription (Anthropic, AWS Bedrock,
   *     Azure OpenAI, Ollama, OpenRouter, Custom OpenAI-Compatible)
   *     — clarify recording continues but without a live/auto transcript.
   */
  const buildCapabilityMessage = (
    providerName: string,
    capabilities: { chat: boolean; speech_to_text: boolean }
  ): string => {
    const isPostRecordingOnly = POST_RECORDING_ONLY_PROVIDERS.includes(providerName);

    if (capabilities.speech_to_text && !capabilities.chat) {
      return isPostRecordingOnly
        ? `${providerName} is speech-to-text only — it doesn't provide AI capabilities like summaries or chat. Your transcript will appear once you stop recording, not live.`
        : `${providerName} is speech-to-text only — it doesn't provide AI capabilities like summaries or chat.`;
    }

    if (capabilities.speech_to_text && capabilities.chat && isPostRecordingOnly) {
      return `${providerName} transcribes after recording stops, not live — your transcript will appear once you end the meeting.`;
    }

    if (!capabilities.speech_to_text && capabilities.chat) {
      return `${providerName} has no speech-to-text — recording won't produce a transcript, live or after stopping. ` +
        `Type notes manually during the meeting, and ${providerName} can still summarize those notes and extract action items. ` +
        `You can also use it for general AI chat unrelated to any meeting.`;
    }

    return '';
  };

  const handleTestConnection = async () => {
    setTestState('testing');
    setTestErrorMessage('');
    store.setConnectionStatus('testing');

    try {
      const activeProvider = ProviderManager.getActiveProvider();
      const result = await activeProvider.authenticate();
      if (result.success) {
        setTestState('success');
        store.setConnectionStatus('success');
        store.setAvailableModels(result.models);
        store.setModel(result.defaultModel);
        // Cache the models dynamically in Zustand store
        store.setCachedModelsForProvider(store.provider, result.models);
        store.setCapabilities(result.capabilities);
        setTestCapabilityMessage(buildCapabilityMessage(store.provider, result.capabilities));
      } else {
        setTestState('failed');
        setTestErrorMessage(result.message);
        setTestCapabilityMessage('');
        store.setConnectionStatus('failed');
        store.setAvailableModels([]);
        store.setModel('');
      }
    } catch (err: any) {
      setTestState('failed');
      setTestErrorMessage(err?.message || 'Verification aborted.');
      setTestCapabilityMessage('');
      store.setConnectionStatus('failed');
      store.setAvailableModels([]);
      store.setModel('');
    }
  };

  const handleOpenFolder = async () => {
    const api = window.electronAPI;
    if (!api?.openRecordingsFolder) return;
    const result = await api.openRecordingsFolder();
    if (!result.ok) {
      setFolderChangeMessage(result.error || 'Failed to open folder.');
      setTimeout(() => setFolderChangeMessage(''), 4000);
    }
  };

  const handleChangeRecLocation = async () => {
    const api = window.electronAPI;
    if (!api?.changeRecordingsFolder) return;
    setIsChangingFolder(true);
    setFolderChangeMessage('');
    try {
      const result = await api.changeRecordingsFolder();
      if (result.ok && result.path) {
        setFolderChangeMessage('Recordings folder updated.');
        await refreshStoragePaths();
      } else if (!result.canceled) {
        setFolderChangeMessage(result.error || 'Failed to change folder.');
      }
    } finally {
      setIsChangingFolder(false);
      setTimeout(() => setFolderChangeMessage(''), 4000);
    }
  };

  return (
    <ContentLayout
      title="Settings"
      description="Configure preferences, system defaults, and external LLM keys."
    >
      <SettingsLayout>
        {(activeTab: SettingsTab) => {
          switch (activeTab) {
            case 'model':
              return (
                <SettingsSection
                  title="Large Language Model Provider"
                  description="Mirai Granola processes transcript files using standard cloud platform adapters or custom API wrappers."
                >
                  <SettingsCard>
                    <ProviderQuickSelect value={store.provider} onChange={store.setProvider} />

                    {/* Provider Selection */}
                    <DropdownRow
                      label="AI Provider"
                      description="Choose the Large Language Model provider to handle meeting summaries."
                      value={store.provider}
                      onChange={store.setProvider}
                      options={ProviderManager.getSupportedProviders().map((p) => ({
                        value: p,
                        label: p,
                      }))}
                    />

                    {/* Model Selection (hidden for AssemblyAI since it only transcribes) */}
                    {store.provider !== 'AssemblyAI' && (() => {
                      const validCachedModels = store.availableModels.filter(
                        (m) => store.provider !== 'Groq' || (!m.includes('qwen') && !m.includes('gpt-'))
                      );
                      const activeModels = validCachedModels.length > 0
                        ? validCachedModels
                        : (DEFAULT_PROVIDER_MODELS[store.provider] || ['llama-3.3-70b-versatile']);
                      
                      const selectedModel = activeModels.includes(store.model)
                        ? store.model
                        : activeModels[0];

                      return (
                        <DropdownRow
                          label="Default Model"
                          description="Select the default model for summarization and action items."
                          value={selectedModel}
                          onChange={store.setModel}
                          options={activeModels.map((m) => ({
                            value: m,
                            label: m,
                          }))}
                          disabled={false}
                        />
                      );
                    })()}

                    {/* Conditional API Key Input */}
                    {(store.provider === 'OpenAI' ||
                      store.provider === 'Azure OpenAI' ||
                      store.provider === 'Anthropic' ||
                      store.provider === 'Gemini' ||
                      store.provider === 'Groq' ||
                      store.provider === 'AssemblyAI' ||
                      store.provider === 'Deepgram' ||
                      store.provider === 'OpenRouter' ||
                      store.provider === 'Custom OpenAI-Compatible') && (
                      <ApiKeyInput provider={store.provider} />
                    )}

                    {/* Conditional Base URL Input */}
                    {(store.provider === 'OpenRouter' ||
                      store.provider === 'Ollama' ||
                      store.provider === 'Custom OpenAI-Compatible') && (
                      <SettingsRow
                        label="Base URL"
                        description={`The custom URL endpoint location for ${store.provider} API requests.`}
                        control={
                          <input
                            type="text"
                            value={store.baseUrls[store.provider] || ''}
                            onChange={(e) => store.setBaseUrlForProvider(store.provider, e.target.value)}
                            className="mg-input font-mono" style={{ minWidth: '240px' }}
                          />
                        }
                      />
                    )}

                    {/* Conditional AWS Bedrock configuration fields */}
                    {store.provider === 'AWS Bedrock' && (
                      <>
                        <SettingsRow
                          label="AWS Access Key ID"
                          description="Your AWS Access Key Identifier credentials."
                          control={
                            <input
                              type="text"
                              value={store.awsAccessKeyId}
                              onChange={(e) => store.setAwsAccessKeyId(e.target.value)}
                              placeholder="AKIAIOSFODNN7EXAMPLE"
                              className="mg-input font-mono" style={{ minWidth: '240px' }}
                            />
                          }
                        />
                        <SettingsRow
                          label="AWS Secret Access Key"
                          description="Your AWS Secret Access Key credentials."
                          control={
                            <input
                              type="password"
                              value={store.awsSecretAccessKey}
                              onChange={(e) => store.setAwsSecretAccessKey(e.target.value)}
                              placeholder="••••••••••••••••••••••••••••••••••••••••"
                              className="mg-input font-mono" style={{ minWidth: '240px' }}
                            />
                          }
                        />
                        <SettingsRow
                          label="AWS Region"
                          description="The region location where your Bedrock model is active."
                          control={
                            <input
                              type="text"
                              value={store.awsRegion}
                              onChange={(e) => store.setAwsRegion(e.target.value)}
                              placeholder="us-east-1"
                              className="mg-input font-mono" style={{ minWidth: '240px' }}
                            />
                          }
                        />
                      </>
                    )}

                    {/* Conditional Azure OpenAI configuration fields */}
                    {store.provider === 'Azure OpenAI' && (
                      <>
                        <SettingsRow
                          label="Azure Endpoint URL"
                          description="The Endpoint URL location of your Azure OpenAI resource group."
                          control={
                            <input
                              type="text"
                              value={store.azureEndpoint}
                              onChange={(e) => store.setAzureEndpoint(e.target.value)}
                              placeholder="https://your-resource.openai.azure.com/"
                              className="mg-input font-mono" style={{ minWidth: '240px' }}
                            />
                          }
                        />
                        <SettingsRow
                          label="Deployment Name"
                          description="The custom deployment name tags of your Azure OpenAI model."
                          control={
                            <input
                              type="text"
                              value={store.azureDeploymentName}
                              onChange={(e) => store.setAzureDeploymentName(e.target.value)}
                              placeholder="gpt-4o-deployment"
                              className="mg-input font-mono" style={{ minWidth: '240px' }}
                            />
                          }
                        />
                        <SettingsRow
                          label="API Version"
                          description="The API query version parameter for Azure endpoints requests."
                          control={
                            <input
                              type="text"
                              value={store.azureApiVersion}
                              onChange={(e) => store.setAzureApiVersion(e.target.value)}
                              placeholder="2024-02-15-preview"
                              className="mg-input font-mono" style={{ minWidth: '240px' }}
                            />
                          }
                        />
                      </>
                    )}
                  </SettingsCard>

                  {/* Test Connection panel */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-zinc-50 dark:bg-zinc-900/10 border border-zinc-200 dark:border-zinc-900 rounded-xl mt-4">
                    <div className="space-y-0.5 select-none flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Validate Setup Connection</h4>
                      <p className="text-[11px] text-zinc-500 leading-normal">
                        Test connection status with {store.provider} to verify if your credential configuration works.
                      </p>
                      {testState === 'failed' && testErrorMessage && (
                        <p className="text-[10px] text-sky-400 dark:text-sky-300 mt-1.5 leading-normal flex items-start gap-1 font-semibold">
                          <X className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Error: {testErrorMessage}
                        </p>
                      )}
                      {testState === 'success' && testCapabilityMessage && (
                        <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-1.5 leading-normal flex items-start gap-1 font-semibold">
                          <span className="mt-0.5 shrink-0">ⓘ</span> {testCapabilityMessage}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {testState === 'testing' && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1.5 font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Authenticating...
                        </span>
                      )}
                      {testState === 'success' && (
                        <span className="text-xs text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5 font-bold">
                          <Check className="w-4 h-4" /> Connection Succeeded!
                        </span>
                      )}
                      {testState === 'failed' && (
                        <span className="text-xs text-sky-400 dark:text-sky-300 flex items-center gap-1.5 font-bold">
                          <X className="w-4 h-4" /> Connection Failed
                        </span>
                      )}

                      <ActionButton
                        variant="primary"
                        onClick={handleTestConnection}
                        disabled={testState === 'testing'}
                      >
                        Test Connection
                      </ActionButton>
                    </div>
                  </div>
                </SettingsSection>
              );

            case 'appearance':
              return (
                <SettingsSection
                  title="App Theme Options"
                  description="Choose how Mirai Granola should look on your desktop environment."
                >
                  <SettingsCard>
                    <ThemeSelector
                      value={store.theme}
                      onChange={store.setTheme}
                    />
                  </SettingsCard>
                </SettingsSection>
              );

            case 'notifications':
              return (
                <SettingsSection
                  title="Notifications"
                  description="Control which notifications Mirai Granola can show."
                >
                  <SettingsCard>
                    <ToggleRow
                      label="Disable all notifications"
                      description="Silence everything, including meeting detection and reminders."
                      checked={store.notificationsDisabled}
                      onChange={store.setNotificationsDisabled}
                    />
                  </SettingsCard>

                  <SettingsCard>
                    <ToggleRow
                      label="Meeting detection"
                      description="Notify when a meeting is detected so you can start recording. Shows both an in-app banner and a Windows notification."
                      checked={store.meetingDetectionNotifications && !store.notificationsDisabled}
                      onChange={store.setMeetingDetectionNotifications}
                    />
                    <ToggleRow
                      label="Calendar reminders"
                      description="Notify when a scheduled meeting is about to start. Requires calendar integration, which is not yet available — this preference is saved for when it is."
                      checked={store.calendarReminderNotifications && !store.notificationsDisabled}
                      onChange={store.setCalendarReminderNotifications}
                    />
                  </SettingsCard>
                </SettingsSection>
              );

            case 'language':
              return (
                <SettingsSection
                  title="Language"
                  description="Set interface and transcription languages independently."
                >
                  <SettingsCard>
                    <DropdownRow
                      label="Interface language"
                      description="Sets the stored preference for the language used throughout Mirai Granola's interface. Note: the interface is currently English-only — this preference does not yet translate the UI."
                      value={store.interfaceLanguage}
                      onChange={store.setInterfaceLanguage}
                      options={[
                        { value: 'en', label: 'English' },
                        { value: 'es', label: 'Spanish' },
                        { value: 'fr', label: 'French' },
                        { value: 'de', label: 'German' },
                        { value: 'hi', label: 'Hindi' },
                        { value: 'zh', label: 'Chinese' },
                        { value: 'ja', label: 'Japanese' },
                        { value: 'pt', label: 'Portuguese' },
                      ]}
                    />
                    <DropdownRow
                      label="Transcription language"
                      description="Choose the language you speak for more accurate transcription. Sent as a hint to Whisper-based providers (OpenAI, Groq) — auto-detect works well for most cases."
                      value={store.transcriptionLanguage}
                      onChange={store.setTranscriptionLanguage}
                      options={[
                        { value: 'auto', label: 'Auto-detect' },
                        { value: 'en', label: 'English' },
                        { value: 'es', label: 'Spanish' },
                        { value: 'fr', label: 'French' },
                        { value: 'de', label: 'German' },
                        { value: 'hi', label: 'Hindi' },
                        { value: 'zh', label: 'Chinese' },
                        { value: 'ja', label: 'Japanese' },
                        { value: 'ko', label: 'Korean' },
                        { value: 'pt', label: 'Portuguese' },
                        { value: 'ru', label: 'Russian' },
                        { value: 'ar', label: 'Arabic' },
                      ]}
                    />
                  </SettingsCard>
                </SettingsSection>
              );

            case 'recording':
              return (
                <SettingsSection
                  title="Recording Device Preferences"
                  description="Define recording qualities, sample rates, and select input microphone feeds."
                >
                  <SettingsCard>
                    <DropdownRow
                      label="Input Microphone"
                      description="Choose the recording hardware mic for voice transcripts capture."
                      value={store.micDevice}
                      onChange={store.setMicDevice}
                      options={[
                        { value: 'default-mic', label: 'System Default Input' },
                        { value: 'macbook-mic', label: 'Internal Array Mic' },
                        { value: 'external-usb', label: 'Yeti Stereo USB Microphone' }
                      ]}
                    />
                    <ToggleRow
                      label="System Audio Capture"
                      description="Allow recording internal app sound feeds simultaneously."
                      checked={store.systemAudio}
                      onChange={store.setSystemAudio}
                    />
                    <DropdownRow
                      label="Sample Rate (Hz)"
                      description="Default sampling rates frequency in Hertz for recording files."
                      value={store.sampleRate}
                      onChange={store.setSampleRate}
                      options={[
                        { value: '44100', label: '44.1 kHz (CD Quality)' },
                        { value: '48000', label: '48.0 kHz (Studio Standard)' }
                      ]}
                    />
                    <DropdownRow
                      label="Compression Quality"
                      description="Specify audio output format sizes and quality properties."
                      value={store.quality}
                      onChange={store.setQuality}
                      options={[
                        { value: 'high', label: 'High (320kbps MP3)' },
                        { value: 'medium', label: 'Medium (192kbps MP3)' },
                        { value: 'low', label: 'Low (128kbps MP3)' }
                      ]}
                    />
                  </SettingsCard>
                </SettingsSection>
              );

            case 'storage':
              return (
                <SettingsSection
                  title="Local Database & Path Storage"
                  description="Configure paths where summaries index database and audio archives are saved."
                >
                  {folderChangeMessage && (
                    <div
                      className="p-3 text-xs rounded-lg select-none"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {folderChangeMessage}
                    </div>
                  )}

                  <SettingsCard>
                    <SettingsRow
                      label="Database File"
                      description="Current path to the local SQLite database file, on this device."
                      control={
                        <code
                          className="text-[10px] font-mono px-2 py-1 rounded"
                          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}
                        >
                          {storagePaths?.databasePath || 'Loading…'}
                        </code>
                      }
                    />
                    <SettingsRow
                      label="Audio Recordings Folder"
                      description="Destination folder where captured audio recordings are saved. Changing this moves all existing recordings to the new location."
                      control={
                        <div className="flex items-center gap-2">
                          <code
                            className="text-[10px] font-mono px-2 py-1 rounded max-w-[220px] truncate"
                            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}
                            title={storagePaths?.recordingsPath}
                          >
                            {storagePaths?.recordingsPath || 'Loading…'}
                          </code>
                          <div className="flex gap-1.5">
                            <ActionButton variant="outline" onClick={handleOpenFolder}>
                              Open Folder
                            </ActionButton>
                            <ActionButton variant="outline" onClick={handleChangeRecLocation} disabled={isChangingFolder}>
                              {isChangingFolder ? 'Moving…' : 'Change'}
                            </ActionButton>
                          </div>
                        </div>
                      }
                    />
                  </SettingsCard>

                  {/* ── Audio Retention ── */}
                  <SettingsSection
                    title="Audio Retention"
                    description="Store audio recordings locally for re-transcription and download. Files are automatically deleted after the retention period."
                  >
                    <SettingsCard>
                      <DropdownRow
                        label="Retention Period"
                        description="Recordings older than this are deleted automatically the next time the app starts."
                        value={String(store.audioRetentionDays)}
                        onChange={(v) => store.setAudioRetentionDays(Number(v))}
                        options={[
                          { value: '7', label: '7 days' },
                          { value: '30', label: '30 days' },
                          { value: '90', label: '90 days' },
                          { value: '-1', label: 'Keep forever' },
                        ]}
                      />
                      <SettingsRow
                        label="Storage Usage"
                        description={
                          audioStorageInfo
                            ? `${audioStorageInfo.fileCount} file(s), ${formatBytes(audioStorageInfo.totalBytes)}`
                            : 'Scanning…'
                        }
                        control={
                          <div className="flex items-center gap-2">
                            {clearAudioMessage && (
                              <span className="text-[11px] font-semibold" style={{ color: 'var(--success)' }}>
                                {clearAudioMessage}
                              </span>
                            )}
                            <ActionButton
                              variant="outline"
                              onClick={handleClearAllAudio}
                              disabled={isClearingAudio || !audioStorageInfo?.fileCount}
                            >
                              {isClearingAudio ? 'Clearing…' : 'Clear All Audio'}
                            </ActionButton>
                          </div>
                        }
                      />
                    </SettingsCard>
                  </SettingsSection>
                </SettingsSection>
              );

            case 'about':
              return (
                <SettingsSection
                  title="About Mirai Granola"
                  description="Application metadata."
                >
                  <SettingsCard>
                    <SettingsRow
                      label="Application Name"
                      control={<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Mirai Granola</span>}
                    />
                    <SettingsRow
                      label="Build Version"
                      control={<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">v1.0.0-alpha.1</span>}
                    />
                  </SettingsCard>
                </SettingsSection>
              );

            default:
              return null;
          }
        }}
      </SettingsLayout>
    </ContentLayout>
  );
};
export default Settings;
