/**
 * Priority Queue Manager
 * 
 * Manages request queues with multiple priority levels, SLA tracking,
 * and intelligent scheduling for enterprise workload management.
 */

import { Logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics.js';

export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';
export type QueueStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'timeout' | 'cancelled';

export interface QueuedRequest {
  id: string;
  priority: PriorityLevel;
  userId: string;
  tenantId?: string;
  organizationId?: string;
  payload: any;
  metadata: Record<string, any>;
  
  // Timing
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  
  // SLA
  slaDeadline?: number;        // Timestamp when SLA expires
  maxWaitTime?: number;        // Maximum wait time in ms
  
  // Status
  status: QueueStatus;
  retryCount: number;
  error?: string;
  
  // Callbacks
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
  onTimeout?: () => void;
}

export interface QueueConfig {
  maxQueueSize: number;        // Maximum queue size
  maxConcurrent: number;       // Maximum concurrent requests
  defaultTimeout: number;      // Default timeout in ms
  enableSLA: boolean;          // Enable SLA tracking
  enableFairness: boolean;     // Enable fairness across users/tenants
  starvationPreventionMs: number; // Max wait time before priority boost
}

export interface QueueMetrics {
  totalQueued: number;
  totalProcessed: number;
  totalCompleted: number;
  totalFailed: number;
  totalTimeout: number;
  currentQueueSize: number;
  currentProcessing: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  p95WaitTime: number;
  p99WaitTime: number;
  slaViolations: number;
  slaCompliance: number;       // 0-1
}

export class PriorityQueueManager {
  private logger: Logger;
  private metrics: MetricsCollector;
  private config: QueueConfig;
  
  // Queues by priority
  private queues: Map<PriorityLevel, QueuedRequest[]> = new Map();
  private processing: Map<string, QueuedRequest> = new Map();
  
  // Metrics tracking
  private waitTimes: number[] = [];
  private processingTimes: number[] = [];
  private slaViolations: number = 0;
  private totalProcessed: number = 0;
  
  // Fairness tracking
  private userRequestCounts: Map<string, number> = new Map();
  private tenantRequestCounts: Map<string, number> = new Map();
  
  // Timers
  private slaCheckInterval?: NodeJS.Timeout;
  private starvationCheckInterval?: NodeJS.Timeout;

  constructor(config?: Partial<QueueConfig>) {
    this.logger = new Logger();
    this.metrics = MetricsCollector.getInstance();
    
    this.config = {
      maxQueueSize: config?.maxQueueSize ?? 10000,
      maxConcurrent: config?.maxConcurrent ?? 100,
      defaultTimeout: config?.defaultTimeout ?? 30000,
      enableSLA: config?.enableSLA ?? true,
      enableFairness: config?.enableFairness ?? true,
      starvationPreventionMs: config?.starvationPreventionMs ?? 60000,
    };
    
    // Initialize queues
    this.queues.set('critical', []);
    this.queues.set('high', []);
    this.queues.set('normal', []);
    this.queues.set('low', []);
    this.queues.set('background', []);
    
    // Start background tasks
    this.startBackgroundTasks();
  }

  /**
   * Enqueue a request
   */
  async enqueue(request: Omit<QueuedRequest, 'queuedAt' | 'status' | 'retryCount'>): Promise<string> {
    // Check queue size
    const totalQueued = this.getTotalQueueSize();
    if (totalQueued >= this.config.maxQueueSize) {
      throw new Error('Queue is full');
    }

    const queuedRequest: QueuedRequest = {
      ...request,
      queuedAt: Date.now(),
      status: 'queued',
      retryCount: 0,
    };

    // Add to appropriate queue
    const queue = this.queues.get(request.priority);
    if (!queue) {
      throw new Error(`Invalid priority: ${request.priority}`);
    }

    queue.push(queuedRequest);

    this.logger.debug('Request enqueued', {
      requestId: request.id,
      priority: request.priority,
      queueSize: queue.length,
    });

    this.metrics.increment('queue_enqueued_total', 1, {
      priority: request.priority,
    });

    this.metrics.gauge('queue_size', this.getTotalQueueSize());

    return request.id;
  }

  /**
   * Dequeue next request based on priority and fairness
   */
  async dequeue(): Promise<QueuedRequest | null> {
    // Check if we can process more requests
    if (this.processing.size >= this.config.maxConcurrent) {
      return null;
    }

    // Try to dequeue from each priority level
    const priorities: PriorityLevel[] = ['critical', 'high', 'normal', 'low', 'background'];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) {
        continue;
      }

      // Apply fairness if enabled
      let request: QueuedRequest | undefined;
      
      if (this.config.enableFairness) {
        request = this.dequeueFair(queue);
      } else {
        request = queue.shift();
      }

      if (request) {
        // Mark as processing
        request.status = 'processing';
        request.startedAt = Date.now();
        this.processing.set(request.id, request);

        // Track wait time
        const waitTime = request.startedAt - request.queuedAt;
        this.waitTimes.push(waitTime);
        
        // Keep only last 1000 wait times
        if (this.waitTimes.length > 1000) {
          this.waitTimes.shift();
        }

        this.logger.debug('Request dequeued', {
          requestId: request.id,
          priority: request.priority,
          waitTime,
        });

        this.metrics.increment('queue_dequeued_total', 1, {
          priority: request.priority,
        });

        this.metrics.histogram('queue_wait_time_ms', waitTime, {
          priority: request.priority,
        });

        return request;
      }
    }

    return null;
  }

  /**
   * Dequeue with fairness (round-robin across users/tenants)
   */
  private dequeueFair(queue: QueuedRequest[]): QueuedRequest | undefined {
    if (queue.length === 0) {
      return undefined;
    }

    // Find request from user/tenant with fewest in-flight requests
    let minCount = Infinity;
    let selectedIndex = 0;

    for (let i = 0; i < queue.length; i++) {
      const request = queue[i];
      const userCount = this.userRequestCounts.get(request.userId) || 0;
      const tenantCount = request.tenantId ? (this.tenantRequestCounts.get(request.tenantId) || 0) : 0;
      const totalCount = userCount + tenantCount;

      if (totalCount < minCount) {
        minCount = totalCount;
        selectedIndex = i;
      }
    }

    // Remove and return selected request
    const [request] = queue.splice(selectedIndex, 1);
    
    // Update counts
    this.userRequestCounts.set(request.userId, (this.userRequestCounts.get(request.userId) || 0) + 1);
    if (request.tenantId) {
      this.tenantRequestCounts.set(request.tenantId, (this.tenantRequestCounts.get(request.tenantId) || 0) + 1);
    }

    return request;
  }

  /**
   * Complete a request
   */
  async complete(requestId: string, result?: any): Promise<void> {
    const request = this.processing.get(requestId);
    if (!request) {
      this.logger.warn('Request not found in processing', { requestId });
      return;
    }

    request.status = 'completed';
    request.completedAt = Date.now();

    // Track processing time
    if (request.startedAt) {
      const processingTime = request.completedAt - request.startedAt;
      this.processingTimes.push(processingTime);
      
      // Keep only last 1000 processing times
      if (this.processingTimes.length > 1000) {
        this.processingTimes.shift();
      }

      this.metrics.histogram('queue_processing_time_ms', processingTime, {
        priority: request.priority,
      });
    }

    // Update counts
    this.userRequestCounts.set(request.userId, Math.max(0, (this.userRequestCounts.get(request.userId) || 0) - 1));
    if (request.tenantId) {
      this.tenantRequestCounts.set(request.tenantId, Math.max(0, (this.tenantRequestCounts.get(request.tenantId) || 0) - 1));
    }

    // Remove from processing
    this.processing.delete(requestId);
    this.totalProcessed++;

    // Call completion callback
    if (request.onComplete) {
      try {
        request.onComplete(result);
      } catch (error) {
        this.logger.error('Error in completion callback', error instanceof Error ? error : undefined, { requestId });
      }
    }

    this.logger.debug('Request completed', {
      requestId,
      priority: request.priority,
    });

    this.metrics.increment('queue_completed_total', 1, {
      priority: request.priority,
    });
  }

  /**
   * Fail a request
   */
  async fail(requestId: string, error: Error): Promise<void> {
    const request = this.processing.get(requestId);
    if (!request) {
      this.logger.warn('Request not found in processing', { requestId });
      return;
    }

    request.status = 'failed';
    request.completedAt = Date.now();
    request.error = error.message;

    // Update counts
    this.userRequestCounts.set(request.userId, Math.max(0, (this.userRequestCounts.get(request.userId) || 0) - 1));
    if (request.tenantId) {
      this.tenantRequestCounts.set(request.tenantId, Math.max(0, (this.tenantRequestCounts.get(request.tenantId) || 0) - 1));
    }

    // Remove from processing
    this.processing.delete(requestId);

    // Call error callback
    if (request.onError) {
      try {
        request.onError(error);
      } catch (err) {
        this.logger.error('Error in error callback', err instanceof Error ? err : undefined, { requestId });
      }
    }

    this.logger.warn('Request failed', {
      requestId,
      priority: request.priority,
      error: error.message,
    });

    this.metrics.increment('queue_failed_total', 1, {
      priority: request.priority,
    });
  }

  /**
   * Cancel a request
   */
  async cancel(requestId: string): Promise<boolean> {
    // Check if in processing
    const processingRequest = this.processing.get(requestId);
    if (processingRequest) {
      processingRequest.status = 'cancelled';
      this.processing.delete(requestId);
      
      this.metrics.increment('queue_cancelled_total', 1, {
        priority: processingRequest.priority,
      });
      
      return true;
    }

    // Check queues
    for (const [priority, queue] of this.queues.entries()) {
      const index = queue.findIndex(r => r.id === requestId);
      if (index !== -1) {
        const [request] = queue.splice(index, 1);
        request.status = 'cancelled';
        
        this.metrics.increment('queue_cancelled_total', 1, {
          priority,
        });
        
        return true;
      }
    }

    return false;
  }

  /**
   * Get queue metrics
   */
  getMetrics(): QueueMetrics {
    const totalQueued = this.getTotalQueueSize();
    const averageWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((sum, t) => sum + t, 0) / this.waitTimes.length
      : 0;
    const averageProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, t) => sum + t, 0) / this.processingTimes.length
      : 0;

    // Calculate percentiles
    const sortedWaitTimes = [...this.waitTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedWaitTimes.length * 0.95);
    const p99Index = Math.floor(sortedWaitTimes.length * 0.99);
    const p95WaitTime = sortedWaitTimes[p95Index] || 0;
    const p99WaitTime = sortedWaitTimes[p99Index] || 0;

    // Calculate SLA compliance
    const slaCompliance = this.totalProcessed > 0
      ? 1 - (this.slaViolations / this.totalProcessed)
      : 1;

    return {
      totalQueued,
      totalProcessed: this.totalProcessed,
      totalCompleted: this.totalProcessed - this.slaViolations,
      totalFailed: 0, // Would need to track separately
      totalTimeout: 0, // Would need to track separately
      currentQueueSize: totalQueued,
      currentProcessing: this.processing.size,
      averageWaitTime,
      averageProcessingTime,
      p95WaitTime,
      p99WaitTime,
      slaViolations: this.slaViolations,
      slaCompliance,
    };
  }

  /**
   * Get total queue size
   */
  private getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // SLA check
    if (this.config.enableSLA) {
      this.slaCheckInterval = setInterval(() => {
        this.checkSLAViolations();
      }, 5000); // Check every 5 seconds
    }

    // Starvation prevention
    this.starvationCheckInterval = setInterval(() => {
      this.preventStarvation();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check for SLA violations
   */
  private checkSLAViolations(): void {
    const now = Date.now();

    for (const [priority, queue] of this.queues.entries()) {
      for (const request of queue) {
        if (request.slaDeadline && now > request.slaDeadline) {
          this.slaViolations++;
          
          this.logger.warn('SLA violation detected', {
            requestId: request.id,
            priority,
            waitTime: now - request.queuedAt,
          });

          this.metrics.increment('queue_sla_violations_total', 1, {
            priority,
          });
        }
      }
    }
  }

  /**
   * Prevent starvation by boosting priority of old requests
   */
  private preventStarvation(): void {
    const now = Date.now();
    const threshold = this.config.starvationPreventionMs;

    // Check low and background queues
    for (const priority of ['low', 'background'] as PriorityLevel[]) {
      const queue = this.queues.get(priority);
      if (!queue) continue;

      for (let i = queue.length - 1; i >= 0; i--) {
        const request = queue[i];
        const waitTime = now - request.queuedAt;

        if (waitTime > threshold) {
          // Boost priority
          queue.splice(i, 1);
          
          const newPriority: PriorityLevel = priority === 'background' ? 'low' : 'normal';
          request.priority = newPriority;
          
          const newQueue = this.queues.get(newPriority);
          if (newQueue) {
            newQueue.push(request);
          }

          this.logger.info('Request priority boosted (starvation prevention)', {
            requestId: request.id,
            oldPriority: priority,
            newPriority,
            waitTime,
          });

          this.metrics.increment('queue_priority_boosted_total', 1, {
            oldPriority: priority,
            newPriority,
          });
        }
      }
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.slaCheckInterval) {
      clearInterval(this.slaCheckInterval);
    }
    if (this.starvationCheckInterval) {
      clearInterval(this.starvationCheckInterval);
    }
  }
}

