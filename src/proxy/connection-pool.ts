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
  private waitQueue: Array<{
    host: string;
    resolve: (conn: PooledConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  constructor(private config: ConnectionPoolConfig) {
    // Periodically clean up idle connections
    setInterval(() => this.cleanupIdleConnections(), 30000);
  }

  async acquire(host: string): Promise<PooledConnection> {
    const available = this.getAvailableConnection(host);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
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
        }
        reject(new Error(`Connection acquire timeout for ${host}`));
      }, this.config.acquireTimeout);

      this.waitQueue.push({ host, resolve, reject, timeout });
    });
  }

  release(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();

    // Check if anyone is waiting for a connection
    const waiterIndex = this.waitQueue.findIndex((w) => {
      const hostConnections = this.connections.get(w.host) || [];
      return hostConnections.some((c) => c.id === connection.id);
    });

    if (waiterIndex !== -1) {
      const waiter = this.waitQueue.splice(waiterIndex, 1)[0];
      clearTimeout(waiter.timeout);
      connection.inUse = true;
      connection.lastUsed = Date.now();
      waiter.resolve(connection);
    }
  }

  private getAvailableConnection(host: string): PooledConnection | null {
    const hostConnections = this.connections.get(host) || [];
    return hostConnections.find((conn) => !conn.inUse) || null;
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

