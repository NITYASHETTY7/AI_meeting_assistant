import { SettingsRow } from './SettingsRow';

interface ProviderSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * ProviderSelector
 *
 * Dropdown for choosing the active AI provider.
 * Uses mg-input for consistent styling with the design system.
 */
export const ProviderSelector = ({ value, onChange }: ProviderSelectorProps) => {
  return (
    <SettingsRow
      label="Model Provider"
      description="Choose the Large Language Model provider to generate note summaries."
      control={
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mg-input"
          style={{ minWidth: '180px', cursor: 'pointer' }}
        >
          <option value="OpenAI">OpenAI (GPT-4o / GPT-4o-mini)</option>
        </select>
      }
    />
  );
};
