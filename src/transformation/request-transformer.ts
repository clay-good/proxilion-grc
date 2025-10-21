/**
 * Request Transformer
 * 
 * Transforms requests between different AI provider formats.
 * Enables protocol translation for multi-provider support.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface TransformationConfig {
  sourceProvider: 'openai' | 'anthropic' | 'google' | 'cohere';
  targetProvider: 'openai' | 'anthropic' | 'google' | 'cohere';
  preserveMetadata?: boolean;
  strictMode?: boolean; // Fail on unsupported features
}

export interface TransformationResult {
  success: boolean;
  transformedRequest: any;
  warnings: string[];
  unsupportedFeatures: string[];
  metadata: {
    sourceProvider: string;
    targetProvider: string;
    transformedAt: number;
    preservedFields: string[];
    droppedFields: string[];
  };
}

export class RequestTransformer {
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Transform request from one provider format to another
   */
  async transform(
    request: any,
    config: TransformationConfig
  ): Promise<TransformationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const unsupportedFeatures: string[] = [];
    const preservedFields: string[] = [];
    const droppedFields: string[] = [];

    try {
      // If source and target are the same, no transformation needed
      if (config.sourceProvider === config.targetProvider) {
        return {
          success: true,
          transformedRequest: request,
          warnings: [],
          unsupportedFeatures: [],
          metadata: {
            sourceProvider: config.sourceProvider,
            targetProvider: config.targetProvider,
            transformedAt: Date.now(),
            preservedFields: Object.keys(request),
            droppedFields: [],
          },
        };
      }

      let transformedRequest: any;

      // Route to appropriate transformation method
      if (config.sourceProvider === 'openai') {
        if (config.targetProvider === 'anthropic') {
          transformedRequest = this.openaiToAnthropic(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'google') {
          transformedRequest = this.openaiToGoogle(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'cohere') {
          transformedRequest = this.openaiToCohere(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        }
      } else if (config.sourceProvider === 'anthropic') {
        if (config.targetProvider === 'openai') {
          transformedRequest = this.anthropicToOpenai(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'google') {
          transformedRequest = this.anthropicToGoogle(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'cohere') {
          transformedRequest = this.anthropicToCohere(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        }
      } else if (config.sourceProvider === 'google') {
        if (config.targetProvider === 'openai') {
          transformedRequest = this.googleToOpenai(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'anthropic') {
          transformedRequest = this.googleToAnthropic(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'cohere') {
          transformedRequest = this.googleToCohere(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        }
      } else if (config.sourceProvider === 'cohere') {
        if (config.targetProvider === 'openai') {
          transformedRequest = this.cohereToOpenai(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'anthropic') {
          transformedRequest = this.cohereToAnthropic(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        } else if (config.targetProvider === 'google') {
          transformedRequest = this.cohereToGoogle(request, warnings, unsupportedFeatures, preservedFields, droppedFields);
        }
      }

      if (!transformedRequest) {
        throw new Error(`Unsupported transformation: ${config.sourceProvider} -> ${config.targetProvider}`);
      }

      // Check strict mode
      if (config.strictMode && unsupportedFeatures.length > 0) {
        throw new Error(`Strict mode: Unsupported features detected: ${unsupportedFeatures.join(', ')}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('request_transformation_duration_ms', duration, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
      });
      this.metrics.increment('request_transformation_success_total', 1, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
      });

      this.logger.info('Request transformed', {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
        warnings: warnings.length,
        unsupportedFeatures: unsupportedFeatures.length,
        duration,
      });

      return {
        success: true,
        transformedRequest,
        warnings,
        unsupportedFeatures,
        metadata: {
          sourceProvider: config.sourceProvider,
          targetProvider: config.targetProvider,
          transformedAt: Date.now(),
          preservedFields,
          droppedFields,
        },
      };
    } catch (error) {
      this.metrics.increment('request_transformation_failed_total', 1, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
      });

      this.logger.error('Request transformation failed', error instanceof Error ? error : undefined);

      return {
        success: false,
        transformedRequest: request,
        warnings,
        unsupportedFeatures,
        metadata: {
          sourceProvider: config.sourceProvider,
          targetProvider: config.targetProvider,
          transformedAt: Date.now(),
          preservedFields,
          droppedFields,
        },
      };
    }
  }

  /**
   * OpenAI -> Anthropic
   */
  private openaiToAnthropic(
    request: any,
    warnings: string[],
    unsupportedFeatures: string[],
    preservedFields: string[],
    droppedFields: string[]
  ): any {
    const transformed: any = {
      model: this.mapModel(request.model, 'openai', 'anthropic'),
      messages: this.transformMessages(request.messages, 'openai', 'anthropic'),
      max_tokens: request.max_tokens || request.parameters?.maxTokens || 1024,
    };

    // Map temperature - check both direct and parameters.temperature
    const temperature = request.temperature ?? request.parameters?.temperature;
    if (temperature !== undefined) {
      transformed.temperature = temperature;
      preservedFields.push('temperature');
    }

    // Map top_p - check both direct and parameters.topP
    const topP = request.top_p ?? request.parameters?.topP;
    if (topP !== undefined) {
      transformed.top_p = topP;
      preservedFields.push('top_p');
    }

    // Map stop sequences
    if (request.stop) {
      transformed.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
      preservedFields.push('stop');
    }

    // Map stream
    if (request.stream !== undefined) {
      transformed.stream = request.stream;
      preservedFields.push('stream');
    }

    // Unsupported: functions, tools, response_format
    if (request.functions || request.tools) {
      unsupportedFeatures.push('functions/tools');
      warnings.push('Function calling not supported in Anthropic format');
      droppedFields.push('functions', 'tools');
    }

    if (request.response_format) {
      unsupportedFeatures.push('response_format');
      warnings.push('Response format not supported in Anthropic format');
      droppedFields.push('response_format');
    }

    return transformed;
  }

  /**
   * OpenAI -> Google
   */
  private openaiToGoogle(
    request: any,
    warnings: string[],
    unsupportedFeatures: string[],
    preservedFields: string[],
    droppedFields: string[]
  ): any {
    const transformed: any = {
      model: this.mapModel(request.model, 'openai', 'google'),
      contents: this.transformMessages(request.messages, 'openai', 'google'),
    };

    // Map generation config
    const generationConfig: any = {};

    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
      preservedFields.push('temperature');
    }

    if (request.top_p !== undefined) {
      generationConfig.topP = request.top_p;
      preservedFields.push('top_p');
    }

    if (request.max_tokens !== undefined) {
      generationConfig.maxOutputTokens = request.max_tokens;
      preservedFields.push('max_tokens');
    }

    if (request.stop) {
      generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop];
      preservedFields.push('stop');
    }

    if (Object.keys(generationConfig).length > 0) {
      transformed.generationConfig = generationConfig;
    }

    // Unsupported: functions, tools (Google has different format)
    if (request.functions || request.tools) {
      unsupportedFeatures.push('functions/tools');
      warnings.push('Function calling format differs in Google - manual conversion required');
      droppedFields.push('functions', 'tools');
    }

    return transformed;
  }

  /**
   * OpenAI -> Cohere
   */
  private openaiToCohere(
    request: any,
    warnings: string[],
    unsupportedFeatures: string[],
    preservedFields: string[],
    droppedFields: string[]
  ): any {
    // Extract message and chat history
    const messages = request.messages || [];
    const lastMessage = messages[messages.length - 1];
    const chatHistory = messages.slice(0, -1);

    const transformed: any = {
      model: this.mapModel(request.model, 'openai', 'cohere'),
      message: lastMessage?.content || '',
    };

    if (chatHistory.length > 0) {
      transformed.chat_history = chatHistory.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: msg.content,
      }));
    }

    // Map parameters
    if (request.temperature !== undefined) {
      transformed.temperature = request.temperature;
      preservedFields.push('temperature');
    }

    if (request.max_tokens !== undefined) {
      transformed.max_tokens = request.max_tokens;
      preservedFields.push('max_tokens');
    }

    if (request.stop) {
      transformed.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
      preservedFields.push('stop');
    }

    return transformed;
  }

  /**
   * Transform messages between formats
   */
  private transformMessages(messages: any[], sourceProvider: string, targetProvider: string): any[] {
    if (sourceProvider === 'openai' && targetProvider === 'anthropic') {
      return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    if (sourceProvider === 'openai' && targetProvider === 'google') {
      return messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
    }

    // Add more transformations as needed
    return messages;
  }

  /**
   * Map model names between providers
   */
  private mapModel(model: string, sourceProvider: string, targetProvider: string): string {
    const modelMappings: Record<string, Record<string, string>> = {
      'openai->anthropic': {
        'gpt-4': 'claude-3-opus-20240229',
        'gpt-4-turbo': 'claude-3-opus-20240229',
        'gpt-3.5-turbo': 'claude-3-sonnet-20240229',
      },
      'openai->google': {
        'gpt-4': 'gemini-pro',
        'gpt-4-turbo': 'gemini-pro',
        'gpt-3.5-turbo': 'gemini-pro',
      },
      'openai->cohere': {
        'gpt-4': 'command',
        'gpt-4-turbo': 'command',
        'gpt-3.5-turbo': 'command-light',
      },
    };

    const key = `${sourceProvider}->${targetProvider}`;
    const mapping = modelMappings[key];

    if (mapping && mapping[model]) {
      return mapping[model];
    }

    // Return original model if no mapping found
    return model;
  }

  // Placeholder methods for other transformations
  private anthropicToOpenai(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    // Implementation similar to openaiToAnthropic but reversed
    return request;
  }

  private anthropicToGoogle(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private anthropicToCohere(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private googleToOpenai(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private googleToAnthropic(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private googleToCohere(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private cohereToOpenai(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private cohereToAnthropic(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }

  private cohereToGoogle(request: any, warnings: string[], unsupportedFeatures: string[], preservedFields: string[], droppedFields: string[]): any {
    return request;
  }
}

