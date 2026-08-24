import { useState } from 'react';
import { Mic, Volume2, ChevronDown, ChevronRight, Activity } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/**
 * AudioSourceDebugPanel
 *
 * Collapsible audio diagnostics panel. Default state is closed to prevent
 * screen clutter and eliminate level-meter render overhead during meetings.
 */
export const AudioSourceDebugPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
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
    <div className="flex items-center gap-3 py-1">
      <span className="flex items-center gap-1.5 w-28 shrink-0 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {icon}
        {label}
      </span>
      <span
        className="text-[10px] font-bold tracking-wide px-1.5 py-0.2 rounded shrink-0"
        style={{
          background: status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
          color: status === 'active' ? '#22C55E' : 'var(--text-muted)',
        }}
      >
        {status === 'active' ? 'ACTIVE' : 'INACTIVE'}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
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
      className="px-3.5 py-2 rounded-xl select-none transition-all"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-cyan-500" />
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
            Audio Channels
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                micAudioStatus === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
            <span className="text-[10px] text-zinc-500 font-medium">Mic</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ml-1 ${
                systemAudioStatus === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
            <span className="text-[10px] text-zinc-500 font-medium">System</span>
          </div>
        </div>
        <div className="flex items-center text-zinc-400 group-hover:text-zinc-200 transition-colors">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="pt-2.5 mt-2 border-t border-zinc-100 dark:border-zinc-800/60 space-y-1">
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
      )}
    </div>
  );
};
