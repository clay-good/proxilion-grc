/**
 * Batch Processing System
 * 
 * Handles high-volume batch processing of AI requests with
 * parallel execution, error handling, and progress tracking.
 */

import { Logger } from '../utils/logger.js';
import { UnifiedAIRequest, UnifiedAIResponse, AIServiceProvider } from '../types/index.js';

export interface BatchRequest {
  id: string;
  requests: UnifiedAIRequest[];
  options?: BatchOptions;
}

export interface BatchOptions {
  maxConcurrency?: number;
  continueOnError?: boolean;
  timeout?: number;
  retryFailures?: boolean;
  maxRetries?: number;
}

export interface BatchResult {
  batchId: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  results: BatchItemResult[];
  startTime: number;
  endTime: number;
  duration: number;
}

export interface BatchItemResult {
  index: number;
  requestId: string;
  success: boolean;
  response?: UnifiedAIResponse;
  error?: string;
  duration: number;
  retries: number;
}

export type BatchProcessor = (request: UnifiedAIRequest) => Promise<UnifiedAIResponse>;

export class BatchProcessingManager {
  private logger: Logger;
  private activeBatches: Map<string, BatchProgress> = new Map();

  constructor() {
    this.logger = new Logger();
  }

  /**
   * Process a batch of requests
   */
  async processBatch(
    batch: BatchRequest,
    processor: BatchProcessor
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const batchId = batch.id;

    this.logger.info('Starting batch processing', {
      batchId,
      requestCount: batch.requests.length,
    });

    // Initialize batch progress tracking
    const progress: BatchProgress = {
      batchId,
      totalRequests: batch.requests.length,
      completedRequests: 0,
      failedRequests: 0,
      startTime,
    };
    this.activeBatches.set(batchId, progress);

    const options: Required<BatchOptions> = {
      maxConcurrency: batch.options?.maxConcurrency ?? 10,
      continueOnError: batch.options?.continueOnError ?? true,
      timeout: batch.options?.timeout ?? 30000,
      retryFailures: batch.options?.retryFailures ?? true,
      maxRetries: batch.options?.maxRetries ?? 2,
    };

    try {
      const results = await this.processWithConcurrency(
        batch.requests,
        processor,
        options,
        progress
      );

      const endTime = Date.now();
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      const batchResult: BatchResult = {
        batchId,
        totalRequests: batch.requests.length,
        successCount,
        failureCount,
        results,
        startTime,
        endTime,
        duration: endTime - startTime,
      };

      this.logger.info('Batch processing completed', {
        batchId,
        successCount,
        failureCount,
        duration: batchResult.duration,
      });

      this.activeBatches.delete(batchId);
      return batchResult;
    } catch (error) {
      this.logger.error('Batch processing failed', error instanceof Error ? error : undefined, { batchId });
      this.activeBatches.delete(batchId);
      throw error;
    }
  }

  /**
   * Process requests with controlled concurrency
   */
  private async processWithConcurrency(
    requests: UnifiedAIRequest[],
    processor: BatchProcessor,
    options: Required<BatchOptions>,
    progress: BatchProgress
  ): Promise<BatchItemResult[]> {
    const results: BatchItemResult[] = [];
    const queue = requests.map((req, index) => ({ req, index }));
    const inProgress = new Map<number, Promise<void>>();

    while (queue.length > 0 || inProgress.size > 0) {
      // Start new tasks up to max concurrency
      while (queue.length > 0 && inProgress.size < options.maxConcurrency) {
        const item = queue.shift()!;
        const taskId = item.index;

        const task = this.processItem(
          item.req,
          item.index,
          processor,
          options,
          progress
        ).then(result => {
          results.push(result);
          inProgress.delete(taskId);
        }).catch(error => {
          // Error already handled in processItem, just remove from tracking
          inProgress.delete(taskId);
        });

        inProgress.set(taskId, task);
      }

      // Wait for at least one task to complete
      if (inProgress.size > 0) {
        await Promise.race(Array.from(inProgress.values()));
      }
    }

    // Sort results by index to maintain order
    return results.sort((a, b) => a.index - b.index);
  }

