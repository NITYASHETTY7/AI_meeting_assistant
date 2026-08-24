import { SettingsRow } from './SettingsRow';

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export const ToggleRow = ({ label, description, checked, disabled = false, onChange }: ToggleRowProps) => {
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className={`w-9 h-5 rounded-full relative transition-all duration-200 focus:outline-none ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
          }`}
          style={{
            background: checked ? 'var(--accent)' : 'var(--bg-hover)',
            border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
            boxShadow: checked && !disabled ? '0 0 0 2px var(--accent-subtle)' : 'none',
          }}
          aria-checked={checked}
          role="switch"
        >
          <span
            className="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200"
            style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      }
    />
  );
};
