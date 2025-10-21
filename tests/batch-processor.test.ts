import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchProcessingManager, BatchRequest, BatchProcessor } from '../src/batch/batch-processor.js';
import { UnifiedAIRequest, UnifiedAIResponse, AIServiceProvider } from '../src/types/index.js';

describe('BatchProcessingManager', () => {
  let batchManager: BatchProcessingManager;

  beforeEach(() => {
    batchManager = new BatchProcessingManager();
  });

  const createTestRequest = (id: string): UnifiedAIRequest => ({
    provider: AIServiceProvider.OPENAI,
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content: `Test message ${id}`,
      },
    ],
    temperature: 0.7,
    maxTokens: 100,
    metadata: {
      correlationId: id,
    },
  });

  const createSuccessProcessor = (delay: number = 10): BatchProcessor => {
    return async (request: UnifiedAIRequest): Promise<UnifiedAIResponse> => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return {
        provider: request.provider,
        model: request.model,
        content: `Response for ${request.metadata.correlationId}`,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };
    };
  };

  const createFailingProcessor = (failureRate: number = 1.0): BatchProcessor => {
    let callCount = 0;
    return async (request: UnifiedAIRequest): Promise<UnifiedAIResponse> => {
      callCount++;
      if (Math.random() < failureRate) {
        throw new Error(`Processing failed for ${request.metadata.correlationId}`);
      }
      return {
        provider: request.provider,
        model: request.model,
        content: `Response for ${request.metadata.correlationId}`,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      };
    };
  };

  describe('Batch Creation', () => {
    it('should create batch from requests', () => {
      const requests = [
        createTestRequest('req-1'),
        createTestRequest('req-2'),
        createTestRequest('req-3'),
      ];

      const batch = BatchProcessingManager.createBatch(requests);

      expect(batch.id).toBeDefined();
      expect(batch.requests).toHaveLength(3);
      expect(batch.requests).toEqual(requests);
    });

    it('should create batch with options', () => {
      const requests = [createTestRequest('req-1')];
      const options = {
        maxConcurrency: 5,
        continueOnError: false,
      };

      const batch = BatchProcessingManager.createBatch(requests, options);

      expect(batch.options).toEqual(options);
    });
  });

  describe('Batch Processing', () => {
    it('should process batch successfully', async () => {
      const requests = [
        createTestRequest('req-1'),
        createTestRequest('req-2'),
        createTestRequest('req-3'),
      ];

      const batch = BatchProcessingManager.createBatch(requests);
      const processor = createSuccessProcessor();

      const result = await batchManager.processBatch(batch, processor);

      expect(result.batchId).toBe(batch.id);
      expect(result.totalRequests).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should maintain request order in results', async () => {
      const requests = [
        createTestRequest('req-1'),
        createTestRequest('req-2'),
        createTestRequest('req-3'),
      ];

      const batch = BatchProcessingManager.createBatch(requests);
      const processor = createSuccessProcessor();

      const result = await batchManager.processBatch(batch, processor);

      expect(result.results[0].requestId).toBe('req-1');
      expect(result.results[1].requestId).toBe('req-2');
      expect(result.results[2].requestId).toBe('req-3');
    });

    it('should process empty batch', async () => {
      const batch = BatchProcessingManager.createBatch([]);
      const processor = createSuccessProcessor();

      const result = await batchManager.processBatch(batch, processor);

      expect(result.totalRequests).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });

    it('should process large batch', async () => {
      const requests = Array.from({ length: 50 }, (_, i) =>
        createTestRequest(`req-${i}`)
      );

      const batch = BatchProcessingManager.createBatch(requests);
      const processor = createSuccessProcessor(5);

      const result = await batchManager.processBatch(batch, processor);

      expect(result.totalRequests).toBe(50);
      expect(result.successCount).toBe(50);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect max concurrency', async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        createTestRequest(`req-${i}`)
      );

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const processor: BatchProcessor = async (request) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(resolve => setTimeout(resolve, 50));
        currentConcurrent--;
        return {
          provider: request.provider,
          model: request.model,
          content: 'Response',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        };
      };

      const batch = BatchProcessingManager.createBatch(requests, {
        maxConcurrency: 5,
      });

      await batchManager.processBatch(batch, processor);

      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });

    it('should process with default concurrency', async () => {
      const requests = Array.from({ length: 15 }, (_, i) =>
        createTestRequest(`req-${i}`)
      );

      const batch = BatchProcessingManager.createBatch(requests);
      const processor = createSuccessProcessor(10);

      const result = await batchManager.processBatch(batch, processor);

      expect(result.successCount).toBe(15);
    });
  });

  describe('Error Handling', () => {
    it('should handle failures with continueOnError', async () => {
      const requests = [
        createTestRequest('req-1'),
        createTestRequest('req-2'),
        createTestRequest('req-3'),
      ];

      const batch = BatchProcessingManager.createBatch(requests, {
        continueOnError: true,
        retryFailures: false,
      });

      const processor = createFailingProcessor(1.0); // Always fail

      const result = await batchManager.processBatch(batch, processor);

      expect(result.totalRequests).toBe(3);
      expect(result.failureCount).toBe(3);
      expect(result.successCount).toBe(0);
    });

    it('should include error messages in failed results', async () => {
      const requests = [createTestRequest('req-1')];

      const batch = BatchProcessingManager.createBatch(requests, {
        retryFailures: false,
      });

      const processor = createFailingProcessor(1.0);

      const result = await batchManager.processBatch(batch, processor);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBeDefined();
      expect(result.results[0].error).toContain('Processing failed');
    });

    it('should handle partial failures', async () => {
      const requests = [
        createTestRequest('req-1'),
        createTestRequest('req-2'),
        createTestRequest('req-3'),
      ];

      const batch = BatchProcessingManager.createBatch(requests, {
        retryFailures: false,
      });

      const processor = createFailingProcessor(0.5); // 50% failure rate

      const result = await batchManager.processBatch(batch, processor);

      expect(result.totalRequests).toBe(3);
      expect(result.successCount + result.failureCount).toBe(3);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed requests', async () => {
      const requests = [createTestRequest('req-1')];
      let attemptCount = 0;

      const processor: BatchProcessor = async (request) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return {
          provider: request.provider,
          model: request.model,
          content: 'Success after retries',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        };
      };

      const batch = BatchProcessingManager.createBatch(requests, {
        retryFailures: true,
        maxRetries: 3,
      });

      const result = await batchManager.processBatch(batch, processor);

      expect(result.successCount).toBe(1);
      expect(result.results[0].retries).toBeGreaterThan(0);
    });

    it('should respect max retries', async () => {
      const requests = [createTestRequest('req-1')];

      const batch = BatchProcessingManager.createBatch(requests, {
        retryFailures: true,
        maxRetries: 2,
      });

      const processor = createFailingProcessor(1.0);

      const result = await batchManager.processBatch(batch, processor);

      expect(result.failureCount).toBe(1);
      expect(result.results[0].retries).toBe(2);
    });

    it('should not retry when disabled', async () => {
      const requests = [createTestRequest('req-1')];

      const batch = BatchProcessingManager.createBatch(requests, {
        retryFailures: false,
      });

      const processor = createFailingProcessor(1.0);

      const result = await batchManager.processBatch(batch, processor);

      expect(result.results[0].retries).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout slow requests', async () => {
      const requests = [createTestRequest('req-1')];

      const processor: BatchProcessor = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return {
          provider: AIServiceProvider.OPENAI,
          model: 'gpt-4',
          content: 'Response',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        };
      };

      const batch = BatchProcessingManager.createBatch(requests, {
        timeout: 50,
        retryFailures: false,
      });

      const result = await batchManager.processBatch(batch, processor);

      expect(result.failureCount).toBe(1);
      expect(result.results[0].error).toContain('timeout');
    });
  });

  describe('Batch Splitting', () => {
    it('should split batch into chunks', () => {
      const requests = Array.from({ length: 25 }, (_, i) =>
        createTestRequest(`req-${i}`)
      );

      const batch = BatchProcessingManager.createBatch(requests);
      const chunks = BatchProcessingManager.splitBatch(batch, 10);

      expect(chunks).toHaveLength(3);
      expect(chunks[0].requests).toHaveLength(10);
      expect(chunks[1].requests).toHaveLength(10);
      expect(chunks[2].requests).toHaveLength(5);
    });

    it('should preserve batch options in chunks', () => {
      const requests = Array.from({ length: 15 }, (_, i) =>
        createTestRequest(`req-${i}`)
      );

      const options = { maxConcurrency: 5 };
      const batch = BatchProcessingManager.createBatch(requests, options);
      const chunks = BatchProcessingManager.splitBatch(batch, 10);

      expect(chunks[0].options).toEqual(options);
      expect(chunks[1].options).toEqual(options);
    });
  });

  describe('Batch Merging', () => {
    it('should merge batch results', async () => {
      const batch1 = BatchProcessingManager.createBatch([
        createTestRequest('req-1'),
        createTestRequest('req-2'),
      ]);

      const batch2 = BatchProcessingManager.createBatch([
        createTestRequest('req-3'),
        createTestRequest('req-4'),
      ]);

      const processor = createSuccessProcessor();

      const result1 = await batchManager.processBatch(batch1, processor);
      const result2 = await batchManager.processBatch(batch2, processor);

      const merged = BatchProcessingManager.mergeBatchResults([result1, result2]);

      expect(merged.totalRequests).toBe(4);
      expect(merged.successCount).toBe(4);
      expect(merged.results).toHaveLength(4);
    });

    it('should throw error when merging empty results', () => {
      expect(() => BatchProcessingManager.mergeBatchResults([])).toThrow();
    });
  });

  describe('Progress Tracking', () => {
    it('should track batch progress', async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        createTestRequest(`req-${i}`)
      );

      const batch = BatchProcessingManager.createBatch(requests, {
        maxConcurrency: 5,
      });
      const processor = createSuccessProcessor(100);

      const processingPromise = batchManager.processBatch(batch, processor);

      // Check progress during processing
      await new Promise(resolve => setTimeout(resolve, 50));
      const progress = batchManager.getBatchProgress(batch.id);

      if (progress) {
        expect(progress.totalRequests).toBe(20);
        expect(progress.completedRequests).toBeGreaterThanOrEqual(0);
        expect(progress.completedRequests).toBeLessThanOrEqual(20);
      }

      await processingPromise;
    });

    it('should list active batches', async () => {
      const batch = BatchProcessingManager.createBatch([
        createTestRequest('req-1'),
      ]);

      const processor = createSuccessProcessor(100);
      const processingPromise = batchManager.processBatch(batch, processor);

      const activeBatches = batchManager.getActiveBatches();
      expect(activeBatches).toContain(batch.id);

      await processingPromise;
    });

    it('should remove completed batches from active list', async () => {
      const batch = BatchProcessingManager.createBatch([
        createTestRequest('req-1'),
      ]);

      const processor = createSuccessProcessor();
      await batchManager.processBatch(batch, processor);

      const activeBatches = batchManager.getActiveBatches();
      expect(activeBatches).not.toContain(batch.id);
    });
  });
});

