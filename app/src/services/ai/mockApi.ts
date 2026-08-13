import type { AuthenticationResult } from './AIProvider';

const mockProviderDatabase: Record<string, Omit<AuthenticationResult, 'success' | 'message'>> = {
  'OpenAI': {
    providerInfo: { name: 'OpenAI Developer Platform', version: 'v1' },
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o-transcribe'],
    defaultModel: 'gpt-4o-mini',
    capabilities: {
      chat: true,
      speech_to_text: true,
      audio_generation: false,
      realtime: true,
      vision: true,
      embeddings: true,
      function_calling: true,
    }
  },
  'Azure OpenAI': {
    providerInfo: { name: 'Microsoft Azure OpenAI Service', version: '2024-02-15-preview' },
    models: ['azure-gpt-4', 'azure-gpt-4-mini', 'azure-gpt-35-turbo'],
    defaultModel: 'azure-gpt-4-mini',
    capabilities: {
      chat: true,
      speech_to_text: true,
      audio_generation: false,
      realtime: false,
      vision: true,
      embeddings: true,
      function_calling: true,
    }
  },
  'AWS Bedrock': {
    providerInfo: { name: 'Amazon Web Services Bedrock', version: 'v1.0' },
    models: ['anthropic.claude-3-sonnet-v1:0', 'anthropic.claude-3-haiku-v1:0', 'meta.llama3-70b-instruct-v1:0'],
    defaultModel: 'anthropic.claude-3-haiku-v1:0',
    capabilities: {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: true,
      embeddings: true,
      function_calling: true,
    }
  },
  'Anthropic': {
    providerInfo: { name: 'Anthropic Claude Platform', version: 'v1' },
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultModel: 'claude-3-5-haiku-20241022',
    capabilities: {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: true,
      embeddings: false,
      function_calling: true,
    }
  },
  'Gemini': {
    providerInfo: { name: 'Google Gemini Platform', version: 'v2.5' },
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    defaultModel: 'gemini-2.5-flash',
    capabilities: {
      chat: true,
      speech_to_text: true,
      audio_generation: true,
      realtime: true,
      vision: true,
      embeddings: true,
      function_calling: true,
    }
  },
  'Groq': {
    providerInfo: { name: 'Groq Cloud Inference Engine', version: 'v1' },
    models: ['llama-3.3-70b-versatile', 'whisper-large-v3'],
    defaultModel: 'llama-3.3-70b-versatile',
    capabilities: {
      chat: true,
      speech_to_text: true,
      audio_generation: false,
      realtime: false,
      vision: false,
      embeddings: false,
      function_calling: true,
    }
  },
  'AssemblyAI': {
    providerInfo: { name: 'AssemblyAI Audio Intelligence Platform', version: 'v2' },
    models: ['assemblyai-best-v1'],
    defaultModel: 'assemblyai-best-v1',
    capabilities: {
      chat: false,
      speech_to_text: true,
      audio_generation: false,
      realtime: true,
      vision: false,
      embeddings: false,
      function_calling: false,
    }
  },
  'OpenRouter': {
    providerInfo: { name: 'OpenRouter Aggregated Gateway', version: 'v1' },
    models: ['meta-llama/llama-3.1-405b', 'google/gemini-pro', 'mistralai/mistral-large'],
    defaultModel: 'meta-llama/llama-3.1-405b',
    capabilities: {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: true,
      embeddings: true,
      function_calling: true,
    }
  },
  'Ollama': {
    providerInfo: { name: 'Local Ollama Instance', version: 'v0.3.14' },
    models: ['llama3.2', 'mistral:latest', 'phi3:medium'],
    defaultModel: 'llama3.2',
    capabilities: {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: false,
      embeddings: true,
      function_calling: false,
    }
  },
  'Custom OpenAI-Compatible': {
    providerInfo: { name: 'Custom OpenAI-Compatible Server', version: 'v1' },
    models: ['local-custom-model-1', 'local-custom-model-2'],
    defaultModel: 'local-custom-model-1',
    capabilities: {
      chat: true,
      speech_to_text: false,
      audio_generation: false,
      realtime: false,
      vision: false,
      embeddings: false,
      function_calling: false,
    }
  }
};

/**
 * Simulates a cloud fetch returning model options and features for the target provider.
 */
export async function simulateFetchProviderData(providerName: string): Promise<Omit<AuthenticationResult, 'success' | 'message'>> {
  return new Promise((resolve, reject) => {
    const data = mockProviderDatabase[providerName];
    if (data) {
      resolve(data);
    } else {
      reject(new Error(`AI Provider "${providerName}" is not registered on the server.`));
    }
  });
}
