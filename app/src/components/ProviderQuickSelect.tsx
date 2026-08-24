import {
  Sparkles,
  Zap,
  Brain,
  Cloud,
  Cpu,
  Mic,
  Waves,
  Server,
  Boxes,
  Wrench,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ProviderManager } from '../services/ai/ProviderManager';

interface ProviderQuickSelectProps {
  value: string;
  onChange: (value: string) => void;
  providers?: string[];
}

/** Icon shown per provider. Falls back to a generic icon for anything not listed. */
const PROVIDER_ICONS: Record<string, typeof Sparkles> = {
  'OpenAI': Sparkles,
  'Groq': Zap,
  'Anthropic': Brain,
  'Gemini': Cloud,
  'AWS Bedrock': Server,
  'Azure OpenAI': Cloud,
  'AssemblyAI': Mic,
  'Deepgram': Waves,
  'OpenRouter': Boxes,
  'Ollama': Cpu,
  'Custom OpenAI-Compatible': Wrench,
};

/**
 * ProviderQuickSelect
 *
 * Icon-pill row for fast provider switching.
 */
export const ProviderQuickSelect = ({ value, onChange, providers: customProviders }: ProviderQuickSelectProps) => {
  const savedKeyProviders = useAppStore((state) => state.savedKeyProviders);
  const providers = customProviders || ProviderManager.getSupportedProviders();

  return (
    <div className="flex flex-wrap gap-2 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
      {providers.map((provider) => {
        const Icon = PROVIDER_ICONS[provider] ?? Sparkles;
        const isActive = value === provider;
        const hasKey = savedKeyProviders.has(provider);

        return (
          <button
            key={provider}
            onClick={() => onChange(provider)}
            title={provider}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all"
            style={{
              background: isActive ? 'var(--accent)' : 'var(--bg-card)',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              boxShadow: isActive ? '0 1px 6px rgba(59, 159, 216, 0.35)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {provider}
            {hasKey && (
              <ShieldCheck
                className="w-3 h-3"
                style={{ color: isActive ? '#fff' : 'var(--success)' }}
                aria-label="API key saved"
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ProviderQuickSelect;
