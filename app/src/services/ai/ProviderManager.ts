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
}
