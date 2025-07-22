import { Env } from '../index';
import { Context } from 'hono';

export interface ErrorRecord {
  id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  statusCode: number;
  stack?: string;
  request: {
    method: string;
    url: string;
    path: string;
    query?: Record<string, string>;
    headers: Record<string, string>;
    ip?: string;
    country?: string;
    colo?: string;
    userAgent?: string;
  };
  user?: {
    id: string;
    email?: string;
  };
  context?: Record<string, any>;
  environment: string;
  rayId: string;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByCode: Record<string, number>;
  errorsByStatus: Record<number, number>;
  errorsByPath: Record<string, number>;
  errorsByHour: Record<string, number>;
  recentErrors: ErrorRecord[];
}

export class ErrorTrackingService {
  private env: Env;
  private readonly ERROR_TTL = 86400 * 7; // 7 days
  private readonly STATS_TTL = 86400 * 30; // 30 days

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Track an error occurrence
   */
  async trackError(
    error: Error,
    context: Context,
    additionalContext?: Record<string, any>
  ): Promise<string> {
    const errorId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const rayId = context.req.header('CF-Ray') || 'unknown';

    // Determine error details
    let code = 'UNKNOWN_ERROR';
    let statusCode = 500;
    let level: ErrorRecord['level'] = 'error';

    if ((error as any).code) {
      code = (error as any).code;
    }
    if ((error as any).statusCode) {
      statusCode = (error as any).statusCode;
    }
    if (statusCode >= 400 && statusCode < 500) {
      level = 'warning'; // Client errors are warnings
    }

    // Create error record
    const errorRecord: ErrorRecord = {
      id: errorId,
      timestamp,
      level,
      code,
      message: error.message,
      statusCode,
      stack: error.stack,
      request: {
        method: context.req.method,
        url: context.req.url,
        path: new URL(context.req.url).pathname,
        query: this.parseQuery(context.req.url),
        headers: this.sanitizeHeaders(this.getRequestHeaders(context.req)),
        ip: context.req.header('CF-Connecting-IP'),
        country: context.req.header('CF-IPCountry'),
        colo: context.req.header('CF-Ray')?.split('-')[1],
        userAgent: context.req.header('User-Agent'),
      },
      user: (context as any).user ? {
        id: (context as any).user.id,
        email: (context as any).user.email,
      } : undefined,
      context: additionalContext,
      environment: this.env.NODE_ENV || 'development',
      rayId,
    };

    // Store error record
    await this.storeError(errorRecord);

    // Update error statistics
    await this.updateErrorStats(errorRecord);

    // Send alerts for critical errors
    if (this.isCriticalError(errorRecord)) {
      await this.sendErrorAlert(errorRecord);
    }

    return errorId;
  }

  /**
   * Store error record in KV
   */
  private async storeError(errorRecord: ErrorRecord): Promise<void> {
    const key = `error:${errorRecord.id}`;
    const hourKey = `errors:hourly:${errorRecord.timestamp.slice(0, 13)}`;

    try {
      // Store individual error
      await this.env.CACHE.put(
        key,
        JSON.stringify(errorRecord),
        { expirationTtl: this.ERROR_TTL }
      );

      // Add to hourly index
      const hourlyErrors = (await this.env.CACHE.get(hourKey, 'json') || []) as any[];
      hourlyErrors.push({
        id: errorRecord.id,
        timestamp: errorRecord.timestamp,
        code: errorRecord.code,
        path: errorRecord.request.path,
      });
      
      await this.env.CACHE.put(
        hourKey,
        JSON.stringify(hourlyErrors),
        { expirationTtl: this.ERROR_TTL }
      );
    } catch (err) {
      console.error('Failed to store error record:', err);
    }
  }

