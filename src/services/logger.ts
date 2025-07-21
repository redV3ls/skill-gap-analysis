import { KVNamespace } from '@cloudflare/workers-types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableKV: boolean;
  kvNamespace?: KVNamespace;
  retention?: number; // Days to retain logs
}

export class Logger {
  private config: LoggerConfig;
  private static instance: Logger;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
  };

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance && config) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.config.level];
  }

  private formatMessage(entry: LogEntry): string {
    const { timestamp, level, message, context, error } = entry;
    let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (context) {
      formatted += ` | Context: ${JSON.stringify(context)}`;
    }
    
    if (error) {
      formatted += ` | Error: ${error.message}`;
      if (error.stack) {
        formatted += `\nStack: ${error.stack}`;
      }
    }
    
    return formatted;
  }

  private async logToKV(entry: LogEntry): Promise<void> {
    if (!this.config.enableKV || !this.config.kvNamespace) {
      return;
    }

    try {
      const key = `log:${entry.level}:${entry.timestamp}:${crypto.randomUUID()}`;
      const ttl = (this.config.retention || 7) * 24 * 60 * 60; // Convert days to seconds
      
      await this.config.kvNamespace.put(
        key,
        JSON.stringify(entry),
        { expirationTtl: ttl }
      );
      
      // Also update daily aggregates
      await this.updateDailyAggregates(entry);
    } catch (error) {
      console.error('Failed to write log to KV:', error);
    }
  }

  private async updateDailyAggregates(entry: LogEntry): Promise<void> {
    if (!this.config.kvNamespace) return;
    
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const aggregateKey = `log:aggregate:${date}`;
    
    try {
      // Get existing aggregate
      const existing = await this.config.kvNamespace.get(aggregateKey, 'json') as any || {
        date,
        counts: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
        errors: [],
        slowRequests: [],
        topPaths: {}
      };
      
      // Update counts
      existing.counts[entry.level]++;
      
      // Track errors
      if (entry.level === 'error' || entry.level === 'fatal') {
        existing.errors.push({
          timestamp: entry.timestamp,
          message: entry.message,
          path: entry.path,
          code: entry.error?.code
        });
        
        // Keep only last 100 errors
        if (existing.errors.length > 100) {
          existing.errors = existing.errors.slice(-100);
        }
      }
      
      // Track slow requests
      if (entry.duration && entry.duration > 1000) {
        existing.slowRequests.push({
          timestamp: entry.timestamp,
          path: entry.path,
          duration: entry.duration
        });
        
        // Keep only last 50 slow requests
        if (existing.slowRequests.length > 50) {
          existing.slowRequests = existing.slowRequests.slice(-50);
        }
      }
      
      // Track top paths
      if (entry.path) {
        existing.topPaths[entry.path] = (existing.topPaths[entry.path] || 0) + 1;
      }
      
      // Save updated aggregate
      await this.config.kvNamespace.put(
        aggregateKey,
        JSON.stringify(existing),
        { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
      );
    } catch (error) {
      console.error('Failed to update daily aggregates:', error);
    }
  }

  private async log(level: LogLevel, message: string, context?: any): Promise<void> {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    // Add request context if available
    if (context?.request) {
      entry.requestId = context.request.id;
      entry.path = context.request.path;
      entry.method = context.request.method;
      entry.userId = context.request.userId;
    }

    // Add error details if present
    if (context?.error) {
      entry.error = {
        message: context.error.message || String(context.error),
        stack: context.error.stack,
        code: context.error.code
      };
    }

    // Add performance metrics if present
    if (context?.duration) {
      entry.duration = context.duration;
    }
    if (context?.statusCode) {
      entry.statusCode = context.statusCode;
    }

    // Log to console
    if (this.config.enableConsole) {
      const consoleMethod = level === 'error' || level === 'fatal' ? 'error' : 
                           level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](this.formatMessage(entry));
    }

    // Log to KV
    await this.logToKV(entry);
  }

  debug(message: string, context?: any): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: any): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: any): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: any): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: any): void {
    this.log('fatal', message, context);
  }

  // Request logging helper
  logRequest(request: Request, response: Response, duration: number, userId?: string): void {
    const url = new URL(request.url);
    const context = {
      request: {
        id: request.headers.get('cf-ray') || crypto.randomUUID(),
        path: url.pathname,
        method: request.method,
        userId
      },
      statusCode: response.status,
      duration
    };

    const level: LogLevel = response.status >= 500 ? 'error' :
                           response.status >= 400 ? 'warn' : 'info';
    
    const message = `${request.method} ${url.pathname} ${response.status} ${duration}ms`;
    this.log(level, message, context);
  }

  // Error logging helper
  logError(error: any, request?: Request, userId?: string): void {
    const context: any = { error };
    
    if (request) {
      const url = new URL(request.url);
      context.request = {
        id: request.headers.get('cf-ray') || crypto.randomUUID(),
        path: url.pathname,
        method: request.method,
        userId
      };
    }

    this.error(error.message || 'Unknown error', context);
  }

  // Get logs from KV (for monitoring endpoints)
  async getLogs(options: {
    level?: LogLevel;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}): Promise<LogEntry[]> {
    if (!this.config.kvNamespace) {
      return [];
    }

    const logs: LogEntry[] = [];
    const prefix = options.level ? `log:${options.level}:` : 'log:';
    const { keys } = await this.config.kvNamespace.list({ 
      prefix,
      limit: options.limit || 100 
    });

    for (const key of keys) {
      try {
        const entry = await this.config.kvNamespace.get(key.name, 'json') as LogEntry;
        if (entry) {
          // Filter by date if specified
          if (options.startDate && entry.timestamp < options.startDate) continue;
          if (options.endDate && entry.timestamp > options.endDate) continue;
          
          logs.push(entry);
        }
      } catch (error) {
        console.error('Failed to parse log entry:', error);
      }
    }

    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // Get aggregated metrics
  async getMetrics(date?: string): Promise<any> {
    if (!this.config.kvNamespace) {
      return null;
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    const aggregateKey = `log:aggregate:${targetDate}`;
    
    try {
      return await this.config.kvNamespace.get(aggregateKey, 'json');
    } catch (error) {
      console.error('Failed to get metrics:', error);
      return null;
    }
  }
}

// Default logger instance for backward compatibility
export const defaultLogger = {
  debug: (message: string, ...args: any[]) => console.log(message, ...args),
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
  fatal: (message: string, ...args: any[]) => console.error('[FATAL]', message, ...args)
};
