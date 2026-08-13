import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
}

export const SectionHeader = ({ title, action }: SectionHeaderProps) => {
  return (
    <div className="flex items-center justify-between mb-1">
      <h3
        className="text-[10px] font-bold uppercase tracking-widest select-none"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      {action && <div className="flex items-center">{action}</div>}
    </div>
  );
};