  /**
   * Update error statistics
   */
  private async updateErrorStats(errorRecord: ErrorRecord): Promise<void> {
    const statsKey = 'error:stats:current';
    
    try {
      const stats = await this.env.CACHE.get(statsKey, 'json') as ErrorStats || {
        totalErrors: 0,
        errorsByCode: {},
        errorsByStatus: {},
        errorsByPath: {},
        errorsByHour: {},
        recentErrors: [],
      };

      // Update counters
      stats.totalErrors++;
      stats.errorsByCode[errorRecord.code] = (stats.errorsByCode[errorRecord.code] || 0) + 1;
      stats.errorsByStatus[errorRecord.statusCode] = (stats.errorsByStatus[errorRecord.statusCode] || 0) + 1;
      stats.errorsByPath[errorRecord.request.path] = (stats.errorsByPath[errorRecord.request.path] || 0) + 1;
      
      const hour = errorRecord.timestamp.slice(0, 13);
      stats.errorsByHour[hour] = (stats.errorsByHour[hour] || 0) + 1;

      // Add to recent errors (keep last 100)
      stats.recentErrors.unshift({
        ...errorRecord,
        stack: undefined, // Don't include stack in stats
      });
      stats.recentErrors = stats.recentErrors.slice(0, 100);

      // Clean up old hourly stats (keep last 24 hours)
      const cutoffHour = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 13);
      Object.keys(stats.errorsByHour).forEach(hour => {
        if (hour < cutoffHour) {
          delete stats.errorsByHour[hour];
        }
      });

      await this.env.CACHE.put(
        statsKey,
        JSON.stringify(stats),
        { expirationTtl: this.STATS_TTL }
      );
    } catch (err) {
      console.error('Failed to update error stats:', err);
    }
  }

  /**
   * Get error statistics
   */
  async getErrorStats(): Promise<ErrorStats> {
    try {
      const stats = await this.env.CACHE.get('error:stats:current', 'json') as ErrorStats;
      return stats || {
        totalErrors: 0,
        errorsByCode: {},
        errorsByStatus: {},
        errorsByPath: {},
        errorsByHour: {},
        recentErrors: [],
      };
    } catch (err) {
      console.error('Failed to get error stats:', err);
      return {
        totalErrors: 0,
        errorsByCode: {},
        errorsByStatus: {},
        errorsByPath: {},
        errorsByHour: {},
        recentErrors: [],
      };
    }
  }

  /**
   * Get error by ID
   */
  async getError(errorId: string): Promise<ErrorRecord | null> {
    try {
      const error = await this.env.CACHE.get(`error:${errorId}`, 'json') as ErrorRecord;
      return error;
    } catch (err) {
      console.error('Failed to get error:', err);
      return null;
    }
  }

  /**
   * Get errors by filter
   */
  async getErrors(filter: {
    code?: string;
    level?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }): Promise<ErrorRecord[]> {
    const errors: ErrorRecord[] = [];
    const limit = filter.limit || 100;

    try {
      // Get recent errors from stats
      const stats = await this.getErrorStats();
      let filteredErrors = stats.recentErrors;

      // Apply filters
      if (filter.code) {
        filteredErrors = filteredErrors.filter(e => e.code === filter.code);
      }
      if (filter.level) {
        filteredErrors = filteredErrors.filter(e => e.level === filter.level);
      }
      if (filter.startTime) {
        filteredErrors = filteredErrors.filter(e => e.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filteredErrors = filteredErrors.filter(e => e.timestamp <= filter.endTime!);
      }

      return filteredErrors.slice(0, limit);
    } catch (err) {
      console.error('Failed to get errors:', err);
      return [];
    }
  }

  /**
   * Clear old errors
   */
  async clearOldErrors(daysToKeep: number = 7): Promise<number> {
    const cutoffTime = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    let cleared = 0;

    try {
      const { keys } = await this.env.CACHE.list({ prefix: 'error:' });
      
      for (const key of keys) {
        if (key.name.startsWith('error:') && !key.name.includes('stats')) {
          const error = await this.env.CACHE.get(key.name, 'json') as ErrorRecord;
          if (error && error.timestamp < cutoffTime) {
            await this.env.CACHE.delete(key.name);
            cleared++;
          }
        }
      }

      return cleared;
    } catch (err) {
      console.error('Failed to clear old errors:', err);
      return 0;
    }
  }

  /**
   * Helper methods
   */
  private parseQuery(url: string): Record<string, string> {
    try {
      const urlObj = new URL(url);
      const query: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      return query;
    } catch {
      return {};
    }
  }

  private getRequestHeaders(req: any): Headers {
    // Create a Headers object from the request
    const headers = new Headers();
    
    // Common headers to check
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

  private isCriticalError(error: ErrorRecord): boolean {
    // Define critical error conditions
    return (
      error.statusCode >= 500 ||
      error.code === 'DATABASE_ERROR' ||
      error.code === 'AUTH_SYSTEM_ERROR' ||
      error.request.path.includes('/api/v1/auth') && error.statusCode >= 400
    );
  }

  private async sendErrorAlert(error: ErrorRecord): Promise<void> {
    // In production, this would send to a monitoring service
    console.error('CRITICAL ERROR ALERT:', {
      id: error.id,
      code: error.code,
      message: error.message,
      path: error.request.path,
      timestamp: error.timestamp,
    });

    // Store alert in KV for dashboard
    const alertKey = `alert:${error.id}`;
    await this.env.CACHE.put(
      alertKey,
      JSON.stringify({
        errorId: error.id,
        timestamp: error.timestamp,
        code: error.code,
        message: error.message,
        path: error.request.path,
        severity: 'critical',
      }),
      { expirationTtl: 86400 } // 24 hours
    );
  }
}
