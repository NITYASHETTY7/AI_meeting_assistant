import type { ReactNode } from 'react';

interface ContentLayoutProps {
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  fullHeight?: boolean;
}

export const ContentLayout = ({
  title,
  description,
  headerActions,
  children,
  fullHeight = false,
}: ContentLayoutProps) => {
  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 sm:px-5 md:px-7 py-4 md:py-5 select-none shrink-0 flex-wrap gap-2"
        style={{
          background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <h1
            className="text-base sm:text-lg font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h1>
          {description && (
            <p
              className="mt-0.5 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {description}
            </p>
          )}
        </div>
        {headerActions && (
          <div className="flex items-center gap-2 shrink-0">{headerActions}</div>
        )}
      </header>

      {/* Content */}
      <main
        className={`flex-1 ${fullHeight ? 'overflow-hidden' : 'overflow-y-auto'} p-4 sm:p-5 md:p-7`}
      >
        <div
          className={`max-w-5xl mx-auto h-full ${fullHeight ? 'flex flex-col min-h-0' : ''}`}
        >
          {children}
        </div>
      </main>
    </div>
  );
};
