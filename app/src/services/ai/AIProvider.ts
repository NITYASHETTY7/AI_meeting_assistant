export interface ProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  
  // AWS Bedrock Parameters
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;

  // Azure OpenAI Parameters
  azureEndpoint?: string;
  azureDeploymentName?: string;
  azureApiVersion?: string;
}

export interface AuthenticationResult {
  success: boolean;
  message: string;
  providerInfo: {
    name: string;
    version?: string;
  };
  models: string[];
  defaultModel: string;
  capabilities: {
    chat: boolean;
    speech_to_text: boolean;
    audio_generation: boolean;
    realtime: boolean;
    vision: boolean;
    embeddings: boolean;
    function_calling: boolean;
  };
}

/**
 * Which physical audio track a live-transcription chunk came from:
 *  - 'You': the mic track.
 *  - 'Speaker': the system/desktop-loopback track — the other participant's
 *    audio, captured directly rather than inferred.
 */
export type SpeakerTrack = 'You' | 'Speaker';

export interface TranscriptEvent {
  text: string;
  speaker: string;
  timestamp: string; // Wall-clock time or relative
  isPartial: boolean;
  confidence?: number;
  segmentId: string;
  sequenceId: number;
  audioStartTime: number;
  audioEndTime: number;
}

export interface LiveTranscriptionOptions {
  onTranscriptUpdate: (event: TranscriptEvent) => void;
  onError: (error: any) => void;
}

/** A single speaker-labeled speech segment, e.g. from AssemblyAI's native diarization. */
export interface DiarizedUtterance {
  /** Speaker label assigned by the provider, e.g. "A", "B", "C" */
  speaker: string;
  text: string;
  /** Start time in milliseconds relative to the audio */
  start: number;
  /** End time in milliseconds relative to the audio */
  end: number;
  /**
   * Provider-reported confidence for this utterance (0-1), when available.
   * AssemblyAI/Deepgram return real per-word confidence which is averaged
   * per utterance; Gemini's self-reported low/medium/high is mapped to a
   * numeric value. Omitted when a provider has no such signal at all.
   */
  confidence?: number;
}

export interface AIProvider {
  initialize(config: ProviderConfig): void;
  authenticate(): Promise<AuthenticationResult>;
  speechToText(audioData: unknown): Promise<string>;
  generateSummary(transcript: string): Promise<string>;
  generateMeetingTitle(transcript: string): Promise<string>;
  extractActionItems(transcript: string): Promise<string[]>;
  extractDecisions(transcript: string): Promise<string[]>;
  extractFollowUps(transcript: string): Promise<string[]>;
  chat(messages: unknown[]): Promise<string>;
  transcribeAudio(audioFile: unknown): Promise<string>;

  // Real-time Streaming APIs
  startLiveTranscription(options: LiveTranscriptionOptions): Promise<void>;
  stopLiveTranscription(): Promise<void>;
  transcribeAudioChunk(chunk: Float32Array, speakerTrack?: SpeakerTrack): Promise<void>;
  transcribeAudioFile(audioFile: unknown): Promise<string>;

  /**
   * Optional: returns speaker-labeled utterances from the most recently
   * completed transcription, for providers with native diarization support
   * (currently AssemblyAI). Providers without diarization support omit this
   * method entirely — callers must feature-detect with `?.`.
   */
  getLastUtterances?(): DiarizedUtterance[];
}
