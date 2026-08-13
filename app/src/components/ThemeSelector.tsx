import { Sun, Moon, Laptop } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import type { AppTheme } from '../store/useAppStore';

interface ThemeSelectorProps {
  value: AppTheme;
  onChange: (value: AppTheme) => void;
}

/**
 * ThemeSelector
 *
 * Segmented control for switching between Light, Dark, and System themes.
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const ThemeSelector = ({ value, onChange }: ThemeSelectorProps) => {
  const options: { id: AppTheme; label: string; icon: typeof Sun }[] = [
    { id: 'light',  label: 'Light',  icon: Sun    },
    { id: 'dark',   label: 'Dark',   icon: Moon   },
    { id: 'system', label: 'System', icon: Laptop },
  ];

  return (
    <SettingsRow
      label="Interface Theme"
      description="Select how Mirai Granola appears. Choose light, dark, or system-matching theme."
      control={
        <div
          className="flex rounded-lg p-1 select-none w-[260px]"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
          }}
        >
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = value === opt.id;

            return (
              <button
                key={opt.id}
                onClick={() => onChange(opt.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 cursor-pointer"
                style={{
                  background: active ? 'var(--bg-card)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  border: active ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      }
    />
  );
};
