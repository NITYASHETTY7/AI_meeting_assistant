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

export const STT_PROVIDERS = [
  'Deepgram',
  'Groq',
  'OpenAI',
  'AssemblyAI',
  'Gemini',
  'Azure OpenAI'
];

export const AI_PROVIDERS = [
  'Anthropic',
  'OpenAI',
  'Groq',
  'Gemini',
  'OpenRouter',
  'Ollama',
  'Azure OpenAI',
  'AWS Bedrock',
  'Custom OpenAI-Compatible'
];

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
   * Returns an initialized STT (Speech-to-Text) provider instance based on user settings.
   */
  static getSTTProvider(): AIProvider {
    const state = useAppStore.getState();
    const providerName = state.sttProvider || (STT_PROVIDERS.includes(state.provider) ? state.provider : 'Groq');

    const provider = this.instances[providerName];
    if (!provider) {
      throw new Error(`STT Provider "${providerName}" is not registered in ProviderManager.`);
    }

    const apiKey = state.apiKeys[providerName] || '';
    const baseUrl = state.baseUrls[providerName] || '';
    const model = state.sttModel || state.cachedModels[providerName]?.[0] || '';

    provider.initialize({
      provider: providerName,
      apiKey,
      baseUrl,
      defaultModel: model,

      // Azure OpenAI parameters
      azureEndpoint: state.azureEndpoint,
      azureDeploymentName: state.azureDeploymentName,
      azureApiVersion: state.azureApiVersion
    });

    return provider;
  }

  /**
   * Retrieves and initializes the active AI provider from the Zustand store.
   */
  static getActiveProvider(): AIProvider {
    const state = useAppStore.getState();
    const providerName = state.aiProvider || state.provider;

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
   * currently "active" in Settings.
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
   * Returns list of STT provider names.
   */
  static getSTTProviders(): string[] {
    return STT_PROVIDERS;
  }

  /**
   * Returns list of AI / LLM provider names.
   */
  static getAIProviders(): string[] {
    return AI_PROVIDERS;
  }

  /**
   * Alias for getChatProvider().
   */
  static getAIProvider(): AIProvider {
    return this.getChatProvider();
  }

  /**
   * Returns a chat-capable provider regardless of which STT provider is active.
   */
  static getChatProvider(): AIProvider {
    const state = useAppStore.getState();
    const activeProviderName = state.aiProvider || state.provider;

    // 1. Try active AI provider first if it's chat-capable
    if (AI_PROVIDERS.includes(activeProviderName)) {
      const provider = this.instances[activeProviderName];
      if (provider) {
        provider.initialize({
          provider: activeProviderName,
          apiKey: state.apiKeys[activeProviderName] || '',
          baseUrl: state.baseUrls[activeProviderName] || '',
          defaultModel: state.model || state.cachedModels?.[activeProviderName]?.[0] || '',
          
          awsAccessKeyId: state.awsAccessKeyId,
          awsSecretAccessKey: state.awsSecretAccessKey,
          awsRegion: state.awsRegion,

          azureEndpoint: state.azureEndpoint,
          azureDeploymentName: state.azureDeploymentName,
          azureApiVersion: state.azureApiVersion
        });
        return provider;
      }
    }

    // 2. Active provider is STT-only (AssemblyAI / Deepgram) — find another with a key
    for (const name of AI_PROVIDERS) {
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

    // 3. Absolute fallback — return active provider
    return this.getActiveProvider();
  }
}
