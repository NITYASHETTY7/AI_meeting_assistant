import { SettingsRow } from './SettingsRow';

interface DropdownRowProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

export const DropdownRow = ({
  label,
  description,
  value,
  onChange,
  options,
  disabled = false,
}: DropdownRowProps) => {
  return (
    <SettingsRow
      label={label}
      description={description}
      control={
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mg-input min-w-[180px] max-w-[240px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      }
    />
  );
};
