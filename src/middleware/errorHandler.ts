import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ErrorTrackingService } from '../services/errorTracking';
import { createErrorSanitizer } from '../services/errorSanitizer';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = async (err: Error, c: Context) => {
  // Initialize error tracking if available
  let errorTracker: ErrorTrackingService | null = null;
  let trackingErrorId: string | null = null;
  
  try {
    if (c.env?.CACHE) {
      errorTracker = new ErrorTrackingService(c.env as any);
      trackingErrorId = await errorTracker.trackError(err, c);
    }
  } catch (trackingError) {
    // Don't let tracking errors break the error handler
    console.error('Error tracking failed:', trackingError);
  }

  // Create environment-aware error sanitizer
  const sanitizer = createErrorSanitizer(c.env?.NODE_ENV);
  
  // Sanitize error for client response
  const sanitizedError = sanitizer.sanitizeError(err, c);
  
  // Use tracking error ID if available, otherwise use sanitized error ID
  if (trackingErrorId) {
    sanitizedError.id = trackingErrorId;
  }

  // Determine status code
  let statusCode = 500;
  
  if (err instanceof HTTPException) {
    statusCode = err.status;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
  } else if (err.name === 'ZodError') {
    statusCode = 400;
  }

  // Return sanitized error response
  return c.json({
    error: sanitizedError
  }, statusCode);
};

export const asyncHandler = (fn: Function) => {
  return async (c: Context, next: Next) => {
    try {
      await fn(c, next);
    } catch (error) {
      await errorHandler(error as Error, c);
    }
  };
};