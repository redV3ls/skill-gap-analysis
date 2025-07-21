import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = async (err: Error, c: Context) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
    timestamp: new Date().toISOString(),
  });

  // Handle Hono HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json({
      error: {
        code: 'HTTP_EXCEPTION',
        message: err.message,
        status: err.status,
        timestamp: new Date().toISOString(),
        request_id: c.req.header('CF-Ray') || 'unknown',
      },
    }, err.status);
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return c.json({
      error: {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString(),
        request_id: c.req.header('CF-Ray') || 'unknown',
      },
    }, err.statusCode as any);
  }

  // Handle validation errors (Zod)
  if (err.name === 'ZodError') {
    return c.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: (err as any).errors,
        timestamp: new Date().toISOString(),
        request_id: c.req.header('CF-Ray') || 'unknown',
      },
    }, 400);
  }

  // Handle generic errors
  return c.json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      request_id: c.req.header('CF-Ray') || 'unknown',
    },
  }, 500);
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