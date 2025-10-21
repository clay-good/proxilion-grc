/**
 * Response Transformer
 * 
 * Transforms responses between different AI provider formats.
 * Enables protocol translation for multi-provider support.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export interface ResponseTransformationConfig {
  sourceProvider: 'openai' | 'anthropic' | 'google' | 'cohere';
  targetProvider: 'openai' | 'anthropic' | 'google' | 'cohere';
  preserveMetadata?: boolean;
}

export interface ResponseTransformationResult {
  success: boolean;
  transformedResponse: any;
  warnings: string[];
  metadata: {
    sourceProvider: string;
    targetProvider: string;
    transformedAt: number;
  };
}

export class ResponseTransformer {
  private logger: Logger;
  private metrics: MetricsCollector;

  constructor() {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
  }

  /**
   * Transform response from one provider format to another
   */
  async transform(
    response: any,
    config: ResponseTransformationConfig
  ): Promise<ResponseTransformationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // If source and target are the same, no transformation needed
      if (config.sourceProvider === config.targetProvider) {
        return {
          success: true,
          transformedResponse: response,
          warnings: [],
          metadata: {
            sourceProvider: config.sourceProvider,
            targetProvider: config.targetProvider,
            transformedAt: Date.now(),
          },
        };
      }

      let transformedResponse: any;

      // Route to appropriate transformation method
      if (config.sourceProvider === 'anthropic' && config.targetProvider === 'openai') {
        transformedResponse = this.anthropicToOpenai(response, warnings);
      } else if (config.sourceProvider === 'google' && config.targetProvider === 'openai') {
        transformedResponse = this.googleToOpenai(response, warnings);
      } else if (config.sourceProvider === 'cohere' && config.targetProvider === 'openai') {
        transformedResponse = this.cohereToOpenai(response, warnings);
      } else if (config.sourceProvider === 'openai' && config.targetProvider === 'anthropic') {
        transformedResponse = this.openaiToAnthropic(response, warnings);
      } else if (config.sourceProvider === 'openai' && config.targetProvider === 'google') {
        transformedResponse = this.openaiToGoogle(response, warnings);
      } else if (config.sourceProvider === 'openai' && config.targetProvider === 'cohere') {
        transformedResponse = this.openaiToCohere(response, warnings);
      } else {
        throw new Error(`Unsupported transformation: ${config.sourceProvider} -> ${config.targetProvider}`);
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('response_transformation_duration_ms', duration, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
      });
      this.metrics.increment('response_transformation_success_total', 1, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
      });

      this.logger.info('Response transformed', {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
        warnings: warnings.length,
        duration,
      });

      return {
        success: true,
        transformedResponse,
        warnings,
        metadata: {
          sourceProvider: config.sourceProvider,
          targetProvider: config.targetProvider,
          transformedAt: Date.now(),
        },
      };
    } catch (error) {
      this.metrics.increment('response_transformation_failed_total', 1, {
        sourceProvider: config.sourceProvider,
        targetProvider: config.targetProvider,
      });

      this.logger.error('Response transformation failed', error instanceof Error ? error : undefined);

      return {
        success: false,
        transformedResponse: response,
        warnings,
        metadata: {
          sourceProvider: config.sourceProvider,
          targetProvider: config.targetProvider,
          transformedAt: Date.now(),
        },
      };
    }
  }

  /**
   * Anthropic -> OpenAI
   */
  private anthropicToOpenai(response: any, warnings: string[]): any {
    const transformed: any = {
      id: response.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || 'claude-3-opus-20240229',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content?.[0]?.text || '',
          },
          finish_reason: this.mapFinishReason(response.stop_reason, 'anthropic', 'openai'),
        },
      ],
      usage: {
        prompt_tokens: response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.output_tokens || 0,
        total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      },
    };

    return transformed;
  }

  /**
   * Google -> OpenAI
   */
  private googleToOpenai(response: any, warnings: string[]): any {
    const candidate = response.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    const transformed: any = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || 'gemini-pro',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: this.mapFinishReason(candidate?.finishReason, 'google', 'openai'),
        },
      ],
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
      },
    };

    return transformed;
  }

  /**
   * Cohere -> OpenAI
   */
  private cohereToOpenai(response: any, warnings: string[]): any {
    const transformed: any = {
      id: response.generation_id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model || 'command',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.text || '',
          },
          finish_reason: this.mapFinishReason(response.finish_reason, 'cohere', 'openai'),
        },
      ],
      usage: {
        prompt_tokens: response.meta?.billed_units?.input_tokens || 0,
        completion_tokens: response.meta?.billed_units?.output_tokens || 0,
        total_tokens: (response.meta?.billed_units?.input_tokens || 0) + (response.meta?.billed_units?.output_tokens || 0),
      },
    };

    return transformed;
  }

  /**
   * OpenAI -> Anthropic
   */
  private openaiToAnthropic(response: any, warnings: string[]): any {
    const choice = response.choices?.[0];

    const transformed: any = {
      id: response.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: choice?.message?.content || '',
        },
      ],
      model: response.model || 'gpt-4',
      stop_reason: this.mapFinishReason(choice?.finish_reason, 'openai', 'anthropic'),
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };

    return transformed;
  }

  /**
   * OpenAI -> Google
   */
  private openaiToGoogle(response: any, warnings: string[]): any {
    const choice = response.choices?.[0];

    const transformed: any = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: choice?.message?.content || '',
              },
            ],
            role: 'model',
          },
          finishReason: this.mapFinishReason(choice?.finish_reason, 'openai', 'google'),
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: response.usage?.prompt_tokens || 0,
        candidatesTokenCount: response.usage?.completion_tokens || 0,
        totalTokenCount: response.usage?.total_tokens || 0,
      },
    };

    return transformed;
  }

  /**
   * OpenAI -> Cohere
   */
  private openaiToCohere(response: any, warnings: string[]): any {
    const choice = response.choices?.[0];

    const transformed: any = {
      generation_id: response.id || `gen_${Date.now()}`,
      text: choice?.message?.content || '',
      finish_reason: this.mapFinishReason(choice?.finish_reason, 'openai', 'cohere'),
      meta: {
        billed_units: {
          input_tokens: response.usage?.prompt_tokens || 0,
          output_tokens: response.usage?.completion_tokens || 0,
        },
      },
    };

    return transformed;
  }

  /**
   * Map finish reasons between providers
   */
  private mapFinishReason(reason: string | undefined, sourceProvider: string, targetProvider: string): string {
    if (!reason) {
      return targetProvider === 'openai' ? 'stop' : 'end_turn';
    }

    const mappings: Record<string, Record<string, string>> = {
      'anthropic->openai': {
        'end_turn': 'stop',
        'max_tokens': 'length',
        'stop_sequence': 'stop',
      },
      'google->openai': {
        'STOP': 'stop',
        'MAX_TOKENS': 'length',
        'SAFETY': 'content_filter',
      },
      'cohere->openai': {
        'COMPLETE': 'stop',
        'MAX_TOKENS': 'length',
        'ERROR': 'stop',
      },
      'openai->anthropic': {
        'stop': 'end_turn',
        'length': 'max_tokens',
        'content_filter': 'end_turn',
      },
      'openai->google': {
        'stop': 'STOP',
        'length': 'MAX_TOKENS',
        'content_filter': 'SAFETY',
      },
      'openai->cohere': {
        'stop': 'COMPLETE',
        'length': 'MAX_TOKENS',
      },
    };

    const key = `${sourceProvider}->${targetProvider}`;
    const mapping = mappings[key];

    if (mapping && mapping[reason]) {
      return mapping[reason];
    }

    return reason;
  }

  /**
   * Transform streaming chunk
   */
  async transformStreamChunk(
    chunk: any,
    config: ResponseTransformationConfig
  ): Promise<ResponseTransformationResult> {
    // Similar to transform but for streaming chunks
    // Implementation would handle SSE format differences
    return this.transform(chunk, config);
  }
}

