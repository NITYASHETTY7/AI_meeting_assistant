import type { ReactNode } from 'react';

interface SettingsCardProps {
  children: ReactNode;
}

export const SettingsCard = ({ children }: SettingsCardProps) => {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  );
};
