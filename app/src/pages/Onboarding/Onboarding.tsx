import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Check, Mic, Bell, ShieldAlert, Cpu, Waves } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ApiKeyInput } from '../../components/ApiKeyInput';
import { ProviderQuickSelect } from '../../components/ProviderQuickSelect';
import { ProviderManager } from '../../services/ai/ProviderManager';

/**
 * Onboarding
 *
 * First-run gate, four steps:
 *  0. Welcome — explains what the app does before asking for anything
 *  1. API key — BYO key model for both STT and AI providers (saved in OS credential store)
 *  2. Microphone permission — primes the OS mic permission prompt now
 *  3. Notification permission — confirms native OS notifications work
 */
type OnboardingStep = 'welcome' | 'apiKey' | 'microphone' | 'notifications';

type PermissionState = 'idle' | 'checking' | 'granted' | 'denied' | 'unsupported';

export const Onboarding = () => {
  const navigate = useNavigate();
  const { provider, setProvider, sttProvider, setSttProvider, savedKeyProviders, markProviderKeySaved } = useAppStore();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<OnboardingStep>('welcome');

  const hasAnyKey = savedKeyProviders.size > 0;
  const isSharedKey = sttProvider === provider;

  // ── Microphone permission ────────────────────────────────────────────────────
  const [micState, setMicState] = useState<PermissionState>('idle');
  const [micError, setMicError] = useState('');

  // ── Notification permission ──────────────────────────────────────────────────
  const [notifState, setNotifState] = useState<PermissionState>('idle');
  const [notifError, setNotifError] = useState('');

  // On mount, check the OS credential store for the currently selected provider
  // so returning users who already saved a key don't see a stale "not saved" state.
  useEffect(() => {
    const check = async () => {
      const api = window.electronAPI;
      if (!api?.hasCredential) {
        setChecking(false);
        return;
      }
      try {
        const { ok, exists } = await api.hasCredential(provider);
        if (ok && exists) markProviderKeySaved(provider);
      } finally {
        setChecking(false);
      }
    };
    void check();
  }, [provider, markProviderKeySaved]);

  const handleContinueFromApiKey = () => {
    if (!hasAnyKey) return;
    setStep('microphone');
  };

  const handleRequestMicrophone = async () => {
    setMicState('checking');
    setMicError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicState('unsupported');
        return;
      }
      // Trigger the real OS/browser permission prompt now, rather than the
      // user discovering it's blocked the first time they try to record.
      // We only need to confirm access — nothing is recorded or kept.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicState('granted');
    } catch (err) {
      setMicState('denied');
      setMicError(
        err instanceof Error
          ? err.message
          : 'Microphone access was denied. You can grant it later from your OS privacy settings.'
      );
    }
  };

  const handleRequestNotifications = async () => {
    setNotifState('checking');
    setNotifError('');
    try {
      const api = window.electronAPI;
      if (!api?.showNativeNotification) {
        setNotifState('unsupported');
        return;
      }
      const result = await api.showNativeNotification({
        title: 'Mirai Granola',
        body: "Notifications are working — you'll see one like this when a meeting is detected.",
      });
      if (result.ok) {
        setNotifState('granted');
      } else {
        setNotifState('denied');
        setNotifError(result.error || 'Notifications are not available on this system.');
      }
    } catch (err) {
      setNotifState('denied');
      setNotifError(err instanceof Error ? err.message : 'Failed to show a test notification.');
    }
  };

  const handleFinish = () => {
    navigate('/');
  };

  // ── Step indicator ───────────────────────────────────────────────────────────
  const steps: { id: OnboardingStep; label: string }[] = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'apiKey', label: 'API Key' },
    { id: 'microphone', label: 'Microphone' },
    { id: 'notifications', label: 'Notifications' },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-8 select-none">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 flex-1">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{
              background: i <= stepIndex ? 'var(--accent)' : 'var(--bg-hover)',
              color: i <= stepIndex ? '#fff' : 'var(--text-muted)',
            }}
          >
            {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span
            className="text-[11px] font-semibold hidden sm:inline"
            style={{ color: i <= stepIndex ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-px"
              style={{ background: i < stepIndex ? 'var(--accent)' : 'var(--border)' }}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="w-screen h-screen flex items-center justify-center overflow-y-auto"
      style={{ background: 'var(--bg-app)' }}
    >
      <div className="w-full max-w-[520px] px-6 py-10 mg-animate-fade">
        {/* Brand mark — speech bubble with a voice waveform */}
        <div className="flex items-center gap-3 mb-8 select-none">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shadow-md shrink-0"
            style={{ background: 'var(--gradient-brand)' }}
          >
            <svg className="w-[22px] h-[22px] text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 5.5C4 4.12 5.12 3 6.5 3h11C18.88 3 20 4.12 20 5.5v8c0 1.38-1.12 2.5-2.5 2.5H9l-4 4v-4H6.5C5.12 16 4 14.88 4 13.5v-8z"
                fill="currentColor"
                opacity={0.22}
              />
              <path
                d="M4 5.5C4 4.12 5.12 3 6.5 3h11C18.88 3 20 4.12 20 5.5v8c0 1.38-1.12 2.5-2.5 2.5H9l-4 4v-4H6.5C5.12 16 4 14.88 4 13.5v-8z"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
              <path d="M8 9.5v2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              <path d="M10.5 7.5v6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              <path d="M13 9v4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              <path d="M15.5 7.5v6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Mirai Granola
          </span>
        </div>

        {renderStepIndicator()}

        {/* ── Step 0: Welcome ── */}
        {step === 'welcome' && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Welcome to Mirai Granola
            </h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-tertiary)' }}>
              Mirai Granola is an AI meeting assistant for your desktop. It automatically
              detects when you join a call, records and transcribes the conversation, and
              turns it into a clean summary with action items — so you can focus on the
              meeting instead of taking notes.
            </p>

            <div className="mg-card p-5 mb-6 space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Automatic meeting detection
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    Notices when you're in a Teams call and prompts you to start recording —
                    no need to remember to press a button.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Live transcription &amp; AI summaries
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    Converts speech to text as you talk, then generates a summary, decisions,
                    and action items once the meeting ends. You can also chat with an AI about
                    any past meeting's transcript.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Local-first and bring-your-own-key
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    Everything — meetings, transcripts, notes, chats — is stored locally on
                    this device. There's no cloud account: you connect your own AI provider
                    (OpenAI, Groq, etc.) with your own API key, and we never see it.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('apiKey')}
              className="mg-btn mg-btn-primary w-full justify-center text-sm py-3"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ── Step 1: API Key ── */}
        {step === 'apiKey' && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Connect Speech &amp; AI Providers
            </h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-tertiary)' }}>
              Mirai Granola decouples <strong>Speech-to-Text</strong> (live audio transcription) from{' '}
              <strong>AI Intelligence</strong> (summaries &amp; action items). Choose your preferred engine
              for each, or use a single provider like Groq or OpenAI for both.
            </p>

            {/* STT Provider Card */}
            <div className="mg-card p-5 mb-4 space-y-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <Waves className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                    1. Speech-to-Text Engine
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Transcribes microphone and system voices into real-time text.
                  </p>
                </div>
              </div>

              <ProviderQuickSelect
                value={sttProvider}
                onChange={setSttProvider}
                providers={ProviderManager.getSTTProviders()}
              />

              <ApiKeyInput provider={sttProvider} />
            </div>

            {/* AI Intelligence Provider Card */}
            <div className="mg-card p-5 mb-6 space-y-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  <Cpu className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                    2. AI Intelligence (LLM) Engine
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Generates executive summaries, scorecards, and action items.
                  </p>
                </div>
              </div>

              <ProviderQuickSelect
                value={provider}
                onChange={setProvider}
                providers={ProviderManager.getAIProviders()}
              />

              {isSharedKey ? (
                <div
                  className="px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 border"
                  style={{
                    background: 'var(--accent-subtle)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                  <span>
                    <strong>Shared API Key:</strong> Both STT and AI are set to <strong>{provider}</strong>. Your key is automatically shared.
                  </span>
                </div>
              ) : (
                <ApiKeyInput provider={provider} />
              )}
            </div>

            <button
              onClick={handleContinueFromApiKey}
              disabled={!hasAnyKey || checking}
              className="mg-btn mg-btn-primary w-full justify-center text-sm py-3"
            >
              <Sparkles className="w-4 h-4" />
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>

            {!hasAnyKey && (
              <p className="text-[11px] text-center mt-3" style={{ color: 'var(--text-muted)' }}>
                Save an API key above to continue. You can change models and keys anytime in Settings.
              </p>
            )}
          </>
        )}

        {/* ── Step 2: Microphone ── */}
        {step === 'microphone' && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Allow microphone access
            </h1>
            <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-tertiary)' }}>
              Mirai Granola records your meetings through your microphone so it can transcribe
              and summarize them. Grant access now — you can also change this later in your
              operating system's privacy settings.
            </p>

            <div className="mg-card p-5 mb-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: micState === 'granted' ? 'var(--success-bg)' : 'var(--accent-subtle)',
                    color: micState === 'granted' ? 'var(--success)' : 'var(--accent)',
                  }}
                >
                  <Mic className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    Microphone
                  </p>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Required to record meeting audio and generate transcripts.
                  </p>

                  {micState === 'granted' ? (
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                      <Check className="w-3.5 h-3.5" /> Access granted
                    </p>
                  ) : micState === 'unsupported' ? (
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                      <ShieldAlert className="w-3.5 h-3.5" /> Microphone access is not available in this environment.
                    </p>
                  ) : (
                    <button
                      onClick={handleRequestMicrophone}
                      disabled={micState === 'checking'}
                      className="mg-btn mg-btn-secondary text-xs"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {micState === 'checking' ? 'Requesting…' : micState === 'denied' ? 'Try Again' : 'Allow Microphone'}
                    </button>
                  )}

                  {micState === 'denied' && micError && (
                    <p className="text-[11px] mt-2" style={{ color: 'var(--error)' }}>
                      {micError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('notifications')}
              className="mg-btn mg-btn-primary w-full justify-center text-sm py-3"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[11px] text-center mt-3" style={{ color: 'var(--text-muted)' }}>
              {micState === 'granted'
                ? "You're all set for recording."
                : 'You can skip this and grant access later, but recording will not work until you do.'}
            </p>
          </>
        )}

        {/* ── Step 3: Notifications ── */}
        {step === 'notifications' && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Allow notifications
            </h1>
            <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-tertiary)' }}>
              Mirai Granola can detect when you join a meeting (Teams, Zoom, etc.) and notify
              you to start taking notes — even if the app isn't in focus. This uses your
              operating system's native notifications.
            </p>

            <div className="mg-card p-5 mb-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: notifState === 'granted' ? 'var(--success-bg)' : 'var(--accent-subtle)',
                    color: notifState === 'granted' ? 'var(--success)' : 'var(--accent)',
                  }}
                >
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    Desktop Notifications
                  </p>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Used for meeting-detection alerts. A test notification will appear when you
                    click below.
                  </p>

                  {notifState === 'granted' ? (
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                      <Check className="w-3.5 h-3.5" /> Test notification sent — check your screen.
                    </p>
                  ) : notifState === 'unsupported' ? (
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                      <ShieldAlert className="w-3.5 h-3.5" /> Notifications are not available in this environment.
                    </p>
                  ) : (
                    <button
                      onClick={handleRequestNotifications}
                      disabled={notifState === 'checking'}
                      className="mg-btn mg-btn-secondary text-xs"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {notifState === 'checking' ? 'Sending…' : notifState === 'denied' ? 'Try Again' : 'Send Test Notification'}
                    </button>
                  )}

                  {notifState === 'denied' && notifError && (
                    <p className="text-[11px] mt-2" style={{ color: 'var(--error)' }}>
                      {notifError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="mg-btn mg-btn-primary w-full justify-center text-sm py-3"
            >
              <Sparkles className="w-4 h-4" />
              Finish Setup
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[11px] text-center mt-3" style={{ color: 'var(--text-muted)' }}>
              You can change notification and meeting-detection settings anytime in Settings.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
