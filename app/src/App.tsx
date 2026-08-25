import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout, LAST_ROUTE_KEY } from './components/AppLayout';
import { Home } from './pages/Home/Home';
import { Meeting } from './pages/Meeting/Meeting';
import { Settings } from './pages/Settings/Settings';
import { Chat } from './pages/Chat/Chat';
import { Bin } from './pages/Bin/Bin';
import { Onboarding } from './pages/Onboarding/Onboarding';
import { useAppStore } from './store/useAppStore';
import { ProviderManager } from './services/ai/ProviderManager';

function App() {
  const theme = useAppStore((state) => state.theme);
  const markProviderKeySaved = useAppStore((state) => state.markProviderKeySaved);
  const savedKeyProviders = useAppStore((state) => state.savedKeyProviders);
  const provider = useAppStore((state) => state.provider);
  const setProvider = useAppStore((state) => state.setProvider);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [noIpcBypass, setNoIpcBypass] = useState(false);

  const hasAnyKey = savedKeyProviders.size > 0 || noIpcBypass;

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (t: 'dark' | 'light' | 'system') => {
      root.classList.remove('dark', 'light');

      if (t === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(t);
      }
    };

    applyTheme(theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemChange = (e: MediaQueryListEvent) => {
        root.classList.remove('dark', 'light');
        root.classList.add(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }
  }, [theme]);

  // ── Onboarding gate ─────────────────────────────────────────────────────────
  // Checks the OS credential store for ANY saved provider key at startup.
  // If none exists, every route redirects to /onboarding until one is saved.
  //
  // Also auto-selects the active provider: the store defaults to 'OpenAI',
  // but if the user only ever saved a key for e.g. Deepgram or Groq, the app
  // should not stay pointed at OpenAI (which has no key and will just fail
  // every request) — it should use whichever provider actually has a key.
  // Only overrides the default if the currently-selected provider has no
  // saved key itself, so a deliberate choice is never silently replaced.
  useEffect(() => {
    const checkAllProviders = async () => {
      const api = window.electronAPI;
      if (!api?.hasCredential) {
        // No Electron IPC (e.g. plain browser dev) — don't block, treat as satisfied
        setNoIpcBypass(true);
        setOnboardingChecked(true);
        return;
      }
      try {
        const providers = ProviderManager.getSupportedProviders();
        // Sequential, in list order, so "first provider with a saved key"
        // is deterministic — Promise.all would race and give an arbitrary order.
        const foundProviders: string[] = [];
        for (const p of providers) {
          try {
            const { ok, exists } = await api.hasCredential(p);
            if (ok && exists) {
              markProviderKeySaved(p);
              foundProviders.push(p);
            }
          } catch {
            // ignore individual provider check failures
          }
        }

        for (const p of foundProviders) {
          try {
            const loadResult = await api.loadCredential?.(p);
            if (loadResult?.ok && loadResult.secret) {
              useAppStore.getState().setApiKeyForProvider(p, loadResult.secret);
            }
          } catch {
            // ignore
          }
        }

        const currentProviderHasKey = foundProviders.includes(provider);
        if (!currentProviderHasKey && foundProviders.length > 0) {
          const nextProvider = foundProviders[0];
          setProvider(nextProvider);
        }

        const state = useAppStore.getState();
        const sttProviders = ProviderManager.getSTTProviders();
        const currentSttHasKey = foundProviders.includes(state.sttProvider);
        if (!currentSttHasKey) {
          const matchingStt = foundProviders.find((p) => sttProviders.includes(p));
          if (matchingStt) {
            state.setSttProvider(matchingStt);
          }
        }
      } catch (err) {
        console.error('Failed checking provider credentials:', err);
      } finally {
        setOnboardingChecked(true);
      }
    };

    // Safety fallback timer — ensure app never stays stuck on blank/loading screen
    const safetyTimer = setTimeout(() => {
      setOnboardingChecked(true);
    }, 1500);

    checkAllProviders().finally(() => {
      clearTimeout(safetyTimer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markProviderKeySaved]);

  // Recovery for an unexpected hard reload (e.g. a Chromium network-service
  // crash killing the renderer mid-request): HashRouter resets to the bare
  // "/" hash on reload, silently dropping the user back on Home with no
  // explanation of what happened. If the hash is currently bare/empty, try
  // to jump back to whatever page was last visited (persisted by AppLayout)
  // rather than leaving this as an unexplained "it randomly went to Home".
  // Runs as an effect (not inline during render) — mutating
  // window.location.hash directly during render fires a synchronous
  // hashchange that HashRouter reacts to internally, which React flags as
  // "Cannot update a component while rendering a different component".
  // Declared before any conditional return so this hook always runs in the
  // same order every render, per the Rules of Hooks.
  // Only fires once per load and never overrides a deliberate navigation —
  // by the time any other route change happens, the hash is no longer bare.
  useEffect(() => {
    if (!onboardingChecked || !hasAnyKey) return;
    if (window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#') {
      try {
        const lastRoute = localStorage.getItem(LAST_ROUTE_KEY);
        if (lastRoute && lastRoute !== '/' && lastRoute.startsWith('/')) {
          window.location.hash = `#${lastRoute}`;
        }
      } catch {
        // ignore — falls back to Home, which is still a valid, working state
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingChecked, hasAnyKey]);

  if (!onboardingChecked) {
    return (
      <div
        className="w-screen h-screen flex flex-col items-center justify-center gap-3 select-none"
        style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold tracking-wider text-zinc-400">Loading Mirai Granola…</span>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/onboarding"
          element={<Onboarding />}
        />
        {/* Settings is always accessible — even with no key saved.
            This lets users delete their last key and re-enter a new one
            without being forced back through onboarding. */}
        <Route element={<AppLayout />}>
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route
          element={
            hasAnyKey ? (
              <AppLayout />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/meeting" element={<Meeting />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/bin" element={<Bin />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
