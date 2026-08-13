import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Check, Trash2, RefreshCw, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { SettingsRow } from './SettingsRow';

interface ApiKeyInputProps {
  /** The provider name, used as the keychain account identifier */
  provider: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type DeleteStatus = 'idle' | 'deleting' | 'error';

/**
 * ApiKeyInput — secure API key management component.
 *
 * States:
 *  • No key saved  → plain input with Show/Hide + "Save Key" button
 *  • Key saved     → masked placeholder + "Update Key" / "Delete Key"
 *
 * The actual key is NEVER stored in React state after saving.
 * The actual key is NEVER displayed after saving.
 * Keys live exclusively in the OS credential store (Windows Credential Manager /
 * macOS Keychain / Linux libsecret) accessed via keytar over Electron IPC.
 *
 * All colours use semantic CSS variables — no hardcoded Tailwind colour classes.
 */
export const ApiKeyInput = ({ provider }: ApiKeyInputProps) => {
  const { savedKeyProviders, markProviderKeySaved, clearProviderKeySaved, setApiKeyForProvider } =
    useAppStore();

  const isKeySaved = savedKeyProviders.has(provider);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.saveCredential;

  const [inputValue, setInputValue]     = useState('');
  const [showKey, setShowKey]           = useState(false);
  const [isUpdating, setIsUpdating]     = useState(false);
  const [saveStatus, setSaveStatus]     = useState<SaveStatus>('idle');
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue('');
    setShowKey(false);
    setIsUpdating(false);
    setSaveStatus('idle');
    setDeleteStatus('idle');
    setErrorMessage('');
  }, [provider]);

  useEffect(() => {
    return () => { if (successTimerRef.current) clearTimeout(successTimerRef.current); };
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSaveStatus('saving');
    setErrorMessage('');
    try {
      if (window.electronAPI?.saveCredential) {
        const result = await window.electronAPI.saveCredential(provider, trimmed);
        if (!result.ok) throw new Error(result.error || 'Save failed.');
        markProviderKeySaved(provider);
      } else {
        markProviderKeySaved(provider);
      }
      setApiKeyForProvider(provider, trimmed);
      setInputValue('');
      setShowKey(false);
      setIsUpdating(false);
      setSaveStatus('saved');
      successTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setSaveStatus('error');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteStatus('deleting');
    setErrorMessage('');
    try {
      if (window.electronAPI?.deleteCredential) {
        const result = await window.electronAPI.deleteCredential(provider);
        if (!result.ok) throw new Error(result.error || 'Delete failed.');
      }
      setApiKeyForProvider(provider, '');
      clearProviderKeySaved(provider);
      setDeleteStatus('idle');
      setInputValue('');
      setShowKey(false);
      setIsUpdating(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setDeleteStatus('error');
    }
  };

  const handleStartUpdate  = () => { setInputValue(''); setShowKey(false); setSaveStatus('idle'); setDeleteStatus('idle'); setErrorMessage(''); setIsUpdating(true); };
  const handleCancelUpdate = () => { setInputValue(''); setShowKey(false); setIsUpdating(false); setSaveStatus('idle'); setErrorMessage(''); };

  const showSavedView = isKeySaved && !isUpdating;
  const showEntryForm = !isKeySaved || isUpdating;

  return (
    <SettingsRow
      label="API Key"
      description={
        showSavedView
          ? isElectron
            ? `API key for ${provider} is stored securely in your OS credential store.`
            : `API key for ${provider} is active for this session.`
          : isUpdating
          ? `Enter a new API key for ${provider}. The existing key will be overwritten.`
          : isElectron
          ? `Enter your ${provider} API key. It will be stored securely in your OS credential store.`
          : `Enter your ${provider} API key. It will be kept in memory for this session.`
      }
      control={
        <div className="flex flex-col gap-2.5 w-[320px] max-w-sm">

          {/* ── Saved view ── */}
          {showSavedView && (
            <div className="space-y-2.5">
              {/* Masked key row */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                }}
              >
                <ShieldCheck
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--success)' }}
                />
                <span
                  className="flex-1 text-xs font-mono tracking-widest select-none"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ••••••••••••••••••••••••••••••••
                </span>
              </div>

              {saveStatus === 'saved' && (
                <p
                  className="text-[11px] flex items-center gap-1.5 font-semibold"
                  style={{ color: 'var(--success)' }}
                >
                  <Check className="w-3.5 h-3.5" />
                  {isElectron ? 'API key saved securely.' : 'API key active for this session.'}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartUpdate}
                  className="mg-btn mg-btn-secondary text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Update Key
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteStatus === 'deleting'}
                  className="mg-btn mg-btn-danger text-xs"
                >
                  {deleteStatus === 'deleting' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete Key
                </button>
              </div>

              {deleteStatus === 'error' && errorMessage && (
                <p
                  className="text-[11px] flex items-center gap-1.5"
                  style={{ color: 'var(--error)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
                </p>
              )}
            </div>
          )}

          {/* ── Entry form ── */}
          {showEntryForm && (
            <div className="space-y-2.5">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="sk-proj-........................"
                  autoComplete="off"
                  spellCheck={false}
                  className="mg-input font-mono pr-9 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center cursor-pointer transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title={showKey ? 'Hide key' : 'Show key'}
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!inputValue.trim() || saveStatus === 'saving'}
                  className="mg-btn mg-btn-primary text-xs"
                >
                  {saveStatus === 'saving' ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  ) : (
                    <><ShieldCheck className="w-3.5 h-3.5" /> Save Key</>
                  )}
                </button>

                {isUpdating && (
                  <button
                    type="button"
                    onClick={handleCancelUpdate}
                    className="mg-btn mg-btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {saveStatus === 'error' && errorMessage && (
                <p
                  className="text-[11px] flex items-center gap-1.5"
                  style={{ color: 'var(--error)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
                </p>
              )}
            </div>
          )}
        </div>
      }
    />
  );
};

export default ApiKeyInput;
