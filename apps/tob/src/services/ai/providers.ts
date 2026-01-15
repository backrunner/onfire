/**
 * AI Provider Service
 * Factory for creating AI clients based on configuration
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AIProvider, AITaskType, AIConfigRow } from '@onfire/shared/drizzle/schema';

// Provider configurations with latest models
export const AI_PROVIDERS: Record<
  AIProvider,
  {
    name: string;
    baseUrl?: string;
    models: string[];
    supportsStreaming: boolean;
    supportsTools: boolean;
  }
> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
    supportsStreaming: true,
    supportsTools: true
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    supportsStreaming: true,
    supportsTools: true
  },
  google: {
    name: 'Google',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    supportsStreaming: true,
    supportsTools: true
  },
  xai: {
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-2', 'grok-2-mini'],
    supportsStreaming: true,
    supportsTools: true
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    supportsStreaming: true,
    supportsTools: true
  }
};

// Task type descriptions for UI
export const AI_TASK_TYPES: Record<AITaskType, { name: string; description: string }> = {
  agent: {
    name: 'AI Agent',
    description: '用于 AI Agent 对话面板，支持工具调用和多轮对话'
  },
  prescreening: {
    name: '工单预审',
    description: '用于自动分析工单内容，提取关键信息和建议标签'
  },
  prereply: {
    name: '预回复生成',
    description: '用于根据知识库生成回复建议'
  },
  embedding: {
    name: '文本嵌入',
    description: '用于知识库文档和工单的向量化搜索'
  }
};

/**
 * Create an AI client based on the provider configuration
 */
export function createAIClient(config: AIConfigRow) {
  const providerConfig = AI_PROVIDERS[config.provider];

  switch (config.provider) {
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined
      });

    case 'anthropic':
      return createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined
      });

    case 'google':
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined
      });

    case 'xai':
    case 'deepseek':
      // Use OpenAI SDK with custom baseURL for OpenAI-compatible providers
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || providerConfig.baseUrl
      });

    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Get the model identifier for the AI SDK
 */
export function getModelId(config: AIConfigRow): string {
  // For OpenAI-compatible providers, the model is used directly
  return config.model;
}

/**
 * Validate if a model is supported by the provider
 */
export function isModelSupported(provider: AIProvider, model: string): boolean {
  const providerConfig = AI_PROVIDERS[provider];
  // Allow custom models that aren't in the preset list
  return providerConfig.models.includes(model) || model.trim().length > 0;
}

/**
 * Get available models for a provider
 */
export function getProviderModels(provider: AIProvider): string[] {
  return AI_PROVIDERS[provider]?.models || [];
}

/**
 * Check if provider supports streaming
 */
export function supportsStreaming(provider: AIProvider): boolean {
  return AI_PROVIDERS[provider]?.supportsStreaming ?? false;
}

/**
 * Check if provider supports tool calling
 */
export function supportsTools(provider: AIProvider): boolean {
  return AI_PROVIDERS[provider]?.supportsTools ?? false;
}
