/**
 * Cohere Base Parser
 * Wrapper for CohereParser that extends BaseParser
 */

import { BaseParser, ParserResult } from './base-parser.js';
import { CohereParser } from './cohere-parser.js';
import { AIServiceProvider, ProxilionRequest } from '../types/index.js';

export class CohereBaseParser extends BaseParser {
  provider: AIServiceProvider = AIServiceProvider.COHERE;
  private cohereParser: CohereParser;

  constructor() {
    super();
    this.cohereParser = new CohereParser();
  }

  canParse(request: ProxilionRequest): boolean {
    return this.cohereParser.canParse(request.url);
  }

  async parse(request: ProxilionRequest): Promise<ParserResult> {
    try {
      // Create a Request object from ProxilionRequest
      const req = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
      });

      const unifiedRequest = await this.cohereParser.parse(req);

      // Validate the request
      const validation = this.cohereParser.validate(unifiedRequest);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
        };
      }

      return {
        success: true,
        unifiedRequest,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

