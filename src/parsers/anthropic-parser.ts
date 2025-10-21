/**
 * Anthropic API protocol parser
 */

import {
  UnifiedAIRequest,
  AIServiceProvider,
  ProxilionRequest,
  Message,
  GenerationParameters,
} from '../types/index.js';
import { BaseParser, ParserResult } from './base-parser.js';
import { logger } from '../utils/logger.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: unknown }>;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

export class AnthropicParser extends BaseParser {
  provider = AIServiceProvider.ANTHROPIC;

  canParse(request: ProxilionRequest): boolean {
    const url = request.url.toLowerCase();
    return (
      url.includes('api.anthropic.com') ||
      url.includes('/v1/messages') ||
      request.headers['anthropic-version'] !== undefined
    );
  }

  async parse(request: ProxilionRequest): Promise<ParserResult> {
    try {
      const body = request.body as AnthropicRequest;

      if (!body || !body.model || !body.messages) {
        return {
          success: false,
          error: 'Invalid Anthropic request: missing required fields',
        };
      }

      const messages = this.convertMessages(body.messages, body.system);

      const unifiedRequest: UnifiedAIRequest = {
        provider: this.provider,
        model: body.model,
        messages,
        parameters: this.extractParameters(body),
        streaming: body.stream || false,
        metadata: {
          correlationId: this.generateCorrelationId(),
          tags: {
            provider: this.provider,
            model: body.model,
          },
        },
      };

      logger.debug('Parsed Anthropic request', {
        model: body.model,
        messageCount: body.messages.length,
        streaming: body.stream,
      });

      return {
        success: true,
        unifiedRequest,
      };
    } catch (error) {
      logger.error('Failed to parse Anthropic request', error as Error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private convertMessages(messages: AnthropicMessage[], system?: string): Message[] {
    const converted: Message[] = [];

    // Add system message if present
    if (system) {
      converted.push({
        role: 'system',
        content: system,
      });
    }

    // Convert user and assistant messages
    for (const msg of messages) {
      const message: Message = {
        role: msg.role,
        content: '',
      };

      if (typeof msg.content === 'string') {
        message.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal content
        message.content = msg.content.map((part) => {
          if (part.type === 'text') {
            return {
              type: 'text' as const,
              text: part.text || '',
            };
          } else if (part.type === 'image') {
            return {
              type: 'image' as const,
              imageData: JSON.stringify(part.source),
            };
          }
          return { type: 'text' as const, text: '' };
        });
      }

      converted.push(message);
    }

    return converted;
  }

  private extractParameters(body: AnthropicRequest): GenerationParameters {
    return {
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      topP: body.top_p,
      topK: body.top_k,
      stopSequences: body.stop_sequences,
    };
  }
}

