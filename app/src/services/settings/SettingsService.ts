export interface Settings {
  aiProvider: 'OpenAI' | 'Gemini' | 'Anthropic' | 'OpenRouter';
  aiApiKey: string;
  transcriptionProvider: 'Deepgram' | 'Whisper';
  transcriptionApiKey: string;
  theme: 'Dark' | 'Light' | 'System';
  recordingQuality: 'High' | 'Medium' | 'Low';
  recordingFolder: string;
  autoSave: boolean;
  language: string;
}

export interface SettingsService {
  getSettings(): Promise<Settings>;
  updateSettings(partialSettings: Partial<Settings>): Promise<void>;
}
