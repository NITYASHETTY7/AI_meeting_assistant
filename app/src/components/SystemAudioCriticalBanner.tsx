import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/**
 * SystemAudioCriticalBanner
 *
 * Per the deterministic two-source attribution architecture: microphone →
 * Speaker 1, system output → Speaker 2, always. If system/loopback audio
 * capture is unavailable, the app must NOT pretend two-speaker attribution
 * is working — every utterance would only ever arrive via the microphone,
 * which means only Speaker 1 can ever be produced regardless of who is
 * actually talking. This banner makes that failure visible and explicit
 * rather than letting the transcript silently look like a normal
 * two-speaker conversation when it structurally cannot be one.
 *
 * Shown only while actively recording/paused and only once system-audio
 * capture has been CONFIRMED unavailable (not during the initial
 * acquisition/retry window, which would otherwise flash a false alarm on
 * every recording for the few seconds it takes to establish the stream).
 */
export const SystemAudioCriticalBanner = () => {
  const systemAudioCritical = useAppStore((state) => state.systemAudioCritical);
  const recordingStatus = useAppStore((state) => state.recordingStatus);

  const isRecordingOrPaused = recordingStatus === 'recording' || recordingStatus === 'paused';
  if (!systemAudioCritical || !isRecordingOrPaused) return null;

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium select-none"
      style={{
        background: 'rgba(239, 68, 68, 0.12)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.35)',
        color: '#EF4444',
      }}
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        System audio capture unavailable. Two-speaker attribution cannot be guaranteed.
      </span>
    </div>
  );
};
