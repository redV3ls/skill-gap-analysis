import { Context, Next, MiddlewareHandler } from 'hono';
import { z, ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

export interface ValidationOptions {
  sanitize?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

export interface SanitizationConfig {
  maxStringLength?: number;
  allowedHtmlTags?: string[];
  removeScripts?: boolean;
  normalizeWhitespace?: boolean;
}

/**
 * Input sanitization utility
 */
export class InputSanitizer {
  private config: Required<SanitizationConfig>;

  constructor(config: SanitizationConfig = {}) {
    this.config = {
      maxStringLength: config.maxStringLength || 10000,
      allowedHtmlTags: config.allowedHtmlTags || [],
      removeScripts: config.removeScripts !== false,
      normalizeWhitespace: config.normalizeWhitespace !== false
    };
  }

  /**
   * Sanitize input data recursively
   */
  sanitize(input: unknown): unknown {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return this.sanitizeString(input);
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitize(item));
    }

    if (typeof input === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitize(value);
      }
      return sanitized;
    }

    return input;
  }

  /**
   * Sanitize string input
   */
  private sanitizeString(str: string): string {
    let sanitized = str;

    // Truncate if too long
    if (sanitized.length > this.config.maxStringLength) {
      sanitized = sanitized.substring(0, this.config.maxStringLength);
      logger.warn(`String truncated to ${this.config.maxStringLength} characters`);
    }

    // Remove script tags and javascript: protocols
    if (this.config.removeScripts) {
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      sanitized = sanitized.replace(/javascript:/gi, '');
      sanitized = sanitized.replace(/on\w+\s*=/gi, ''); // Remove event handlers
    }

    // Remove HTML tags if not in allowed list
    if (this.config.allowedHtmlTags.length === 0) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    } else {
      // Only allow specific HTML tags
      const allowedTagsRegex = new RegExp(
        `<(?!/?(?:${this.config.allowedHtmlTags.join('|')})\\b)[^>]*>`,
        'gi'
      );
      sanitized = sanitized.replace(allowedTagsRegex, '');
    }

    // Normalize whitespace
    if (this.config.normalizeWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ').trim();
    }

    // Decode HTML entities to prevent double encoding
    sanitized = this.decodeHtmlEntities(sanitized);

    return sanitized;
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(str: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };

    return str.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }
}

/**
 * Validation middleware factory
 */
export class ValidationMiddleware {
  private sanitizer: InputSanitizer;

  constructor(sanitizationConfig?: SanitizationConfig) {
    this.sanitizer = new InputSanitizer(sanitizationConfig);
  }

  /**
   * Validate request body against schema
   */
  validateBody<T>(schema: ZodSchema<T>, options: ValidationOptions = {}): MiddlewareHandler {
    return async (c: Context, next: Next) => {
      try {
        const body = await c.req.json().catch(() => ({}));
        
        // Sanitize input if requested
        const inputData = options.sanitize ? this.sanitizer.sanitize(body) : body;
        
        // Validate with Zod
        const validatedData = schema.parse(inputData);
        
        // Store validated data in context
        c.set('validatedBody', validatedData);
        
        logger.debug('Request body validation successful');
        await next();
      } catch (error) {
        this.handleValidationError(error, 'body');
      }
    };
  }

  /**
   * Validate query parameters against schema
   */
  validateQuery<T>(schema: ZodSchema<T>, options: ValidationOptions = {}): MiddlewareHandler {
    return async (c: Context, next: Next) => {
      try {
        const query = c.req.query();
        
        // Convert query object to proper types (all query params are strings by default)
        const processedQuery = this.processQueryParams(query);
        
        // Sanitize input if requested
        const inputData = options.sanitize ? this.sanitizer.sanitize(processedQuery) : processedQuery;
        
        // Validate with Zod
        const validatedData = schema.parse(inputData);
        
        // Store validated data in context
        c.set('validatedQuery', validatedData);
        
        logger.debug('Query parameters validation successful');
        await next();
      } catch (error) {
        this.handleValidationError(error, 'query');
      }
    };
  }

  /**
   * Validate path parameters against schema
   */
  validateParams<T>(schema: ZodSchema<T>, options: ValidationOptions = {}): MiddlewareHandler {
    return async (c: Context, next: Next) => {
      try {
        const params = c.req.param();
        
        // Sanitize input if requested
        const inputData = options.sanitize ? this.sanitizer.sanitize(params) : params;
        
        // Validate with Zod
        const validatedData = schema.parse(inputData);
        
        // Store validated data in context
        c.set('validatedParams', validatedData);
        
        logger.debug('Path parameters validation successful');
        await next();
      } catch (error) {
        this.handleValidationError(error, 'params');
      }
    };
  }

