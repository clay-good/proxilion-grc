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
  private parserIndex: Map<string, BaseParser> = new Map();

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
    this.buildParserIndex(parser);
    logger.info(`Registered parser for ${parser.provider}`);
  }

  /**
   * Build index for O(1) parser lookup based on URL patterns
   */
  private buildParserIndex(parser: BaseParser): void {
    // Extract common URL patterns for each provider
    const patterns = this.getProviderPatterns(parser.provider);
    patterns.forEach(pattern => {
      this.parserIndex.set(pattern, parser);
    });
  }

  /**
   * Get URL patterns for provider-based routing
   */
  private getProviderPatterns(provider: string): string[] {
    const patterns: string[] = [];

    switch (provider) {
      case 'openai':
        patterns.push('api.openai.com', 'openai.com');
        break;
      case 'anthropic':
        patterns.push('api.anthropic.com', 'anthropic.com');
        break;
      case 'google':
        patterns.push('generativelanguage.googleapis.com', 'googleapis.com');
        break;
      case 'cohere':
        patterns.push('api.cohere.ai', 'cohere.ai');
        break;
    }

    return patterns;
  }

  /**
   * Extract URL key for indexed lookup
   */
  private extractUrlKey(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return '';
    }
  }

  async parse(request: ProxilionRequest): Promise<UnifiedAIRequest | null> {
    // Try O(1) indexed lookup first
    const urlKey = this.extractUrlKey(request.url);
    const indexedParser = this.parserIndex.get(urlKey);

    if (indexedParser && indexedParser.canParse(request)) {
      logger.debug(`Using indexed ${indexedParser.provider} parser for request`);
      const result = await indexedParser.parse(request);

      if (result.success && result.unifiedRequest) {
        return result.unifiedRequest;
      }
    }

    // Fallback to linear search for custom/unknown providers
    for (const parser of this.parsers) {
      if (parser === indexedParser) continue; // Skip already tried parser

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

