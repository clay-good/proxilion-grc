/**
 * OpenAI API protocol parser
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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  tool_call_id?: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export class OpenAIParser extends BaseParser {
  provider = AIServiceProvider.OPENAI;

  canParse(request: ProxilionRequest): boolean {
    const url = request.url.toLowerCase();
    return (
      url.includes('api.openai.com') ||
      url.includes('/v1/chat/completions') ||
      url.includes('/v1/completions')
    );
  }

  async parse(request: ProxilionRequest): Promise<ParserResult> {
    try {
      const body = request.body as OpenAIRequest;

      if (!body || !body.model || !body.messages) {
        return {
          success: false,
          error: 'Invalid OpenAI request: missing required fields',
        };
      }

      const unifiedRequest: UnifiedAIRequest = {
        provider: this.provider,
        model: body.model,
        messages: this.convertMessages(body.messages),
        parameters: this.extractParameters(body),
        streaming: body.stream || false,
        tools: body.tools?.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        })),
        metadata: {
          correlationId: this.generateCorrelationId(),
          tags: {
            provider: this.provider,
            model: body.model,
          },
        },
      };

      logger.debug('Parsed OpenAI request', {
        model: body.model,
        messageCount: body.messages.length,
        streaming: body.stream,
      });

      return {
        success: true,
        unifiedRequest,
      };
    } catch (error) {
      logger.error('Failed to parse OpenAI request', error as Error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private convertMessages(messages: OpenAIMessage[]): Message[] {
    return messages.map((msg) => {
      const converted: Message = {
        role: msg.role,
        content: '',
      };

      if (typeof msg.content === 'string') {
        converted.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal content
        converted.content = msg.content.map((part) => {
          if (part.type === 'text') {
            return {
              type: 'text' as const,
              text: part.text || '',
            };
          } else if (part.type === 'image_url') {
            return {
              type: 'image' as const,
              imageUrl: part.image_url?.url,
            };
          }
          return { type: 'text' as const, text: '' };
        });
      }

      if (msg.name) {
        converted.name = msg.name;
      }

      if (msg.tool_call_id) {
        converted.toolCallId = msg.tool_call_id;
      }

      return converted;
    });
  }

  private extractParameters(body: OpenAIRequest): GenerationParameters {
    return {
      temperature: body.temperature,
      maxTokens: body.max_tokens,
      topP: body.top_p,
      frequencyPenalty: body.frequency_penalty,
      presencePenalty: body.presence_penalty,
      stopSequences: Array.isArray(body.stop) ? body.stop : body.stop ? [body.stop] : undefined,
    };
  }
}

