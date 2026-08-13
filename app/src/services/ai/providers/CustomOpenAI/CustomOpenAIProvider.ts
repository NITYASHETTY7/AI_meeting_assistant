import type { AuthenticationResult } from '../../AIProvider';
import { BaseOpenAICompatibleProvider } from '../BaseOpenAICompatibleProvider';

/**
 * Custom OpenAI-Compatible Provider
 *
 * Targets any server that implements the OpenAI REST protocol:
 *   - LM Studio, LocalAI, text-generation-webui, vLLM, TGI, LiteLLM proxies, etc.
 *
 * The user provides:
 *   - Base URL  (e.g. http://localhost:1234/v1)
 *   - API Key   (optional — many local servers don't require one)
 *
 * Endpoints used (same as OpenAI):
 *   GET  {baseUrl}/models
 *   POST {baseUrl}/chat/completions
 */
export class CustomOpenAIProvider extends BaseOpenAICompatibleProvider {
  protected getProviderName() { return 'Custom OpenAI-Compatible'; }

  protected buildBaseUrl(): string {
    return (this.config?.baseUrl ?? 'http://localhost:11434/v1').replace(/\/$/, '');
  }

  protected buildHeaders(): Record<string, string> {
    const key = this.config?.apiKey;
    // Many local servers accept an empty/dummy key
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  protected validateConfig(): string | null {
    if (!this.config?.baseUrl) return 'Custom server Base URL is missing.';
    return null;
  }

  protected getCapabilities(): AuthenticationResult['capabilities'] {
    return {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: false,
      embeddings: false,
      function_calling: false,
    };
  }

  /** Surface all models returned by the server */
  protected filterModels(ids: string[]): string[] {
    return ids.sort((a, b) => a.localeCompare(b));
  }
}
