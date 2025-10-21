/**
 * Base parser interface for AI service protocol parsing
 */

import { UnifiedAIRequest, AIServiceProvider, ProxilionRequest } from '../types/index.js';

export interface ParserResult {
  success: boolean;
  unifiedRequest?: UnifiedAIRequest;
  error?: string;
}

export abstract class BaseParser {
  abstract provider: AIServiceProvider;

  abstract canParse(request: ProxilionRequest): boolean;

  abstract parse(request: ProxilionRequest): Promise<ParserResult>;

  protected generateCorrelationId(): string {
    return crypto.randomUUID();
  }

  protected extractApiKey(headers: Record<string, string>): string | undefined {
    return (
      headers['authorization']?.replace('Bearer ', '') ||
      headers['x-api-key'] ||
      headers['api-key']
    );
  }

  protected isStreamingRequest(body: unknown): boolean {
    if (typeof body === 'object' && body !== null) {
      return (body as { stream?: boolean }).stream === true;
    }
    return false;
  }
}

