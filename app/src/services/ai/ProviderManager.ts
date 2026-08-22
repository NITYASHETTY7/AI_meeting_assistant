import { useAppStore } from '../../store/useAppStore';
import { OpenAIProvider } from './providers/OpenAI/OpenAIProvider';
import { AzureOpenAIProvider } from './providers/AzureOpenAI/AzureOpenAIProvider';
import { AWSBedrockProvider } from './providers/AWSBedrock/AWSBedrockProvider';
import { AnthropicProvider } from './providers/Anthropic/AnthropicProvider';
import { GeminiProvider } from './providers/Gemini/GeminiProvider';
import { GroqProvider } from './providers/Groq/GroqProvider';
import { AssemblyAIProvider } from './providers/AssemblyAI/AssemblyAIProvider';
import { DeepgramProvider } from './providers/Deepgram/DeepgramProvider';
import { OpenRouterProvider } from './providers/OpenRouter/OpenRouterProvider';
import { OllamaProvider } from './providers/Ollama/OllamaProvider';
import { CustomOpenAIProvider } from './providers/CustomOpenAI/CustomOpenAIProvider';
import type { AIProvider } from './AIProvider';

export class ProviderManager {
  private static instances: Record<string, AIProvider> = {
    'OpenAI': new OpenAIProvider(),
    'Azure OpenAI': new AzureOpenAIProvider(),
    'AWS Bedrock': new AWSBedrockProvider(),
    'Anthropic': new AnthropicProvider(),
    'Gemini': new GeminiProvider(),
    'Groq': new GroqProvider(),
    'AssemblyAI': new AssemblyAIProvider(),
    'Deepgram': new DeepgramProvider(),
    'OpenRouter': new OpenRouterProvider(),
    'Ollama': new OllamaProvider(),
    'Custom OpenAI-Compatible': new CustomOpenAIProvider()
  };

  /**
   * Retrieves and initializes the active provider from the Zustand store.
   */
  static getActiveProvider(): AIProvider {
    const state = useAppStore.getState();
    const providerName = state.provider;

    const provider = this.instances[providerName];
    if (!provider) {
      throw new Error(`AI Provider "${providerName}" is not registered in ProviderManager.`);
    }

    const apiKey = state.apiKeys[providerName] || '';
    const baseUrl = state.baseUrls[providerName] || '';
    const model = state.model;

    provider.initialize({
      provider: providerName,
      apiKey,
      baseUrl,
      defaultModel: model,
      
      // AWS Bedrock parameters
      awsAccessKeyId: state.awsAccessKeyId,
      awsSecretAccessKey: state.awsSecretAccessKey,
      awsRegion: state.awsRegion,

      // Azure OpenAI parameters
      azureEndpoint: state.azureEndpoint,
      azureDeploymentName: state.azureDeploymentName,
      azureApiVersion: state.azureApiVersion
    });

    return provider;
  }

  /**
   * Returns an initialized Deepgram provider instance for use as an
   * automatic transcription fallback, independent of whichever provider is
   * currently "active" in Settings. Returns null if no Deepgram API key has
   * been saved — callers should skip the fallback attempt in that case
   * rather than surfacing a confusing "Deepgram key missing" error for a
   * feature the user never opted into.
   */
  static getFallbackDeepgramProvider(): AIProvider | null {
    const state = useAppStore.getState();
    const apiKey = state.apiKeys['Deepgram'];
    if (!apiKey) return null;

    const provider = this.instances['Deepgram'];
    provider.initialize({
      provider: 'Deepgram',
      apiKey,
      defaultModel: state.cachedModels['Deepgram']?.[0] || 'nova-3',
    });
    return provider;
  }

  /**
   * Returns list of supported provider names.
   */
  static getSupportedProviders(): string[] {
    return Object.keys(this.instances);
  }

  /**
   * Returns a chat-capable provider regardless of which STT provider is active.
   * Priority:
   *   1. The active provider if it has a chat model (OpenAI, Groq, Anthropic, etc.)
   *   2. Any other provider that has an API key saved and supports chat
   *   3. Groq as the last resort (always has compound-mini)
   */
  static getChatProvider(): AIProvider {
    const state = useAppStore.getState();
    const activeProviderName = state.provider;

    // Chat-capable providers in preference order
    const CHAT_PROVIDERS = [
      'OpenAI', 'Groq', 'Anthropic', 'Gemini', 'Azure OpenAI',
      'OpenRouter', 'AWS Bedrock', 'Ollama', 'Custom OpenAI-Compatible',
    ];

    // 1. Try active provider first if it's chat-capable
    if (CHAT_PROVIDERS.includes(activeProviderName)) {
      return this.getActiveProvider();
    }

    // 2. Active provider is STT-only (AssemblyAI / Deepgram) — find another with a key
    for (const name of CHAT_PROVIDERS) {
      const key = state.apiKeys[name];
      if (!key) continue;
      const provider = this.instances[name];
      if (!provider) continue;
      provider.initialize({
        provider: name,
        apiKey: key,
        baseUrl: state.baseUrls[name] || '',
        defaultModel: state.cachedModels?.[name]?.[0] || '',
      });
      return provider;
    }

    // 3. Absolute fallback — return Groq even without a key (will surface a useful error)
    return this.getActiveProvider();
  }
}
