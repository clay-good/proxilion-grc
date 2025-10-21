/**
 * Response Processor
 * 
 * Processes AI service responses with:
 * - Content scanning and filtering
 * - PII redaction
 * - Content transformation
 * - Response validation
 * - Streaming support
 */

import { ProxilionResponse, ThreatLevel, ScanResult, AIServiceProvider } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { PIIScanner } from '../scanners/pii-scanner.js';

export interface ResponseProcessingConfig {
  enablePIIRedaction: boolean;
  enableContentFiltering: boolean;
  enableValidation: boolean;
  redactionPlaceholder: string;
}

export interface ProcessedResponse {
  response: ProxilionResponse;
  modified: boolean;
  redactions: number;
  scanResults: ScanResult[];
}

export class ResponseProcessor {
  private config: ResponseProcessingConfig;
  private logger: Logger;
  private metrics: MetricsCollector;
  private piiScanner: PIIScanner;

  constructor(config: Partial<ResponseProcessingConfig> = {}) {
    this.config = {
      enablePIIRedaction: config.enablePIIRedaction ?? true,
      enableContentFiltering: config.enableContentFiltering ?? true,
      enableValidation: config.enableValidation ?? true,
      redactionPlaceholder: config.redactionPlaceholder || '[REDACTED]',
    };

    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.piiScanner = new PIIScanner();
  }

  /**
   * Process response
   */
  async process(response: ProxilionResponse): Promise<ProcessedResponse> {
    const startTime = Date.now();
    let modified = false;
    let redactions = 0;
    const scanResults: ScanResult[] = [];

    try {
      // Validate response structure
      if (this.config.enableValidation) {
        this.validateResponse(response);
      }

      // Extract text content from response
      const content = this.extractContent(response);

      if (content) {
        // Scan for PII
        if (this.config.enablePIIRedaction) {
          const scanResult = await this.piiScanner.scan({
            provider: AIServiceProvider.UNKNOWN,
            model: 'unknown',
            messages: [{ role: 'assistant', content }],
            parameters: {},
            streaming: false,
            metadata: {
              requestId: response.headers?.['x-request-id'] || 'unknown',
              timestamp: Date.now(),
              correlationId: response.headers?.['x-correlation-id'] || 'unknown',
            },
          });

          scanResults.push(scanResult);

          // Redact PII if found
          if (scanResult.findings.length > 0) {
            const redactedContent = this.redactPII(content, scanResult);
            this.replaceContent(response, redactedContent);
            modified = true;
            redactions = scanResult.findings.length;

            this.logger.info('PII redacted from response', {
              redactions,
              threatLevel: scanResult.threatLevel,
            });

            this.metrics.increment('response_pii_redacted_total', redactions);
          }
        }

        // Apply content filtering
        if (this.config.enableContentFiltering) {
          const filtered = this.filterContent(content);
          if (filtered !== content) {
            this.replaceContent(response, filtered);
            modified = true;
          }
        }
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('response_processing_duration_ms', duration);

      return {
        response,
        modified,
        redactions,
        scanResults,
      };
    } catch (error) {
      this.logger.error('Response processing failed', error instanceof Error ? error : undefined);

      this.metrics.increment('response_processing_error_total');

      throw error;
    }
  }

  /**
   * Validate response structure
   */
  private validateResponse(response: ProxilionResponse): void {
    if (!response) {
      throw new Error('Response is null or undefined');
    }

    if (response.status < 200 || response.status >= 600) {
      throw new Error(`Invalid response status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is missing');
    }
  }

  /**
   * Extract text content from response
   */
  private extractContent(response: ProxilionResponse): string | null {
    try {
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;

      // OpenAI format
      if (body.choices && Array.isArray(body.choices)) {
        const contents = body.choices
          .map((choice: any) => {
            if (choice.message?.content) {
              return choice.message.content;
            }
            if (choice.text) {
              return choice.text;
            }
            return null;
          })
          .filter(Boolean);

        return contents.join('\n');
      }

      // Anthropic format
      if (body.content && Array.isArray(body.content)) {
        const contents = body.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text);

        return contents.join('\n');
      }

      // Generic text response
      if (typeof body === 'string') {
        return body;
      }

      if (body.text) {
        return body.text;
      }

      if (body.content) {
        return typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to extract content from response', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Redact PII from content
   */
  private redactPII(content: string, scanResult: ScanResult): string {
    let redacted = content;

    // Define PII patterns to redact
    const piiPatterns = [
      { type: 'Email Address', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
      { type: 'Phone Number', pattern: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
      { type: 'Social Security Number', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
      { type: 'Credit Card Number', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
      { type: 'IP Address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    ];

    // Redact each PII type found in the scan results
    for (const finding of scanResult.findings) {
      const matchingPattern = piiPatterns.find(p => finding.type.includes(p.type));
      if (matchingPattern) {
        redacted = redacted.replace(matchingPattern.pattern, this.config.redactionPlaceholder);
      }
    }

    return redacted;
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Replace content in response
   */
  private replaceContent(response: ProxilionResponse, newContent: string): void {
    try {
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;

      // OpenAI format
      if (body.choices && Array.isArray(body.choices)) {
        body.choices.forEach((choice: any) => {
          if (choice.message?.content) {
            choice.message.content = newContent;
          }
          if (choice.text) {
            choice.text = newContent;
          }
        });
      }

      // Anthropic format
      else if (body.content && Array.isArray(body.content)) {
        body.content = body.content.map((item: any) => {
          if (item.type === 'text') {
            return { ...item, text: newContent };
          }
          return item;
        });
      }

      // Generic format
      else if (body.text) {
        body.text = newContent;
      } else if (body.content) {
        body.content = newContent;
      }

      response.body = JSON.stringify(body);
    } catch (error) {
      this.logger.error('Failed to replace content in response', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Filter inappropriate content
   */
  private filterContent(content: string): string {
    // Placeholder for content filtering logic
    // In production, this would use ML models or rule-based filtering
    return content;
  }

  /**
   * Process streaming response chunk
   */
  async processStreamChunk(chunk: string): Promise<string> {
    // For streaming responses, we need to process each chunk
    // This is a simplified version - production would need more sophisticated handling

    if (!this.config.enablePIIRedaction) {
      return chunk;
    }

    try {
      // Parse SSE chunk
      const lines = chunk.split('\n');
      const processedLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);

          if (data === '[DONE]') {
            processedLines.push(line);
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const content = this.extractContent({ status: 200, body: parsed, headers: {} });

            if (content) {
              // Quick PII check (simplified for streaming)
              const hasEmail = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content);
              const hasCreditCard = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(content);

              if (hasEmail || hasCreditCard) {
                this.logger.warn('PII detected in streaming response chunk');
                this.metrics.increment('stream_chunk_pii_detected_total');
                // In production, you might want to redact or block the stream
              }
            }
          } catch (e) {
            // Not JSON, skip
          }
        }

        processedLines.push(line);
      }

      return processedLines.join('\n');
    } catch (error) {
      this.logger.error('Failed to process stream chunk', error instanceof Error ? error : undefined);
      return chunk;
    }
  }
}

