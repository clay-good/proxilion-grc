/**
 * Streaming Response Processor
 * 
 * Handles Server-Sent Events (SSE) streaming responses with:
 * - Real-time security scanning of chunks
 * - PII detection and redaction in streams
 * - Content buffering and context maintenance
 * - Backpressure handling
 * - Error recovery
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { PIIScanner } from '../scanners/pii-scanner.js';
import { ToxicityScanner } from '../scanners/toxicity-scanner.js';
import { Finding, ThreatLevel, AIServiceProvider } from '../types/index.js';

export interface StreamProcessorConfig {
  enablePIIRedaction: boolean;
  enableToxicityScanning: boolean;
  bufferSize: number; // Size of sliding window buffer
  chunkTimeout: number; // Timeout for chunk processing
  maxBufferedChunks: number; // Max chunks to buffer
}

export interface StreamChunk {
  data: string;
  timestamp: number;
  index: number;
}

export interface StreamScanResult {
  findings: Finding[];
  threatLevel: ThreatLevel;
  redacted: boolean;
  originalChunk: string;
  processedChunk: string;
}

export class StreamProcessor {
  private logger: Logger;
  private metrics: MetricsCollector;
  private piiScanner: PIIScanner;
  private toxicityScanner: ToxicityScanner;
  private config: Required<StreamProcessorConfig>;
  private buffer: string[] = [];
  private chunkIndex = 0;

  constructor(config: Partial<StreamProcessorConfig> = {}) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    this.piiScanner = new PIIScanner();
    this.toxicityScanner = new ToxicityScanner();
    
    this.config = {
      enablePIIRedaction: config.enablePIIRedaction ?? true,
      enableToxicityScanning: config.enableToxicityScanning ?? true,
      bufferSize: config.bufferSize ?? 1024, // 1KB sliding window
      chunkTimeout: config.chunkTimeout ?? 5000, // 5 seconds
      maxBufferedChunks: config.maxBufferedChunks ?? 100,
    };
  }

  /**
   * Process a streaming response
   * Returns a ReadableStream that can be piped to the client
   */
  processStream(
    sourceStream: ReadableStream<Uint8Array>,
    correlationId: string
  ): ReadableStream<Uint8Array> {
    const self = this;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    
    let buffer = '';
    let chunkCount = 0;
    const startTime = Date.now();

    return new ReadableStream({
      async start(controller) {
        self.logger.info('Starting stream processing', { correlationId });
        self.metrics.increment('stream_processing_started_total');
      },

      async pull(controller) {
        const reader = sourceStream.getReader();
        
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            // Process any remaining buffer
            if (buffer) {
              const processed = await self.processChunk(buffer, correlationId, chunkCount++);
              controller.enqueue(encoder.encode(processed.processedChunk));
            }
            
            const duration = Date.now() - startTime;
            self.logger.info('Stream processing completed', {
              correlationId,
              duration,
              chunks: chunkCount,
            });
            self.metrics.histogram('stream_processing_duration_ms', duration);
            self.metrics.counter('stream_processing_completed_total');
            
            controller.close();
            return;
          }

          // Decode chunk
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete SSE events
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // Keep incomplete event in buffer

          for (const event of events) {
            if (event.trim()) {
              const processed = await self.processChunk(event + '\n\n', correlationId, chunkCount++);
              
              // Enqueue processed chunk
              controller.enqueue(encoder.encode(processed.processedChunk));
              
              // Log findings
              if (processed.findings.length > 0) {
                self.logger.warn('Security findings in stream chunk', {
                  correlationId,
                  chunkIndex: chunkCount - 1,
                  findings: processed.findings.length,
                  threatLevel: processed.threatLevel,
                });
              }
            }
          }
        } catch (error) {
          self.logger.error('Stream processing error', error instanceof Error ? error : undefined, {
            correlationId,
          });
          self.metrics.increment('stream_processing_error_total');
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },

      cancel(reason) {
        self.logger.info('Stream processing cancelled', { correlationId, reason });
        self.metrics.increment('stream_processing_cancelled_total');
      },
    });
  }

  /**
   * Process a single chunk
   */
  async processChunk(
    chunk: string,
    correlationId: string,
    index: number
  ): Promise<StreamScanResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];
    let threatLevel: ThreatLevel = ThreatLevel.NONE;
    let processedChunk = chunk;
    let redacted = false;

    try {
      // Parse SSE format
      const lines = chunk.split('\n');
      const dataLines = lines.filter(line => line.startsWith('data: '));
      
      if (dataLines.length === 0) {
        // No data lines, return as-is
        return {
          findings: [],
          threatLevel: ThreatLevel.NONE,
          redacted: false,
          originalChunk: chunk,
          processedChunk: chunk,
        };
      }

      // Extract content from data lines
      let content = '';
      let jsonData: any = null;

      for (const line of dataLines) {
        const data = line.substring(6); // Remove 'data: ' prefix
        
        if (data === '[DONE]') {
          continue;
        }

        try {
          jsonData = JSON.parse(data);
          
          // Extract text content based on provider format
          const extractedContent = this.extractContentFromChunk(jsonData);
          if (extractedContent) {
            content += extractedContent;
          }
        } catch (e) {
          // Not JSON, treat as plain text
          content += data;
        }
      }

      if (!content) {
        // No content to scan
        return {
          findings: [],
          threatLevel: ThreatLevel.NONE,
          redacted: false,
          originalChunk: chunk,
          processedChunk: chunk,
        };
      }

      // Add to sliding window buffer
      this.buffer.push(content);
      if (this.buffer.length > this.config.maxBufferedChunks) {
        this.buffer.shift();
      }

      // Get context from buffer (last N characters)
      const context = this.buffer.join('').slice(-this.config.bufferSize);

      // Scan for PII
      if (this.config.enablePIIRedaction) {
        const piiResult = await this.piiScanner.scan({
          provider: AIServiceProvider.UNKNOWN,
          model: 'unknown',
          messages: [{ role: 'assistant', content: context }],
          parameters: {},
          streaming: true,
          metadata: { correlationId, requestId: correlationId, timestamp: Date.now() },
        });

        if (piiResult.findings.length > 0) {
          findings.push(...piiResult.findings);
          threatLevel = this.maxThreatLevel(threatLevel, piiResult.threatLevel);
          
          // Redact PII in current chunk
          processedChunk = this.redactPIIInChunk(chunk, content, piiResult.findings);
          redacted = true;
          
          this.metrics.increment('stream_chunk_pii_detected_total');
        }
      }

      // Scan for toxicity
      if (this.config.enableToxicityScanning) {
        const toxicityResult = await this.toxicityScanner.scan({
          provider: AIServiceProvider.UNKNOWN,
          model: 'unknown',
          messages: [{ role: 'assistant', content: context }],
          parameters: {},
          streaming: true,
          metadata: { correlationId, requestId: correlationId, timestamp: Date.now() },
        });

        if (toxicityResult.findings.length > 0) {
          findings.push(...toxicityResult.findings);
          threatLevel = this.maxThreatLevel(threatLevel, toxicityResult.threatLevel);
          
          this.metrics.increment('stream_chunk_toxicity_detected_total');
        }
      }

      const duration = Date.now() - startTime;
      this.metrics.histogram('stream_chunk_processing_duration_ms', duration);

      return {
        findings,
        threatLevel,
        redacted,
        originalChunk: chunk,
        processedChunk,
      };
    } catch (error) {
      this.logger.error('Chunk processing error', error instanceof Error ? error : undefined, {
        correlationId,
        index,
      });
      
      this.metrics.increment('stream_chunk_processing_error_total');
      
      // Return original chunk on error
      return {
        findings: [],
        threatLevel: ThreatLevel.NONE,
        redacted: false,
        originalChunk: chunk,
        processedChunk: chunk,
      };
    }
  }

  /**
   * Extract content from chunk based on provider format
   */
  private extractContentFromChunk(data: any): string | null {
    // OpenAI format
    if (data.choices && Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        if (choice.delta?.content) {
          return choice.delta.content;
        }
        if (choice.text) {
          return choice.text;
        }
      }
    }

    // Anthropic format
    if (data.type === 'content_block_delta' && data.delta?.text) {
      return data.delta.text;
    }

    // Google format
    if (data.candidates && Array.isArray(data.candidates)) {
      for (const candidate of data.candidates) {
        if (candidate.content?.parts) {
          return candidate.content.parts.map((p: any) => p.text).join('');
        }
      }
    }

    return null;
  }

  /**
   * Redact PII in chunk
   */
  private redactPIIInChunk(chunk: string, content: string, findings: Finding[]): string {
    let redactedContent = content;

    for (const finding of findings) {
      if (finding.type.startsWith('pii_')) {
        // Simple redaction - replace with [REDACTED]
        // In production, you'd want more sophisticated pattern matching
        const patterns = this.getPIIPatterns(finding.type);
        for (const pattern of patterns) {
          redactedContent = redactedContent.replace(pattern, '[REDACTED]');
        }
      }
    }

    // Replace content in chunk
    return chunk.replace(content, redactedContent);
  }

  /**
   * Get PII patterns for redaction
   */
  private getPIIPatterns(type: string): RegExp[] {
    const patterns: RegExp[] = [];

    switch (type) {
      case 'pii_email':
        patterns.push(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        break;
      case 'pii_phone':
        patterns.push(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g);
        patterns.push(/\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g);
        break;
      case 'pii_ssn':
        patterns.push(/\b\d{3}-\d{2}-\d{4}\b/g);
        break;
      case 'pii_credit_card':
        patterns.push(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g);
        break;
    }

    return patterns;
  }

  /**
   * Get maximum threat level
   */
  private maxThreatLevel(a: ThreatLevel, b: ThreatLevel): ThreatLevel {
    const levels: ThreatLevel[] = [ThreatLevel.NONE, ThreatLevel.LOW, ThreatLevel.MEDIUM, ThreatLevel.HIGH, ThreatLevel.CRITICAL];
    const aIndex = levels.indexOf(a);
    const bIndex = levels.indexOf(b);
    return levels[Math.max(aIndex, bIndex)];
  }

  /**
   * Reset buffer
   */
  reset(): void {
    this.buffer = [];
    this.chunkIndex = 0;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      chunkIndex: this.chunkIndex,
      config: this.config,
    };
  }
}

