import { Env } from '../index';
import { Context } from 'hono';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
  request?: {
    method: string;
    url: string;
    path: string;
    headers: Record<string, string>;
    ip?: string;
    country?: string;
    colo?: string;
    userAgent?: string;
    duration?: number;
    statusCode?: number;
  };
  user?: {
    id: string;
    email?: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  environment: string;
  rayId?: string;
}

export interface LogStats {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByHour: Record<string, number>;
  topPaths: Array<{ path: string; count: number }>;
  topUsers: Array<{ userId: string; count: number }>;
  averageResponseTime: number;
  errorRate: number;
  recentErrors: LogEntry[];
}

export interface LogQueryFilter {
  level?: 'debug' | 'info' | 'warn' | 'error';
  startTime?: string;
  endTime?: string;
  userId?: string;
  path?: string;
  limit?: number;
}

export class LoggingService {
  private env: Env;
  private readonly LOG_TTL = 86400 * 7; // 7 days
  private readonly STATS_TTL = 86400 * 30; // 30 days

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Log a debug message
   */
  async debug(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('debug', message, metadata);
  }

  /**
   * Log an info message
   */
  async info(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('info', message, metadata);
  }

  /**
   * Log a warning message
   */
  async warn(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('warn', message, metadata);
  }

  /**
   * Log an error message
   */
  async error(message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    const errorMetadata = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...metadata,
    } : metadata;

