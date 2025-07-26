import { Context } from 'hono';
import { logger } from '../utils/logger';

export interface SanitizedError {
  id: string;
  code: string;
  message: string;
  timestamp: string;
  requestId: string;
  details?: any;
}

export interface ErrorSanitizationConfig {
  environment: 'development' | 'staging' | 'production';
  includeStackTrace: boolean;
  maxStackTraceLines: number;
  sensitiveHeaders: string[];
  sensitiveQueryParams: string[];
  maxErrorMessageLength: number;
}

export class ErrorSanitizer {
  private config: ErrorSanitizationConfig;

  constructor(environment: string = 'production') {
    this.config = {
      environment: environment as 'development' | 'staging' | 'production',
      includeStackTrace: environment === 'development',
      maxStackTraceLines: 10,
      sensitiveHeaders: [
        'authorization',
        'cookie',
        'x-api-key',
        'x-auth-token',
        'x-access-token',
        'x-refresh-token',
        'cf-connecting-ip',
        'x-forwarded-for',
        'x-real-ip'
      ],
      sensitiveQueryParams: [
        'token',
        'api_key',
        'apikey',
        'password',
        'secret',
        'auth',
        'authorization'
      ],
      maxErrorMessageLength: 500
    };
  }

  /**
   * Sanitize error for client response
   */
  sanitizeError(error: Error, context: Context): SanitizedError {
    const errorId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const requestId = context.req.header('CF-Ray') || 'unknown';

    // Determine error code and message
    const { code, message } = this.extractErrorInfo(error);

    // Create base sanitized error
    const sanitizedError: SanitizedError = {
      id: errorId,
      code,
      message: this.sanitizeMessage(message),
      timestamp,
      requestId
    };

    // Add details for validation errors in non-production
    if (this.shouldIncludeDetails(error)) {
      sanitizedError.details = this.sanitizeErrorDetails(error);
    }

    // Log full error details for debugging (server-side only)
    this.logFullError(error, context, errorId);

    return sanitizedError;
  }

  /**
   * Sanitize stack trace for logging
   */
  sanitizeStackTrace(stack: string): string {
    if (!stack) return '';

    const lines = stack.split('\n');
    const sanitizedLines = lines
      .slice(0, this.config.maxStackTraceLines)
      .map(line => this.sanitizeStackTraceLine(line));

    return sanitizedLines.join('\n');
  }

  /**
   * Redact sensitive data from objects
   */
  redactSensitiveData(data: Record<string, any>): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const redacted = { ...data };

