/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of all components
 */

import { logger } from './logger.js';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void> | void;
  timeout?: number; // milliseconds
}

export class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default

  constructor(timeout?: number) {
    if (timeout) {
      this.shutdownTimeout = timeout;
    }

    // Register signal handlers
    this.registerSignalHandlers();
  }

  /**
   * Register a shutdown handler
   */
  public register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    logger.debug(`Registered shutdown handler: ${handler.name}`);
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  private registerSignalHandlers(): void {
    // SIGTERM - Kubernetes, Docker, systemd
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal');
      this.shutdown('SIGTERM');
    });

    // SIGINT - Ctrl+C
    process.on('SIGINT', () => {
      logger.info('Received SIGINT signal');
      this.shutdown('SIGINT');
    });

    // SIGHUP - Terminal closed
    process.on('SIGHUP', () => {
      logger.info('Received SIGHUP signal');
      this.shutdown('SIGHUP');
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.shutdown('uncaughtException', 1);
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', reason as Error);
      this.shutdown('unhandledRejection', 1);
    });
  }

  /**
   * Perform graceful shutdown
   */
  private async shutdown(signal: string, exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal');
      return;
    }

    this.isShuttingDown = true;

    logger.info(`Starting graceful shutdown (signal: ${signal})...`);

    // Set a timeout to force exit if shutdown takes too long
    const forceExitTimer = setTimeout(() => {
      logger.error(`Shutdown timeout (${this.shutdownTimeout}ms) exceeded, forcing exit`);
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Execute all shutdown handlers in reverse order (LIFO)
      const reversedHandlers = [...this.handlers].reverse();

      for (const handler of reversedHandlers) {
        const handlerTimeout = handler.timeout || 5000; // 5 seconds default per handler

        try {
          logger.info(`Executing shutdown handler: ${handler.name}`);

          // Execute handler with timeout
          await Promise.race([
            Promise.resolve(handler.handler()),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Handler timeout')), handlerTimeout)
            ),
          ]);

          logger.info(`✅ Shutdown handler completed: ${handler.name}`);
        } catch (error) {
          logger.error(`❌ Shutdown handler failed: ${handler.name}`, error as Error);
          // Continue with other handlers even if one fails
        }
      }

      logger.info('✅ Graceful shutdown completed successfully');
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error as Error);
      exitCode = 1;
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    }
  }

  /**
   * Get shutdown status
   */
  public isShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get registered handlers count
   */
  public getHandlersCount(): number {
    return this.handlers.length;
  }
}

/**
 * Create and export singleton instance
 */
export const gracefulShutdown = new GracefulShutdown();

/**
 * Helper function to register shutdown handler
 */
export function onShutdown(name: string, handler: () => Promise<void> | void, timeout?: number): void {
  gracefulShutdown.register({ name, handler, timeout });
}

