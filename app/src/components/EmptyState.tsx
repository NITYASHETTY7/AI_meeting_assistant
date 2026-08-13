import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <div
      className="flex flex-col items-center justify-center p-10 text-center rounded-xl select-none"
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px dashed var(--border-strong)',
      }}
    >
      <div
        className="flex items-center justify-center w-12 h-12 mb-4 rounded-xl"
        style={{
          background: 'var(--bg-hover)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}
      >
        {icon}
      </div>
      <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h4>
      <p className="max-w-xs text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
