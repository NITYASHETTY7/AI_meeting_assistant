export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecordingState {
  status: RecordingStatus;
  duration: number; // in seconds
  filePath: string | null;
}