    // Redact sensitive keys
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'auth', 'authorization',
      'cookie', 'session', 'jwt', 'api_key', 'apikey', 'access_token',
      'refresh_token', 'private_key', 'client_secret'
    ];

    for (const key of Object.keys(redacted)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = this.redactSensitiveData(redacted[key]);
      }
    }

    return redacted;
  }

  /**
   * Sanitize request headers
   */
  sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      if (this.config.sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (lowerKey === 'user-agent') {
        // Partially redact user agent to remove potential PII
        sanitized[key] = this.sanitizeUserAgent(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize query parameters
   */
  sanitizeQueryParams(params: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      
      if (this.config.sensitiveQueryParams.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Extract error information safely
   */
  private extractErrorInfo(error: Error): { code: string; message: string } {
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if ((error as any).code) {
      code = (error as any).code;
    }

    if (error.message) {
      message = error.message;
    }

    // Handle specific error types
    if (error.name === 'ZodError') {
      code = 'VALIDATION_ERROR';
      message = 'Invalid request data';
    } else if (error.name === 'TypeError') {
      code = 'TYPE_ERROR';
      message = 'Invalid data type';
    } else if (error.name === 'ReferenceError') {
      code = 'REFERENCE_ERROR';
      message = 'Internal reference error';
    }

    return { code, message };
  }

  /**
   * Sanitize error message
   */
  private sanitizeMessage(message: string): string {
    let sanitized = message;

    // Truncate if too long
    if (sanitized.length > this.config.maxErrorMessageLength) {
      sanitized = sanitized.substring(0, this.config.maxErrorMessageLength) + '...';
    }

    // Remove potential file paths
    sanitized = sanitized.replace(/\/[^\s]+\.(js|ts|json)/g, '[FILE_PATH]');

    // Remove potential database connection strings
    sanitized = sanitized.replace(/postgresql:\/\/[^\s]+/g, '[DATABASE_URL]');
    sanitized = sanitized.replace(/mysql:\/\/[^\s]+/g, '[DATABASE_URL]');

    // Remove potential API keys or tokens from error messages
    sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '[TOKEN]');

    // Remove IP addresses
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_ADDRESS]');

    return sanitized;
  }

  /**
   * Determine if error details should be included
   */
  private shouldIncludeDetails(error: Error): boolean {
    // Include details for validation errors in all environments
    if (error.name === 'ZodError' || (error as any).code === 'VALIDATION_ERROR') {
      return true;
    }

    // Include details in development
    if (this.config.environment === 'development') {
      return true;
    }

    return false;
  }

  /**
   * Sanitize error details
   */
  private sanitizeErrorDetails(error: Error): any {
    if (error.name === 'ZodError') {
      // For Zod errors, return sanitized validation errors
      const zodError = error as any;
      if (zodError.errors) {
        return zodError.errors.map((err: any) => ({
          field: err.path?.join('.') || 'unknown',
          message: this.sanitizeMessage(err.message || 'Invalid value'),
          code: err.code || 'invalid'
        }));
      }
    }

    if ((error as any).details) {
      return this.redactSensitiveData((error as any).details);
    }

    return undefined;
  }

  /**
   * Sanitize stack trace line
   */
  private sanitizeStackTraceLine(line: string): string {
    let sanitized = line;

    // Remove absolute file paths, keep relative paths
    sanitized = sanitized.replace(/\/[^\s]+\/([^\/\s]+\.(js|ts))/g, '$1');

    // Remove potential sensitive information
    sanitized = sanitized.replace(/password=[^\s&]+/gi, 'password=[REDACTED]');
    sanitized = sanitized.replace(/token=[^\s&]+/gi, 'token=[REDACTED]');

    return sanitized;
  }

  /**
   * Sanitize user agent string
   */
  private sanitizeUserAgent(userAgent: string): string {
    // Keep browser/OS info but remove potential tracking info
    return userAgent.replace(/\([^)]*\)/g, '(...)');
  }

  /**
   * Log full error details for debugging (server-side only)
   */
  private logFullError(error: Error, context: Context, errorId: string): void {
    const requestInfo = {
      method: context.req.method,
      url: context.req.url,
      path: new URL(context.req.url).pathname,
      headers: this.sanitizeHeaders(this.getRequestHeaders(context.req)),
      query: this.sanitizeQueryParams(this.parseQuery(context.req.url)),
      userAgent: context.req.header('User-Agent'),
      ip: context.req.header('CF-Connecting-IP'),
      country: context.req.header('CF-IPCountry'),
      ray: context.req.header('CF-Ray')
    };

    const errorDetails = {
      id: errorId,
      name: error.name,
      message: error.message,
      stack: this.config.includeStackTrace ? this.sanitizeStackTrace(error.stack || '') : undefined,
      code: (error as any).code,
      statusCode: (error as any).statusCode,
      details: (error as any).details,
      request: requestInfo,
      timestamp: new Date().toISOString()
    };

    logger.error('Full error details:', errorDetails);
  }

  /**
   * Get request headers safely
   */
  private getRequestHeaders(req: any): Record<string, string> {
    const headers: Record<string, string> = {};
    
    // Common headers to extract
    const commonHeaders = [
      'authorization', 'content-type', 'user-agent', 'accept',
      'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'x-api-key',
      'x-forwarded-for', 'x-real-ip', 'referer', 'origin'
    ];
    
    commonHeaders.forEach(headerName => {
      const value = req.header(headerName);
      if (value) {
        headers[headerName] = value;
      }
    });
    
    return headers;
  }

  /**
   * Parse query parameters from URL
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

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorSanitizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ErrorSanitizationConfig {
    return { ...this.config };
  }
}

// Create factory function to get environment-aware sanitizer
export const createErrorSanitizer = (environment?: string): ErrorSanitizer => {
  return new ErrorSanitizer(environment || 'production');
};

// Export singleton instance
export const errorSanitizer = new ErrorSanitizer('production');
