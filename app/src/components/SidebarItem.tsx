import type { ReactNode, CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  /** When true renders icon-only with a hover tooltip */
  collapsed?: boolean;
}

/**
 * SidebarItem
 *
 * Navigation link used in the sidebar.
 *
 * Expanded mode:
 *   - Icon + label side by side
 *   - Active: left red indicator bar + accent-subtle background
 *   - Hover: very subtle white overlay
 *
 * Collapsed mode (collapsed=true):
 *   - Icon only, centred
 *   - Tooltip with label appears to the right on hover
 *   - Active indicator is a 2px left border only
 *
 * All colours use semantic CSS variables.
 */
export const SidebarItem = ({ to, icon, label, badge, collapsed = false }: SidebarItemProps) => {
  if (collapsed) {
    return (
      <div className="relative group mb-0.5">
        <NavLink
          to={to}
          className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg transition-all duration-150"
          style={({ isActive }): CSSProperties => ({
            background: isActive ? 'var(--accent-subtle)' : 'transparent',
            color: isActive ? 'var(--accent-light)' : 'var(--text-tertiary)',
            border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
            borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          })}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            if (!el.style.background.includes('accent-subtle')) {
              el.style.background = 'rgba(255,255,255,0.06)';
              el.style.color = 'var(--text-primary)';
            }
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            if (!el.style.background.includes('accent-subtle')) {
              el.style.background = 'transparent';
              el.style.color = 'var(--text-tertiary)';
            }
          }}
          title={label}
        >
          <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {icon}
          </span>
        </NavLink>

        {/* Tooltip — appears to the right on hover */}
        <div
          className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {label}
          {badge !== undefined && (
            <span
              className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full font-semibold"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Expanded mode ────────────────────────────────────────────────────────
  return (
    <NavLink
      to={to}
      className="block mb-0.5"
      style={({ isActive }): CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px 8px 11px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: isActive ? 600 : 500,
        textDecoration: 'none',
        transition: 'background 0.15s ease, color 0.15s ease',
        background: isActive ? 'var(--accent-subtle)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
        border: `1px solid ${isActive ? 'var(--accent-border)' : 'transparent'}`,
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        paddingLeft: isActive ? '10px' : '11px',
      })}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!el.style.background.includes('accent-subtle')) {
          el.style.background = 'rgba(255,255,255,0.04)';
          el.style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!el.style.background.includes('accent-subtle')) {
          el.style.background = 'transparent';
          el.style.color = 'var(--text-tertiary)';
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
          {icon}
        </span>
        <span>{label}</span>
      </div>

      {badge !== undefined && (
        <span
          className="px-1.5 py-0.5 text-[10px] rounded-full font-semibold"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );
};
