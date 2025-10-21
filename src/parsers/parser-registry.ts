/**
 * Parser registry for managing multiple AI service parsers
 */

import { ProxilionRequest, UnifiedAIRequest } from '../types/index.js';
import { BaseParser, ParserResult } from './base-parser.js';
import { OpenAIParser } from './openai-parser.js';
import { AnthropicParser } from './anthropic-parser.js';
import { GoogleBaseParser } from './google-base-parser.js';
import { CohereBaseParser } from './cohere-base-parser.js';
import { logger } from '../utils/logger.js';

export class ParserRegistry {
  private parsers: BaseParser[] = [];

  constructor() {
    this.registerDefaultParsers();
  }

  private registerDefaultParsers(): void {
    this.register(new OpenAIParser());
    this.register(new AnthropicParser());
    this.register(new GoogleBaseParser());
    this.register(new CohereBaseParser());
  }

  register(parser: BaseParser): void {
    this.parsers.push(parser);
    logger.info(`Registered parser for ${parser.provider}`);
  }

  async parse(request: ProxilionRequest): Promise<UnifiedAIRequest | null> {
    for (const parser of this.parsers) {
      if (parser.canParse(request)) {
        logger.debug(`Using ${parser.provider} parser for request`);
        const result = await parser.parse(request);

        if (result.success && result.unifiedRequest) {
          return result.unifiedRequest;
        } else {
          logger.warn(`Parser ${parser.provider} failed`, { error: result.error });
        }
      }
    }

    logger.warn('No suitable parser found for request', {
      url: request.url,
      method: request.method,
    });

    return null;
  }

  getRegisteredParsers(): string[] {
    return this.parsers.map((p) => p.provider);
  }
}

