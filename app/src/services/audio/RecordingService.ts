export interface RecordingService {
  startRecording(stream: MediaStream): void;
  stopRecording(): Promise<Blob>;
  pauseRecording(): void;
  resumeRecording(): void;
}
