import type { AuthenticationResult } from '../../AIProvider';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';

/**
 * OpenRouter Provider — OpenAI-compatible aggregated LLM gateway
 *
 * Endpoints:
 *   GET  {baseUrl}/models           → model catalogue
 *   POST {baseUrl}/chat/completions → inference routing
 *
 * Auth: Bearer token + HTTP-Referer / X-Title headers required by OpenRouter.
 * No transcription support.
 */

const MODEL_LIMIT = 40;
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider extends BaseOpenAICompatibleProvider {
  protected getProviderName() { return 'OpenRouter'; }

  protected buildBaseUrl() {
    const raw = this.config?.baseUrl ?? DEFAULT_BASE_URL;
    return raw.replace(/\/$/, '');
  }

  protected buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config?.apiKey ?? ''}`,
      'HTTP-Referer': 'https://mirai-granola.app',
      'X-Title': 'Mirai Granola',
    };
  }

  protected validateConfig(): string | null {
    if (!this.config?.apiKey) return 'OpenRouter API Key is missing.';
    return null;
  }

  protected getCapabilities(): AuthenticationResult['capabilities'] {
    return {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: true,
      embeddings: false,
      function_calling: true,
    };
  }

  /** Limit to first MODEL_LIMIT models sorted alphabetically */
  protected filterModels(ids: string[]): string[] {
    return [...ids].sort((a, b) => a.localeCompare(b)).slice(0, MODEL_LIMIT);
  }

  protected pickDefaultModel(ids: string[]): string {
    return (
      ids.find((id) => id === 'meta-llama/llama-3.3-70b-instruct') ??
      ids.find((id) => id.includes('llama')) ??
      ids[0] ?? ''
    );
  }
}
