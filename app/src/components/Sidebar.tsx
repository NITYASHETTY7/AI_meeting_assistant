import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { SidebarItem } from './SidebarItem';

const STORAGE_KEY = 'mirai-sidebar-collapsed';

/**
 * Sidebar
 *
 * Collapsible left navigation panel.
 *
 * Expanded  (240px) — logo + label, nav items with labels, search, New Note text
 * Collapsed (~68px) — icons only, tooltips on hover, "+" icon only for New Note
 *
 * Collapse trigger: click the thunder-bolt logo icon.
 * State persists to localStorage across sessions.
 * Width transition: 220ms ease — smooth, no layout shift.
 */
export const Sidebar = () => {
  const navigate = useNavigate();
  const createMockNote = useAppStore((state) => state.createMockNote);
  const deletedCount = useAppStore((state) => state.deletedMeetings.length);

  // Read persisted state on first render
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Persist whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch { /* ignore */ }
  }, [collapsed]);

  const toggle = () => setCollapsed((v) => !v);

  const handleNewNote = () => {
    createMockNote();
    navigate('/meeting');
  };

  // ── Nav icon SVGs (defined once, reused below) ──────────────────────────
  const homeIcon = (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );

  const chatIcon = (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );

  const settingsIcon = (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const binIcon = (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m2 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10zM10 11v6m4-6v6" />
    </svg>
  );

  return (
    <aside
      className="h-screen flex flex-col select-none shrink-0 overflow-hidden mg-glass-sidebar"
      style={{
        width: collapsed ? '68px' : '240px',
        minWidth: collapsed ? '68px' : '240px',
        transition: 'width 220ms ease, min-width 220ms ease',
      }}
    >
      {/* ── Logo & Brand ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center px-4 py-5 shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          gap: collapsed ? '0' : '12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {/* Logo mark — speech bubble with a voice waveform, representing an
            AI meeting assistant that listens and transcribes. Click to
            toggle collapse. */}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center w-8 h-8 rounded-xl shadow-md shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          style={{ background: 'linear-gradient(135deg, #2898EB 0%, #146CB8 100%)' }}
        >
          <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="none">
            <path
              d="M7.5 6H16.5C18 6 19.2 7.2 19.2 8.7V13.3C19.2 14.8 18 16 16.5 16H9.5L6 19L6.4 16H7.5C6 16 4.8 14.8 4.8 13.3V8.7C4.8 7.2 6 6 7.5 6Z"
              fill="rgba(255, 255, 255, 0.1)"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <line x1="8.5" y1="11" x2="8.5" y2="13.2" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
            <line x1="11" y1="8.6" x2="11" y2="13.6" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
            <line x1="13.5" y1="9.8" x2="13.5" y2="13.2" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
            <line x1="15.8" y1="8.6" x2="15.8" y2="13.6" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </button>

        {/* App name — hidden when collapsed */}
        {!collapsed && (
          <span
            className="font-bold text-sm tracking-tight whitespace-nowrap overflow-hidden"
            style={{
              color: 'var(--text-primary)',
              opacity: collapsed ? 0 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            Mirai Granola
          </span>
        )}
      </div>

      {/* ── New Note button ───────────────────────────────────────────────── */}
      <div className="px-3 py-4 shrink-0">
        {collapsed ? (
          /* Collapsed: icon-only "+" button with tooltip */
          <div className="relative group flex justify-center">
            <button
              onClick={handleNewNote}
              className="flex items-center justify-center w-9 h-9 rounded-xl cursor-pointer transition-colors"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                boxShadow: '0 1px 4px rgba(59,159,216,0.30)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              title="New Note"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
              style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
              New Note
            </div>
          </div>
        ) : (
          <button
            onClick={handleNewNote}
            className="mg-btn mg-btn-primary w-full text-xs font-semibold"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Note
          </button>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        style={{ padding: collapsed ? '4px 6px' : '4px 12px' }}>
        <SidebarItem
          to="/"
          label="Home"
          collapsed={collapsed}
          icon={homeIcon}
        />
        <SidebarItem
          to="/chat"
          label="Chat"
          collapsed={collapsed}
          icon={chatIcon}
        />
        <SidebarItem
          to="/bin"
          label="Bin"
          collapsed={collapsed}
          icon={binIcon}
          badge={deletedCount > 0 ? deletedCount : undefined}
        />
      </nav>

      {/* ── Footer / Settings ────────────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{
          borderTop: '1px solid var(--border)',
          padding: collapsed ? '8px 6px' : '8px 12px',
        }}
      >
        <SidebarItem
          to="/settings"
          label="Settings"
          collapsed={collapsed}
          icon={settingsIcon}
        />
      </div>
    </aside>
  );
};
