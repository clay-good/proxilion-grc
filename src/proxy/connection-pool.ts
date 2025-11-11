/**
 * Connection pooling for efficient resource management
 */

import { logger } from '../utils/logger.js';

export interface PooledConnection {
  id: string;
  lastUsed: number;
  inUse: boolean;
  createdAt: number;
}

export interface ConnectionPoolConfig {
  maxConnections: number;
  maxIdleTime: number;
  acquireTimeout: number;
}

export class ConnectionPool {
  private connections: Map<string, PooledConnection[]> = new Map();
  private availableByHost: Map<string, PooledConnection[]> = new Map();
  private waitQueue: Array<{
    host: string;
    resolve: (conn: PooledConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private waitQueueByHost: Map<string, number[]> = new Map(); // Track indices by host

  constructor(private config: ConnectionPoolConfig) {
    // Periodically clean up idle connections
    setInterval(() => this.cleanupIdleConnections(), 30000);
  }

  async acquire(host: string): Promise<PooledConnection> {
    const available = this.getAvailableConnection(host);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();

      // Remove from available list
      const availableList = this.availableByHost.get(host);
      if (availableList) {
        const index = availableList.indexOf(available);
        if (index !== -1) {
          availableList.splice(index, 1);
        }
      }

      return available;
    }

    const hostConnections = this.connections.get(host) || [];
    if (hostConnections.length < this.config.maxConnections) {
      const newConnection = this.createConnection(host);
      hostConnections.push(newConnection);
      this.connections.set(host, hostConnections);
      return newConnection;
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitQueue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);

          // Remove from host-specific queue tracking
          const hostQueue = this.waitQueueByHost.get(host);
          if (hostQueue) {
            const hostIndex = hostQueue.indexOf(index);
            if (hostIndex !== -1) {
              hostQueue.splice(hostIndex, 1);
            }
          }
        }
        reject(new Error(`Connection acquire timeout for ${host}`));
      }, this.config.acquireTimeout);

      const queueIndex = this.waitQueue.length;
      this.waitQueue.push({ host, resolve, reject, timeout });

      // Track by host for efficient lookup
      const hostQueue = this.waitQueueByHost.get(host) || [];
      hostQueue.push(queueIndex);
      this.waitQueueByHost.set(host, hostQueue);
    });
  }

  release(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();

    // Extract host from connection ID
    const host = connection.id.split('-')[0];

    // Check if anyone is waiting for a connection on this host
    const hostQueue = this.waitQueueByHost.get(host);

    if (hostQueue && hostQueue.length > 0) {
      const queueIndex = hostQueue.shift()!; // Get first waiter for this host
      const waiter = this.waitQueue[queueIndex];

      if (waiter) {
        // Remove from main queue
        this.waitQueue.splice(queueIndex, 1);
        clearTimeout(waiter.timeout);

        connection.inUse = true;
        connection.lastUsed = Date.now();
        waiter.resolve(connection);
        return;
      }
    }

    // No waiters, add to available list
    const availableList = this.availableByHost.get(host) || [];
    if (!availableList.includes(connection)) {
      availableList.push(connection);
      this.availableByHost.set(host, availableList);
    }
  }

  private getAvailableConnection(host: string): PooledConnection | null {
    // Use pre-indexed available connections for O(1) lookup
    const availableList = this.availableByHost.get(host);
    if (availableList && availableList.length > 0) {
      return availableList[availableList.length - 1]; // Return last (most recently used)
    }
    return null;
  }

  private createConnection(host: string): PooledConnection {
    return {
      id: `${host}-${crypto.randomUUID()}`,
      lastUsed: Date.now(),
      inUse: true,
      createdAt: Date.now(),
    };
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [host, connections] of this.connections.entries()) {
      const active = connections.filter((conn) => {
        if (!conn.inUse && now - conn.lastUsed > this.config.maxIdleTime) {
          cleaned++;
          return false;
        }
        return true;
      });

      if (active.length === 0) {
        this.connections.delete(host);
      } else {
        this.connections.set(host, active);
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} idle connections`);
    }
  }

  getStats() {
    const stats: Record<string, { total: number; inUse: number; idle: number }> = {};

    for (const [host, connections] of this.connections.entries()) {
      const inUse = connections.filter((c) => c.inUse).length;
      stats[host] = {
        total: connections.length,
        inUse,
        idle: connections.length - inUse,
      };
    }

    return {
      hosts: stats,
      waitQueueLength: this.waitQueue.length,
    };
  }
}

