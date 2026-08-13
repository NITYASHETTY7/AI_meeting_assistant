import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Home } from './pages/Home/Home';
import { Meeting } from './pages/Meeting/Meeting';
import { History } from './pages/History/History';
import { Settings } from './pages/Settings/Settings';
import { Chat } from './pages/Chat/Chat';
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

        const currentProviderHasKey = foundProviders.includes(provider);
        if (!currentProviderHasKey && foundProviders.length > 0) {
          const nextProvider = foundProviders[0];
          setProvider(nextProvider);
          // Load the key into memory immediately so ProviderManager can
          // authenticate right away — without this the provider would be
          // selected but have an empty apiKeys entry until the user
          // happens to visit Settings (which has its own separate
          // credential-load effect, but only while that page is mounted).
          try {
            const loadResult = await api.loadCredential?.(nextProvider);
            if (loadResult?.ok && loadResult.secret) {
              useAppStore.getState().setApiKeyForProvider(nextProvider, loadResult.secret);
            }
          } catch {
            // ignore — Settings page will retry this on visit
          }
        }
      } finally {
        setOnboardingChecked(true);
      }
    };
    void checkAllProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markProviderKeySaved]);

  if (!onboardingChecked) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-app)' }}
      />
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/onboarding"
          element={hasAnyKey ? <Navigate to="/" replace /> : <Onboarding />}
        />
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
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
