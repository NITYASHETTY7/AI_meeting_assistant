import { useState, type ReactNode } from 'react';
import { Sparkles, Monitor, Disc, HardDrive, Info, Bell, Languages } from 'lucide-react';

export type SettingsTab = 'model' | 'appearance' | 'notifications' | 'language' | 'recording' | 'storage' | 'about';

interface SettingsLayoutProps {
  children: (activeTab: SettingsTab) => ReactNode;
}

/**
 * SettingsLayout
 *
 * Two-column settings layout: left tab navigation, right content panel.
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const SettingsLayout = ({ children }: SettingsLayoutProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('model');

  const navigationItems: { id: SettingsTab; label: string; icon: typeof Sparkles }[] = [
    { id: 'model',         label: 'Model Provider', icon: Sparkles    },
    { id: 'appearance',    label: 'Appearance',     icon: Monitor     },
    { id: 'notifications', label: 'Notifications',  icon: Bell        },
    { id: 'language',      label: 'Language',       icon: Languages   },
    { id: 'recording',     label: 'Recording',      icon: Disc        },
    { id: 'storage',       label: 'Storage',        icon: HardDrive   },
    { id: 'about',         label: 'About',          icon: Info        },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-8 items-start select-none h-full max-w-5xl mx-auto">
      {/* ── Side navigation ── */}
      <aside
        className="w-full md:w-56 shrink-0 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible gap-1 pb-4 md:pb-0 pr-0 md:pr-4"
        style={{
          borderBottom: '1px solid var(--border)',
        }}
      >
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isSelected = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex items-center gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap md:w-full"
              style={{
                background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                color:      isSelected ? 'var(--text-primary)'  : 'var(--text-muted)',
                border:     `1px solid ${isSelected ? 'var(--accent-border)' : 'transparent'}`,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              <Icon
                className="w-4 h-4"
                style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 w-full pb-12">
        <div className="mg-animate-fade space-y-6">
          {children(activeTab)}
        </div>
      </main>
    </div>
  );
};
