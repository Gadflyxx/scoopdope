import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Coordinates graceful shutdown of the application.
 *
 * On SIGTERM/SIGINT the process should stop accepting new connections while
 * allowing in-flight requests to complete, then release downstream resources
 * (DB/Redis) before exiting. A bounded timeout guarantees the process cannot
 * hang indefinitely if a resource refuses to close.
 */
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private readonly timeoutMs: number;
  private shuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    const configured = Number(this.configService.get<string>('SHUTDOWN_TIMEOUT_MS'));
    this.timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 10_000;
  }

  /**
   * Registers SIGTERM/SIGINT handlers so the Nest application shuts down
   * gracefully instead of dropping in-flight requests.
   */
  enableShutdownHooks(app: { close: () => Promise<void> }): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    for (const signal of signals) {
      process.on(signal, () => {
        void this.handleSignal(signal, app);
      });
    }
  }

  private async handleSignal(signal: NodeJS.Signals, app: { close: () => Promise<void> }): Promise<void> {
    if (this.shuttingDown) {
      this.logger.warn(`Received ${signal} while already shutting down; ignoring`);
      return;
    }
    this.shuttingDown = true;
    this.logger.log(`Received ${signal}; starting graceful shutdown`);

    const timer = setTimeout(() => {
      this.logger.error(`Graceful shutdown exceeded ${this.timeoutMs}ms; forcing exit`);
      process.exit(1);
    }, this.timeoutMs);
    // Do not keep the event loop alive solely for the timeout.
    timer.unref?.();

    try {
      // Stops accepting new connections and lets in-flight requests finish.
      // Nest's close() also triggers onApplicationShutdown hooks, which close
      // downstream resources such as the DB and Redis connections.
      await app.close();
      this.logger.log('Graceful shutdown complete');
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error instanceof Error ? error.stack : undefined);
      clearTimeout(timer);
      process.exit(1);
    }
  }

  /**
   * Invoked by Nest during app.close(); downstream resources (DB/Redis) are
   * released here before the process exits.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Application shutting down${signal ? ` (${signal})` : ''}`);
  }
}