  /**
   * Validate headers against schema
   */
  validateHeaders(requiredHeaders: string[]): MiddlewareHandler {
    return async (c: Context, next: Next) => {
      try {
        const missingHeaders: string[] = [];
        
        for (const header of requiredHeaders) {
          const value = c.req.header(header);
          if (!value) {
            missingHeaders.push(header);
          }
        }
        
        if (missingHeaders.length > 0) {
          throw new AppError(
            `Missing required headers: ${missingHeaders.join(', ')}`,
            400,
            'MISSING_HEADERS'
          );
        }
        
        logger.debug('Header validation successful');
        await next();
      } catch (error) {
        this.handleValidationError(error, 'headers');
      }
    };
  }

  /**
   * Combined validation for body, query, and params
   */
  validate<TBody, TQuery, TParams>(schemas: {
    body?: ZodSchema<TBody>;
    query?: ZodSchema<TQuery>;
    params?: ZodSchema<TParams>;
    headers?: string[];
  }, options: ValidationOptions = {}): MiddlewareHandler {
    return async (c: Context, next: Next) => {
      try {
        // Validate body if schema provided
        if (schemas.body) {
          const body = await c.req.json().catch(() => ({}));
          const inputData = options.sanitize ? this.sanitizer.sanitize(body) : body;
          const validatedBody = schemas.body.parse(inputData);
          c.set('validatedBody', validatedBody);
        }

        // Validate query if schema provided
        if (schemas.query) {
          const query = c.req.query();
          const processedQuery = this.processQueryParams(query);
          const inputData = options.sanitize ? this.sanitizer.sanitize(processedQuery) : processedQuery;
          const validatedQuery = schemas.query.parse(inputData);
          c.set('validatedQuery', validatedQuery);
        }

        // Validate params if schema provided
        if (schemas.params) {
          const params = c.req.param();
          const inputData = options.sanitize ? this.sanitizer.sanitize(params) : params;
          const validatedParams = schemas.params.parse(inputData);
          c.set('validatedParams', validatedParams);
        }

        // Validate headers if provided
        if (schemas.headers) {
          const missingHeaders: string[] = [];
          for (const header of schemas.headers) {
            if (!c.req.header(header)) {
              missingHeaders.push(header);
            }
          }
          if (missingHeaders.length > 0) {
            throw new AppError(
              `Missing required headers: ${missingHeaders.join(', ')}`,
              400,
              'MISSING_HEADERS'
            );
          }
        }

        logger.debug('Combined validation successful');
        await next();
      } catch (error) {
        this.handleValidationError(error, 'combined');
      }
    };
  }

  /**
   * Process query parameters to convert string values to appropriate types
   */
  private processQueryParams(query: Record<string, string>): Record<string, unknown> {
    const processed: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(query)) {
      // Try to convert to number if it looks like a number
      if (/^\d+$/.test(value)) {
        processed[key] = parseInt(value, 10);
      } else if (/^\d*\.\d+$/.test(value)) {
        processed[key] = parseFloat(value);
      } else if (value === 'true') {
        processed[key] = true;
      } else if (value === 'false') {
        processed[key] = false;
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  }

  /**
   * Handle validation errors consistently
   */
  private handleValidationError(error: unknown, source: string): never {
    if (error instanceof ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));

      logger.warn(`Validation failed for ${source}:`, { errors: formattedErrors });

      // Track validation failures for potential abuse
      this.trackValidationFailure(source, formattedErrors.length);

      throw new AppError(
        `Invalid ${source} data`,
        400,
        'VALIDATION_ERROR',
        formattedErrors
      );
    }

    if (error instanceof AppError) {
      throw error;
    }

    logger.error(`Unexpected validation error for ${source}:`, error);
    throw new AppError(
      `Validation failed for ${source}`,
      500,
      'VALIDATION_SYSTEM_ERROR'
    );
  }

  /**
   * Track validation failures for abuse detection
   */
  private trackValidationFailure(source: string, errorCount: number): void {
    // This could be enhanced to implement rate limiting for validation failures
    // For now, just log for monitoring
    if (errorCount > 5) {
      logger.warn(`High number of validation errors (${errorCount}) for ${source} - possible abuse`);
    }
  }
}

// Create default validation middleware instance
export const validationMiddleware = new ValidationMiddleware();

// Convenience functions for common validations
export const validateBody = <T>(schema: ZodSchema<T>, options?: ValidationOptions) =>
  validationMiddleware.validateBody(schema, options);

export const validateQuery = <T>(schema: ZodSchema<T>, options?: ValidationOptions) =>
  validationMiddleware.validateQuery(schema, options);

export const validateParams = <T>(schema: ZodSchema<T>, options?: ValidationOptions) =>
  validationMiddleware.validateParams(schema, options);

export const validateHeaders = (requiredHeaders: string[]) =>
  validationMiddleware.validateHeaders(requiredHeaders);

export const validate = <TBody, TQuery, TParams>(
  schemas: {
    body?: ZodSchema<TBody>;
    query?: ZodSchema<TQuery>;
    params?: ZodSchema<TParams>;
    headers?: string[];
  },
  options?: ValidationOptions
) => validationMiddleware.validate(schemas, options);

// Common validation schemas
export const commonSchemas = {
  uuid: z.string().uuid('Invalid UUID format'),
  email: z.string().email('Invalid email format'),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0)
  }),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
};