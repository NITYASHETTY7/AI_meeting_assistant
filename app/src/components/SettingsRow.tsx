import type { ReactNode } from 'react';

interface SettingsRowProps {
  label: string;
  description?: string;
  control: ReactNode;
}

export const SettingsRow = ({ label, description, control }: SettingsRowProps) => {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4"
      style={{ borderBottom: '1px solid var(--divide)' }}
    >
      <div className="space-y-0.5 max-w-lg select-none">
        <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          {label}
        </h4>
        {description && (
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center">{control}</div>
    </div>
  );
};
