import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export const SettingsSection = ({ title, description, children }: SettingsSectionProps) => {
  return (
    <div className="space-y-3 select-none">
      <div>
        <h3 className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {description && (
          <p className="text-xs mt-1 leading-normal" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
};
