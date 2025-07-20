import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'INTERNAL_SERVER_ERROR';
    this.details = details;
    this.name = 'AppError';
  }
}

export const errorHandler = (error: Error, c: Context) => {
  console.error('API Error:', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    request: {
      method: c.req.method,
      url: c.req.url,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    },
  });

  // Handle HTTPException from Hono
  if (error instanceof HTTPException) {
    return c.json({
      error: {
        code: 'HTTP_EXCEPTION',
        message: error.message,
        status: error.status,
        timestamp: new Date().toISOString(),
      },
    }, error.status);
  }

  // Handle custom AppError
  if (error instanceof AppError) {
    return c.json({
      error: {
        code: error.code,
        message: error.message,
        ...(c.env?.NODE_ENV === 'development' && {
          stack: error.stack,
          details: error.details,
        }),
        timestamp: new Date().toISOString(),
      },
    }, error.statusCode);
  }

  // Handle generic errors
  return c.json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      ...(c.env?.NODE_ENV === 'development' && {
        stack: error.stack,
        originalMessage: error.message,
      }),
      timestamp: new Date().toISOString(),
    },
  }, 500);
};