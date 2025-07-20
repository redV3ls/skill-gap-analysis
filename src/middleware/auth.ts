import { Context, Next } from 'hono';
import { jwt, verify } from 'hono/jwt';
import { AppError } from './errorHandler';
import { Env } from '../index';

export interface AuthenticatedContext extends Context {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  // Skip auth for health checks and public endpoints
  if (c.req.path.startsWith('/health')) {
    return next();
  }

  const apiKey = c.req.header('X-API-Key');
  const authHeader = c.req.header('Authorization');

  if (!apiKey && !authHeader) {
    throw new AppError('API key or authorization token required', 401, 'UNAUTHORIZED');
  }

  // Simple API key validation
  if (apiKey) {
    // For development, accept any non-empty API key
    if (c.env.NODE_ENV === 'development' && apiKey.length > 0) {
      return next();
    }
    
    // In production, validate against configured API keys
    // You can store valid API keys in KV or D1 database
    const validApiKeys = await c.env.CACHE.get('valid_api_keys');
    if (validApiKeys && validApiKeys.split(',').includes(apiKey)) {
      return next();
    }
    
    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }

  // JWT token validation
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const payload = await verify(token, c.env.JWT_SECRET);
      (c as AuthenticatedContext).user = {
        id: payload.id as string,
        email: payload.email as string,
        role: payload.role as string,
      };
    } catch (error) {
      console.warn('JWT validation failed:', error);
      throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
    }
  }

  return next();
};

export const requireAuth = async (c: AuthenticatedContext, next: Next) => {
  if (!c.user) {
    throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
  }
  return next();
};

export const requireRole = (role: string) => {
  return async (c: AuthenticatedContext, next: Next) => {
    if (!c.user) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    
    if (c.user.role !== role) {
      throw new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    
    return next();
  };
};