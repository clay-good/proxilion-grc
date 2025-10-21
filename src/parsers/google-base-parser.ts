/**
 * Google Vertex AI Base Parser
 * Wrapper for GoogleParser that extends BaseParser
 */

import { BaseParser, ParserResult } from './base-parser.js';
import { GoogleParser } from './google-parser.js';
import { AIServiceProvider, ProxilionRequest } from '../types/index.js';

export class GoogleBaseParser extends BaseParser {
  provider: AIServiceProvider = AIServiceProvider.GOOGLE;
  private googleParser: GoogleParser;

  constructor() {
    super();
    this.googleParser = new GoogleParser();
  }

  canParse(request: ProxilionRequest): boolean {
    return this.googleParser.canParse(request.url);
  }

  async parse(request: ProxilionRequest): Promise<ParserResult> {
    try {
      // Create a Request object from ProxilionRequest
      const req = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
      });

      const unifiedRequest = await this.googleParser.parse(req);

      // Validate the request
      const validation = this.googleParser.validate(unifiedRequest);
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

