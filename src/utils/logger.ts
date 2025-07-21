// Cloudflare Workers-compatible logger
// Uses console methods which are available in Workers runtime

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

class WorkersLogger {
  private level: LogLevel;
  private prefix: string;
  private levels: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || '[API]';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] <= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let formatted = `${timestamp} ${this.prefix} [${level.toUpperCase()}]: ${message}`;
    
    if (data !== undefined) {
      if (typeof data === 'object') {
        try {
          formatted += ` ${JSON.stringify(data)}`;
        } catch (e) {
          formatted += ` [Circular Reference]`;
        }
      } else {
        formatted += ` ${data}`;
      }
    }
    
    return formatted;
  }

  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, error);
      console.error(formatted);
      
      // If error object provided, also log stack trace
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  // HTTP logging for request/response
  http(message: string): void {
    this.info(message);
  }
}

// Create singleton logger instance
const logLevel = (globalThis as any).LOG_LEVEL || 'info';
const logger = new WorkersLogger({ level: logLevel as LogLevel });

export { logger };
