import { Mic, Volume2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/**
 * AudioSourceDebugPanel
 *
 * Per the debugging requirement: before questioning the transcription or
 * diarization output, it must be possible to directly verify that BOTH
 * audio streams actually exist and are producing real signal. This panel
 * shows live status (ACTIVE/INACTIVE) and a level meter for each of the
 * two independent capture sources:
 *
 *   Microphone      → should rise when the local user speaks.
 *   System Output   → should rise when the meeting app plays remote audio,
 *                      regardless of output device (speakers, headphones,
 *                      Bluetooth, etc.) — the source is the same either way.
 *
 * Without headphones, speaking into the microphone can ALSO nudge the
 * System Output meter very slightly in some hardware setups, but that
 * doesn't affect attribution: only which STREAM a chunk arrived on
 * determines its speaker label, never the meter reading. This panel is
 * purely a visibility/debugging aid, not part of the attribution decision
 * itself.
 */
export const AudioSourceDebugPanel = () => {
  const micAudioStatus = useAppStore((state) => state.micAudioStatus);
  const systemAudioStatus = useAppStore((state) => state.systemAudioStatus);
  const micInputLevel = useAppStore((state) => state.micInputLevel);
  const systemOutputLevel = useAppStore((state) => state.systemOutputLevel);
  const recordingStatus = useAppStore((state) => state.recordingStatus);

  const isRecordingOrPaused = recordingStatus === 'recording' || recordingStatus === 'paused';
  if (!isRecordingOrPaused) return null;

  const StatusRow = ({
    icon,
    label,
    status,
    level,
  }: {
    icon: React.ReactNode;
    label: string;
    status: 'active' | 'inactive';
    level: number;
  }) => (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex items-center gap-1.5 w-28 shrink-0 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {icon}
        {label}
      </span>
      <span
        className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0"
        style={{
          background: status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
          color: status === 'active' ? '#22C55E' : 'var(--text-muted)',
        }}
      >
        {status === 'active' ? 'ACTIVE' : 'INACTIVE'}
      </span>
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-hover)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{
            width: `${level}%`,
            background: status === 'active' ? 'var(--accent)' : 'var(--text-disabled)',
          }}
        />
      </div>
    </div>
  );

  return (
    <div
      className="px-4 py-2.5 rounded-xl select-none"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
        Audio Source Debug
      </p>
      <StatusRow
        icon={<Mic className="w-3.5 h-3.5" />}
        label="Microphone"
        status={micAudioStatus}
        level={micInputLevel}
      />
      <StatusRow
        icon={<Volume2 className="w-3.5 h-3.5" />}
        label="System Output"
        status={systemAudioStatus}
        level={systemOutputLevel}
      />
    </div>
  );
};
