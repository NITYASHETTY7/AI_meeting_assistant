export interface TranscriptionProvider {
  initialize(): Promise<void>;
  startStreaming(audioStream: MediaStream, onTranscript: (text: string) => void): Promise<void>;
  stopStreaming(): Promise<void>;
  transcribeFile(filePath: string): Promise<string>;
}