  /**
   * Process a single item with retry logic
   */
  private async processItem(
    request: UnifiedAIRequest,
    index: number,
    processor: BatchProcessor,
    options: Required<BatchOptions>,
    progress: BatchProgress
  ): Promise<BatchItemResult> {
    const requestId = request.metadata.correlationId;
    const startTime = Date.now();
    let retries = 0;
    let lastError: Error | undefined;

    const maxAttempts = options.retryFailures ? options.maxRetries + 1 : 1;

    while (retries < maxAttempts) {
      try {
        const response = await this.processWithTimeout(
          request,
          processor,
          options.timeout
        );

        progress.completedRequests++;

        return {
          index,
          requestId,
          success: true,
          response,
          duration: Date.now() - startTime,
          retries,
        };
      } catch (error) {
        lastError = error as Error;

        if (retries < maxAttempts - 1) {
          retries++;
          this.logger.warn('Batch item failed, retrying', {
            requestId,
            attempt: retries + 1,
            error: lastError.message,
          });
          // Exponential backoff
          await this.delay(Math.min(1000 * Math.pow(2, retries - 1), 10000));
        } else {
          break;
        }
      }
    }

    // All retries exhausted
    progress.completedRequests++;
    progress.failedRequests++;

    this.logger.error('Batch item failed after retries', lastError, {
      requestId,
      retries,
    });

    return {
      index,
      requestId,
      success: false,
      error: lastError?.message || 'Unknown error',
      duration: Date.now() - startTime,
      retries,
    };
  }

  /**
   * Process request with timeout
   */
  private async processWithTimeout(
    request: UnifiedAIRequest,
    processor: BatchProcessor,
    timeout: number
  ): Promise<UnifiedAIResponse> {
    return Promise.race([
      processor(request),
      new Promise<UnifiedAIResponse>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  }

  /**
   * Check if promise is settled
   */
  private async isPromiseSettled(promise: Promise<void>): Promise<boolean> {
    try {
      await Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, 0)),
      ]);
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get batch progress
   */
  getBatchProgress(batchId: string): BatchProgress | undefined {
    return this.activeBatches.get(batchId);
  }

  /**
   * Get all active batches
   */
  getActiveBatches(): string[] {
    return Array.from(this.activeBatches.keys());
  }

  /**
   * Cancel batch processing
   */
  cancelBatch(batchId: string): boolean {
    if (this.activeBatches.has(batchId)) {
      this.activeBatches.delete(batchId);
      this.logger.info('Batch processing cancelled', { batchId });
      return true;
    }
    return false;
  }

  /**
   * Create batch from requests
   */
  static createBatch(
    requests: UnifiedAIRequest[],
    options?: BatchOptions
  ): BatchRequest {
    return {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      requests,
      options,
    };
  }

  /**
   * Split large batch into smaller chunks
   */
  static splitBatch(
    batch: BatchRequest,
    chunkSize: number
  ): BatchRequest[] {
    const chunks: BatchRequest[] = [];
    
    for (let i = 0; i < batch.requests.length; i += chunkSize) {
      const chunkRequests = batch.requests.slice(i, i + chunkSize);
      chunks.push({
        id: `${batch.id}-chunk-${Math.floor(i / chunkSize)}`,
        requests: chunkRequests,
        options: batch.options,
      });
    }

    return chunks;
  }

  /**
   * Merge batch results
   */
  static mergeBatchResults(results: BatchResult[]): BatchResult {
    if (results.length === 0) {
      throw new Error('No results to merge');
    }

    const allResults: BatchItemResult[] = [];
    let totalSuccess = 0;
    let totalFailure = 0;
    let minStartTime = Infinity;
    let maxEndTime = 0;

    for (const result of results) {
      allResults.push(...result.results);
      totalSuccess += result.successCount;
      totalFailure += result.failureCount;
      minStartTime = Math.min(minStartTime, result.startTime);
      maxEndTime = Math.max(maxEndTime, result.endTime);
    }

    return {
      batchId: `merged-${results[0].batchId}`,
      totalRequests: allResults.length,
      successCount: totalSuccess,
      failureCount: totalFailure,
      results: allResults,
      startTime: minStartTime,
      endTime: maxEndTime,
      duration: maxEndTime - minStartTime,
    };
  }
}

interface BatchProgress {
  batchId: string;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  startTime: number;
}