    await this.log('error', message, errorMetadata);
  }

  /**
   * Log an HTTP request
   */
  async logRequest(
    context: Context,
    duration: number,
    statusCode: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const logEntry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: statusCode >= 400 ? 'error' : 'info',
      message: `${context.req.method} ${context.req.url} - ${statusCode} (${duration}ms)`,
      metadata,
      request: {
        method: context.req.method,
        url: context.req.url,
        path: new URL(context.req.url).pathname,
        headers: this.sanitizeHeaders(this.getRequestHeaders(context.req)),
        ip: context.req.header('CF-Connecting-IP'),
        country: context.req.header('CF-IPCountry'),
        colo: context.req.header('CF-Ray')?.split('-')[1],
        userAgent: context.req.header('User-Agent'),
        duration,
        statusCode,
      },
      user: (context as any).user ? {
        id: (context as any).user.id,
        email: (context as any).user.email,
      } : undefined,
      environment: this.env.NODE_ENV || 'development',
      rayId: context.req.header('CF-Ray'),
    };

    await this.storeLog(logEntry);
    await this.updateLogStats(logEntry);
  }

  /**
   * Query logs with filters
   */
  async queryLogs(filter: LogQueryFilter): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];
    const limit = filter.limit || 100;

    try {
      // Get logs from KV storage
      const { keys } = await this.env.CACHE.list({ prefix: 'log:' });
      
      for (const key of keys) {
        if (logs.length >= limit) break;
        
        const cachedLog = await this.env.CACHE.get(key.name, 'json');
        if (!cachedLog) continue;
        
        const log = typeof cachedLog === 'string' ? JSON.parse(cachedLog) : cachedLog;
        if (!log) continue;

        // Apply filters
        if (filter.level && log.level !== filter.level) continue;
        if (filter.startTime && log.timestamp < filter.startTime) continue;
        if (filter.endTime && log.timestamp > filter.endTime) continue;
        if (filter.userId && log.user?.id !== filter.userId) continue;
        if (filter.path && log.request?.path !== filter.path) continue;

        logs.push(log);
      }

      // Sort by timestamp (newest first)
      return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }

  /**
   * Get log statistics
   */
  async getLogStats(hours: number = 24): Promise<LogStats> {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { keys } = await this.env.CACHE.list({ prefix: 'log:' });
      
      const stats: LogStats = {
        totalLogs: 0,
        logsByLevel: {},
        logsByHour: {},
        topPaths: [],
        topUsers: [],
        averageResponseTime: 0,
        errorRate: 0,
        recentErrors: [],
      };

      const pathCounts: Record<string, number> = {};
      const userCounts: Record<string, number> = {};
      let totalResponseTime = 0;
      let responseTimeCount = 0;
      let errorCount = 0;

      for (const key of keys) {
        const cachedLog = await this.env.CACHE.get(key.name, 'json');
        if (!cachedLog) continue;
        
        const log = typeof cachedLog === 'string' ? JSON.parse(cachedLog) : cachedLog;
        if (!log || !log.timestamp || log.timestamp < cutoffTime) continue;

        stats.totalLogs++;
        
        // Count by level
        stats.logsByLevel[log.level] = (stats.logsByLevel[log.level] || 0) + 1;
        
        // Count by hour
        const hour = log.timestamp.slice(0, 13);
        stats.logsByHour[hour] = (stats.logsByHour[hour] || 0) + 1;
        
        // Count paths
        if (log.request?.path) {
          pathCounts[log.request.path] = (pathCounts[log.request.path] || 0) + 1;
        }
        
        // Count users
        if (log.user?.id) {
          userCounts[log.user.id] = (userCounts[log.user.id] || 0) + 1;
        }
        
        // Calculate response time
        if (log.request?.duration) {
          totalResponseTime += log.request.duration;
          responseTimeCount++;
        }
        
        // Count errors
        if (log.level === 'error') {
          errorCount++;
          if (stats.recentErrors.length < 50) {
            stats.recentErrors.push(log);
          }
        }
      }

      // Calculate averages and rates
      stats.averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
      stats.errorRate = stats.totalLogs > 0 ? errorCount / stats.totalLogs : 0;

      // Sort top paths and users
      stats.topPaths = Object.entries(pathCounts)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      stats.topUsers = Object.entries(userCounts)
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return {
        totalLogs: 0,
        logsByLevel: {},
        logsByHour: {},
        topPaths: [],
        topUsers: [],
        averageResponseTime: 0,
        errorRate: 0,
        recentErrors: [],
      };
    }
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(daysToKeep: number = 7): Promise<number> {
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
      console.error('Failed to cleanup old logs:', error);
      return 0;
    }
  }

  /**
   * Private helper methods
   */
  private async log(level: LogEntry['level'], message: string, metadata?: Record<string, any>): Promise<void> {
    const logEntry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      environment: this.env.NODE_ENV || 'development',
    };

    await this.storeLog(logEntry);
    await this.updateLogStats(logEntry);
  }

  private async storeLog(logEntry: LogEntry): Promise<void> {
    try {
      const key = `log:${logEntry.id}`;
      await this.env.CACHE.put(
        key,
        JSON.stringify(logEntry),
        { expirationTtl: this.LOG_TTL }
      );
    } catch (error) {
      console.error('Failed to store log entry:', error);
    }
  }

  private async updateLogStats(logEntry: LogEntry): Promise<void> {
    try {
      const statsKey = 'log:stats:current';
      const cachedStats = await this.env.CACHE.get(statsKey, 'json');
      
      let stats: any;
      if (cachedStats) {
        stats = typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats;
      } else {
        stats = {
          totalLogs: 0,
          logsByLevel: {},
          logsByHour: {},
          lastUpdated: new Date().toISOString(),
        };
      }

      stats.totalLogs++;
      
      // Ensure logsByLevel exists
      if (!stats.logsByLevel) {
        stats.logsByLevel = {};
      }
      stats.logsByLevel[logEntry.level] = (stats.logsByLevel[logEntry.level] || 0) + 1;
      
      const hour = logEntry.timestamp.slice(0, 13);
      stats.logsByHour[hour] = (stats.logsByHour[hour] || 0) + 1;
      stats.lastUpdated = new Date().toISOString();

      // Clean up old hourly stats (keep last 48 hours)
      const cutoffHour = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 13);
      Object.keys(stats.logsByHour).forEach(hour => {
        if (hour < cutoffHour) {
          delete stats.logsByHour[hour];
        }
      });

      await this.env.CACHE.put(
        statsKey,
        JSON.stringify(stats),
        { expirationTtl: this.STATS_TTL }
      );
    } catch (error) {
      console.error('Failed to update log stats:', error);
    }
  }

  private getRequestHeaders(req: any): Headers {
    const headers = new Headers();
    
    const commonHeaders = [
      'authorization', 'content-type', 'user-agent', 'accept',
      'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'x-api-key'
    ];
    
    commonHeaders.forEach(headerName => {
      const value = req.header(headerName);
      if (value) {
        headers.set(headerName, value);
      }
    });
    
    return headers;
  }

  private sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    headers.forEach((value, key) => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }
}