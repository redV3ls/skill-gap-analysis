import { Env } from '../index';
import { Context } from 'hono';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  metadata?: {
    requestId?: string;
    userId?: string;
    path?: string;
    method?: string;
    duration?: number;
    statusCode?: number;
    ip?: string;
    userAgent?: string;
    country?: string;
    colo?: string;
  };
  tags?: string[];
}

export interface LogConfig {
  level: LogLevel;
  enableKVStorage: boolean;
  enableConsole: boolean;
  kvTTL: number;
  maxBatchSize: number;
}

export class LoggingService {
  private env: Env;
  private config: LogConfig;
  private logBatch: LogEntry[] = [];
  private batchTimer?: number;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    critical: 4,
  };

  constructor(env: Env, config?: Partial<LogConfig>) {
    this.env = env;
    this.config = {
      level: config?.level || (env.LOG_LEVEL as LogLevel) || 'info',
      enableKVStorage: config?.enableKVStorage ?? true,
      enableConsole: config?.enableConsole ?? true,
      kvTTL: config?.kvTTL || 86400 * 7, // 7 days
      maxBatchSize: config?.maxBatchSize || 100,
    };
  }

  /**
   * Log a message with context
   */
  async log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    metadata?: LogEntry['metadata']
  ): Promise<void> {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata,
    };

    // Console logging
    if (this.config.enableConsole) {
      this.consoleLog(entry);
    }

    // KV storage logging
    if (this.config.enableKVStorage && this.env.CACHE) {
      await this.kvLog(entry);
    }
  }

  /**
   * Debug level logging
   */
  async debug(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('debug', message, context);
  }

  /**
   * Info level logging
   */
  async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('info', message, context);
  }

  /**
   * Warning level logging
   */
  async warn(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('warn', message, context);
  }

  /**
   * Error level logging
   */
  async error(message: string, error?: Error | Record<string, any>): Promise<void> {
    const context = error instanceof Error ? {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    } : error;

    await this.log('error', message, context);
  }

  /**
   * Critical level logging
   */
  async critical(message: string, context?: Record<string, any>): Promise<void> {
    await this.log('critical', message, context);
  }

  /**
   * Log HTTP request/response
   */
  async logRequest(
    c: Context,
    duration: number,
    statusCode: number
  ): Promise<void> {
    const metadata: LogEntry['metadata'] = {
      requestId: c.req.header('CF-Ray') || undefined,
      userId: (c as any).user?.id,
      path: new URL(c.req.url).pathname,
      method: c.req.method,
      duration,
      statusCode,
      ip: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
      country: c.req.header('CF-IPCountry'),
      colo: c.req.header('CF-Ray')?.split('-')[1],
    };

    const level: LogLevel = statusCode >= 500 ? 'error' : 
                           statusCode >= 400 ? 'warn' : 'info';

    await this.log(
      level,
      `${c.req.method} ${new URL(c.req.url).pathname} - ${statusCode} - ${duration}ms`,
      undefined,
      metadata
    );
  }

  /**
   * Query logs from KV storage
   */
  async queryLogs(filter: {
    level?: LogLevel;
    startTime?: string;
    endTime?: string;
    userId?: string;
    path?: string;
    limit?: number;
    tags?: string[];
  }): Promise<LogEntry[]> {
    if (!this.env.CACHE) {
      return [];
    }

    const logs: LogEntry[] = [];
    const limit = filter.limit || 100;

    try {
      // Get log keys for the time range
      const { keys } = await this.env.CACHE.list({ 
        prefix: 'log:',
        limit: 1000,
      });

      for (const key of keys) {
        const log = await this.env.CACHE.get(key.name, 'json') as LogEntry;
        
        if (log && this.matchesFilter(log, filter)) {
          logs.push(log);
          if (logs.length >= limit) break;
        }
      }

      // Sort by timestamp descending
      logs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return logs.slice(0, limit);
    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }

  /**
   * Get log statistics
   */
  async getLogStats(hours: number = 24): Promise<{
    totalLogs: number;
    logsByLevel: Record<LogLevel, number>;
    logsByHour: Record<string, number>;
    topPaths: Array<{ path: string; count: number }>;
    averageResponseTime: number;
  }> {
    const stats = {
      totalLogs: 0,
      logsByLevel: {} as Record<LogLevel, number>,
      logsByHour: {} as Record<string, number>,
      topPaths: [] as Array<{ path: string; count: number }>,
      averageResponseTime: 0,
    };

    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const logs = await this.queryLogs({ startTime: cutoffTime, limit: 10000 });

      stats.totalLogs = logs.length;

      // Calculate stats
      const pathCounts: Record<string, number> = {};
      let totalDuration = 0;
      let durationCount = 0;

      for (const log of logs) {
        // Count by level
        stats.logsByLevel[log.level] = (stats.logsByLevel[log.level] || 0) + 1;

        // Count by hour
        const hour = log.timestamp.slice(0, 13);
        stats.logsByHour[hour] = (stats.logsByHour[hour] || 0) + 1;

        // Count paths
        if (log.metadata?.path) {
          pathCounts[log.metadata.path] = (pathCounts[log.metadata.path] || 0) + 1;
        }

        // Sum durations
        if (log.metadata?.duration) {
          totalDuration += log.metadata.duration;
          durationCount++;
        }
      }

      // Calculate average response time
      stats.averageResponseTime = durationCount > 0 ? totalDuration / durationCount : 0;

      // Get top paths
      stats.topPaths = Object.entries(pathCounts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return stats;
    }
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(daysToKeep: number = 7): Promise<number> {
    if (!this.env.CACHE) {
      return 0;
    }

    const cutoffTime = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    let cleaned = 0;

    try {
      const { keys } = await this.env.CACHE.list({ prefix: 'log:' });
      
      for (const key of keys) {
        const log = await this.env.CACHE.get(key.name, 'json') as LogEntry;
        if (log && log.timestamp < cutoffTime) {
          await this.env.CACHE.delete(key.name);
          cleaned++;
        }
      }

      return cleaned;
    } catch (error) {
      console.error('Failed to cleanup logs:', error);
      return 0;
    }
  }

  /**
   * Private methods
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.config.level];
  }

  private consoleLog(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const message = `${prefix} ${entry.message}`;

    const consoleMethod = {
      debug: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      critical: console.error,
    }[entry.level];

    if (entry.context) {
      consoleMethod(message, entry.context);
    } else {
      consoleMethod(message);
    }
  }

  private async kvLog(entry: LogEntry): Promise<void> {
    try {
      // Add to batch
      this.logBatch.push(entry);

      // Process batch if full
      if (this.logBatch.length >= this.config.maxBatchSize) {
        await this.flushLogBatch();
      } else {
        // Schedule batch processing
        this.scheduleBatchFlush();
      }
    } catch (error) {
      console.error('Failed to log to KV:', error);
    }
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(async () => {
      await this.flushLogBatch();
      this.batchTimer = undefined;
    }, 5000) as unknown as number; // Flush after 5 seconds
  }

  private async flushLogBatch(): Promise<void> {
    if (this.logBatch.length === 0) return;

    const batch = [...this.logBatch];
    this.logBatch = [];

    try {
      // Store each log entry
      for (const entry of batch) {
        const key = `log:${entry.timestamp}:${crypto.randomUUID()}`;
        await this.env.CACHE.put(
          key,
          JSON.stringify(entry),
          { expirationTtl: this.config.kvTTL }
        );
      }

      // Update hourly aggregates
      await this.updateHourlyAggregates(batch);
    } catch (error) {
      console.error('Failed to flush log batch:', error);
      // Re-add to batch for retry
      this.logBatch = [...batch, ...this.logBatch];
    }
  }

  private async updateHourlyAggregates(logs: LogEntry[]): Promise<void> {
    const hourlyGroups = new Map<string, LogEntry[]>();

    // Group by hour
    for (const log of logs) {
      const hour = log.timestamp.slice(0, 13);
      if (!hourlyGroups.has(hour)) {
        hourlyGroups.set(hour, []);
      }
      hourlyGroups.get(hour)!.push(log);
    }

    // Update aggregates
    for (const [hour, hourLogs] of hourlyGroups) {
      const key = `log:aggregate:${hour}`;
      const existing = await this.env.CACHE.get(key, 'json') as any || {
        count: 0,
        levels: {},
        paths: {},
      };

      existing.count += hourLogs.length;
      
      for (const log of hourLogs) {
        existing.levels[log.level] = (existing.levels[log.level] || 0) + 1;
        if (log.metadata?.path) {
          existing.paths[log.metadata.path] = (existing.paths[log.metadata.path] || 0) + 1;
        }
      }

      await this.env.CACHE.put(
        key,
        JSON.stringify(existing),
        { expirationTtl: this.config.kvTTL }
      );
    }
  }

  private matchesFilter(log: LogEntry, filter: any): boolean {
    if (filter.level && log.level !== filter.level) return false;
    if (filter.startTime && log.timestamp < filter.startTime) return false;
    if (filter.endTime && log.timestamp > filter.endTime) return false;
    if (filter.userId && log.metadata?.userId !== filter.userId) return false;
    if (filter.path && log.metadata?.path !== filter.path) return false;
    if (filter.tags && filter.tags.length > 0) {
      if (!log.tags || !filter.tags.every((tag: string) => log.tags!.includes(tag))) {
        return false;
      }
    }
    return true;
  }
}
