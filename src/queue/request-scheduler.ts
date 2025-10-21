/**
 * Request Scheduler
 * 
 * Intelligent request scheduler with:
 * - Automatic request processing
 * - Fairness across users and tenants
 * - Adaptive concurrency
 * - Batch processing
 * - Retry logic
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';
import { PriorityQueueManager, QueuedRequest, PriorityLevel } from './priority-queue-manager.js';

export type SchedulerStrategy = 'fifo' | 'priority' | 'fair' | 'adaptive';

export interface SchedulerConfig {
  strategy: SchedulerStrategy;
  minConcurrency: number;      // Minimum concurrent requests
  maxConcurrency: number;      // Maximum concurrent requests
  targetLatency: number;       // Target latency in ms
  adaptiveInterval: number;    // Interval for adaptive adjustments (ms)
  enableBatching: boolean;     // Enable batch processing
  batchSize: number;           // Batch size
  batchTimeout: number;        // Batch timeout in ms
  enableRetry: boolean;        // Enable automatic retry
  maxRetries: number;          // Maximum retry attempts
  retryDelay: number;          // Delay between retries (ms)
}

export interface ScheduledTask {
  requestId: string;
  execute: () => Promise<any>;
  priority: PriorityLevel;
  userId: string;
  tenantId?: string;
  metadata: Record<string, any>;
}

export class RequestScheduler {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: SchedulerConfig;
  private queueManager: PriorityQueueManager;
  
  // Scheduler state
  private running: boolean = false;
  private currentConcurrency: number;
  private processingTasks: Map<string, Promise<any>> = new Map();
  
  // Adaptive concurrency
  private recentLatencies: number[] = [];
  private adaptiveTimer?: NodeJS.Timeout;
  
  // Batch processing
  private batchBuffer: ScheduledTask[] = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(config?: Partial<SchedulerConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      strategy: config?.strategy ?? 'priority',
      minConcurrency: config?.minConcurrency ?? 10,
      maxConcurrency: config?.maxConcurrency ?? 100,
      targetLatency: config?.targetLatency ?? 1000,
      adaptiveInterval: config?.adaptiveInterval ?? 10000,
      enableBatching: config?.enableBatching ?? false,
      batchSize: config?.batchSize ?? 10,
      batchTimeout: config?.batchTimeout ?? 1000,
      enableRetry: config?.enableRetry ?? true,
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
    };
    
    this.currentConcurrency = this.config.minConcurrency;
    
    // Initialize queue manager
    this.queueManager = new PriorityQueueManager({
      maxConcurrent: this.config.maxConcurrency,
      enableFairness: this.config.strategy === 'fair',
    });
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) {
      this.logger.warn('Scheduler already running');
      return;
    }

    this.running = true;
    this.logger.info('Scheduler started', {
      strategy: this.config.strategy,
      concurrency: this.currentConcurrency,
    });

    // Start processing loop
    this.processLoop();

    // Start adaptive concurrency adjustment
    if (this.config.strategy === 'adaptive') {
      this.startAdaptiveConcurrency();
    }

    this.metrics.increment('scheduler_started_total');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.logger.info('Scheduler stopped');

    // Clear timers
    if (this.adaptiveTimer) {
      clearInterval(this.adaptiveTimer);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.metrics.increment('scheduler_stopped_total');
  }

  /**
   * Schedule a task
   */
  async schedule(task: ScheduledTask): Promise<string> {
    if (!this.running) {
      throw new Error('Scheduler not running');
    }

    // Add to batch buffer if batching enabled
    if (this.config.enableBatching) {
      return this.addToBatch(task);
    }

    // Add to queue
    const requestId = await this.queueManager.enqueue({
      id: task.requestId,
      priority: task.priority,
      userId: task.userId,
      tenantId: task.tenantId,
      payload: task.execute,
      metadata: task.metadata,
    });

    this.metrics.increment('scheduler_scheduled_total', 1, {
      priority: task.priority,
    });

    return requestId;
  }

  /**
   * Add task to batch buffer
   */
  private async addToBatch(task: ScheduledTask): Promise<string> {
    this.batchBuffer.push(task);

    // Process batch if full
    if (this.batchBuffer.length >= this.config.batchSize) {
      await this.processBatch();
    } else if (!this.batchTimer) {
      // Set timeout to process batch
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.config.batchTimeout);
    }

    return task.requestId;
  }

  /**
   * Process batch
   */
  private async processBatch(): Promise<void> {
    if (this.batchBuffer.length === 0) {
      return;
    }

    const batch = [...this.batchBuffer];
    this.batchBuffer = [];

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    this.logger.debug('Processing batch', { size: batch.length });

    // Add all tasks to queue
    for (const task of batch) {
      await this.queueManager.enqueue({
        id: task.requestId,
        priority: task.priority,
        userId: task.userId,
        tenantId: task.tenantId,
        payload: task.execute,
        metadata: task.metadata,
      });
    }

    this.metrics.increment('scheduler_batch_processed_total');
    this.metrics.histogram('scheduler_batch_size', batch.length);
  }

  /**
   * Main processing loop
   */
  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        // Check if we can process more requests
        if (this.processingTasks.size < this.currentConcurrency) {
          const request = await this.queueManager.dequeue();
          
          if (request) {
            // Process request
            this.processRequest(request);
          } else {
            // No requests available, wait a bit
            await this.sleep(100);
          }
        } else {
          // At capacity, wait a bit
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error('Error in processing loop', error instanceof Error ? error : undefined);
        await this.sleep(1000);
      }
    }
  }

  /**
   * Process a single request
   */
  private async processRequest(request: QueuedRequest): Promise<void> {
    const startTime = Date.now();

    const promise = (async () => {
      try {
        // Execute the task
        const execute = request.payload as () => Promise<any>;
        const result = await execute();

        // Track latency
        const latency = Date.now() - startTime;
        this.recentLatencies.push(latency);
        
        // Keep only last 100 latencies
        if (this.recentLatencies.length > 100) {
          this.recentLatencies.shift();
        }

        // Complete request
        await this.queueManager.complete(request.id, result);

        this.metrics.histogram('scheduler_request_latency_ms', latency, {
          priority: request.priority,
        });

        return result;
      } catch (error) {
        this.logger.error('Request processing failed', error instanceof Error ? error : undefined, {
          requestId: request.id,
        });

        // Retry if enabled
        if (this.config.enableRetry && request.retryCount < this.config.maxRetries) {
          await this.retryRequest(request);
        } else {
          await this.queueManager.fail(request.id, error as Error);
        }

        throw error;
      } finally {
        // Remove from processing
        this.processingTasks.delete(request.id);
      }
    })();

    // Catch unhandled rejections to prevent test failures
    promise.catch(() => {
      // Error already logged in the try-catch above
    });

    this.processingTasks.set(request.id, promise);
  }

  /**
   * Retry a failed request
   */
  private async retryRequest(request: QueuedRequest): Promise<void> {
    request.retryCount++;

    this.logger.info('Retrying request', {
      requestId: request.id,
      retryCount: request.retryCount,
    });

    // Wait before retry
    await this.sleep(this.config.retryDelay * request.retryCount);

    // Re-enqueue
    await this.queueManager.enqueue(request);

    this.metrics.increment('scheduler_retry_total', 1, {
      priority: request.priority,
      retryCount: request.retryCount.toString(),
    });
  }

  /**
   * Start adaptive concurrency adjustment
   */
  private startAdaptiveConcurrency(): void {
    this.adaptiveTimer = setInterval(() => {
      this.adjustConcurrency();
    }, this.config.adaptiveInterval);
  }

  /**
   * Adjust concurrency based on latency
   */
  private adjustConcurrency(): void {
    if (this.recentLatencies.length === 0) {
      return;
    }

    const avgLatency = this.recentLatencies.reduce((sum, l) => sum + l, 0) / this.recentLatencies.length;
    const targetLatency = this.config.targetLatency;

    let newConcurrency = this.currentConcurrency;

    if (avgLatency < targetLatency * 0.8) {
      // Latency is good, increase concurrency
      newConcurrency = Math.min(
        this.currentConcurrency + 5,
        this.config.maxConcurrency
      );
    } else if (avgLatency > targetLatency * 1.2) {
      // Latency is high, decrease concurrency
      newConcurrency = Math.max(
        this.currentConcurrency - 5,
        this.config.minConcurrency
      );
    }

    if (newConcurrency !== this.currentConcurrency) {
      this.logger.info('Adjusting concurrency', {
        oldConcurrency: this.currentConcurrency,
        newConcurrency,
        avgLatency,
        targetLatency,
      });

      this.currentConcurrency = newConcurrency;

      this.metrics.gauge('scheduler_concurrency', newConcurrency);
    }
  }

  /**
   * Get scheduler metrics
   */
  getMetrics() {
    const queueMetrics = this.queueManager.getMetrics();
    
    return {
      ...queueMetrics,
      currentConcurrency: this.currentConcurrency,
      processingTasks: this.processingTasks.size,
      batchBufferSize: this.batchBuffer.length,
      averageLatency: this.recentLatencies.length > 0
        ? this.recentLatencies.reduce((sum, l) => sum + l, 0) / this.recentLatencies.length
        : 0,
    };
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.running,
      strategy: this.config.strategy,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.config.maxConcurrency,
      processingTasks: this.processingTasks.size,
      queueSize: this.queueManager.getMetrics().currentQueueSize,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.stop();
    this.queueManager.cleanup();
  }
}

