import { Context, Next } from 'hono';
import { verify, sign } from 'hono/jwt';
import { AppError } from './errorHandler';
import { Env } from '../index';
import { z } from 'zod';

export interface UserContext {
  id: string;
  email: string;
  role?: string;
  apiKeyId?: string;
}

export interface AuthenticatedContext extends Context<{ 
  Bindings: Env;
  Variables: {
    user: UserContext;
  };
}> {}

export interface ApiKeyData {
  id: string;
  name: string;
  userId: string;
  permissions: string[];
  createdAt: string;
  expiresAt?: string;
  lastUsed?: string;
  isActive: boolean;
}

export interface JWTPayload {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
  [key: string]: any; // Add index signature for Hono compatibility
}

// Generate JWT token
export const generateJWT = async (payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresIn: number = 86400): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: any = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };
  
  return await sign(fullPayload, secret);
};

// Generate API key
export const generateApiKey = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sk_';
  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Validate API key format
const apiKeySchema = z.string().regex(/^sk_[A-Za-z0-9]{48}$/, 'Invalid API key format');

// Store API key in KV
export const storeApiKey = async (kv: KVNamespace, apiKey: string, data: ApiKeyData): Promise<void> => {
  const keyData = {
    ...data,
    hashedKey: await hashApiKey(apiKey),
  };
  
  await kv.put(`api_key:${apiKey}`, JSON.stringify(keyData), {
    expirationTtl: data.expiresAt ? Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000) : undefined,
  });
  
  // Also store by user ID for easy lookup
  const userKeys = await getUserApiKeys(kv, data.userId);
  userKeys.push(apiKey);
  await kv.put(`user_api_keys:${data.userId}`, JSON.stringify(userKeys));
};

// Get API key data
export const getApiKeyData = async (kv: KVNamespace, apiKey: string): Promise<ApiKeyData | null> => {
  const data = await kv.get(`api_key:${apiKey}`);
  if (!data) return null;
  
  try {
    const parsed = JSON.parse(data) as ApiKeyData & { hashedKey: string };
    // Verify the key hash matches
    const isValid = await verifyApiKey(apiKey, parsed.hashedKey);
    if (!isValid) return null;
    
    // Update last used timestamp
    parsed.lastUsed = new Date().toISOString();
    await kv.put(`api_key:${apiKey}`, JSON.stringify(parsed));
    
    // Remove hashedKey from response
    const { hashedKey, ...result } = parsed;
    return result;
  } catch {
    return null;
  }
};

// Get user's API keys
export const getUserApiKeys = async (kv: KVNamespace, userId: string): Promise<string[]> => {
  const data = await kv.get(`user_api_keys:${userId}`);
  return data ? JSON.parse(data) : [];
};

// Hash API key for storage
const hashApiKey = async (apiKey: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Verify API key against hash
const verifyApiKey = async (apiKey: string, hash: string): Promise<boolean> => {
  const computedHash = await hashApiKey(apiKey);
  return computedHash === hash;
};

// Main authentication middleware
export const authMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  try {
    // Skip auth for health checks and public endpoints
    const publicPaths = ['/health', '/api/v1/auth/login', '/api/v1/auth/register'];
    const isPublicPath = publicPaths.some(path => c.req.path.startsWith(path)) || c.req.path === '/';
    if (isPublicPath) {
      return next();
    }

    const apiKey = c.req.header('X-API-Key');
    const authHeader = c.req.header('Authorization');

    if (!apiKey && !authHeader) {
      throw new AppError('API key or authorization token required', 401, 'UNAUTHORIZED');
    }

    // API key authentication
    if (apiKey) {
      try {
        // Validate API key format
        apiKeySchema.parse(apiKey);
        
        // Ensure KV namespace is available
        if (!c.env?.CACHE) {
          throw new AppError('Cache service unavailable', 500, 'SERVICE_UNAVAILABLE');
        }
        
        const apiKeyData = await getApiKeyData(c.env.CACHE, apiKey);
        if (!apiKeyData || !apiKeyData.isActive) {
          throw new AppError('Invalid or inactive API key', 401, 'INVALID_API_KEY');
        }
        
        // Check expiration
        if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
          throw new AppError('API key has expired', 401, 'EXPIRED_API_KEY');
        }
        
        // Set user context from API key using Hono's context methods
        const user = {
          id: apiKeyData.userId,
          email: '', // API keys don't have email context
          role: apiKeyData.permissions.includes('admin') ? 'admin' : 'user',
          apiKeyId: apiKeyData.id,
        };
        c.set('user', user);
        
        return next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new AppError('Invalid API key format', 401, 'INVALID_API_KEY_FORMAT');
        }
        if (error instanceof AppError) {
          throw error;
        }
        console.error('API key authentication error:', error);
        throw new AppError('Authentication failed', 500, 'AUTH_ERROR');
      }
    }

    // JWT token authentication
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        // Ensure JWT secret is available
        if (!c.env?.JWT_SECRET) {
          throw new AppError('JWT service unavailable', 500, 'SERVICE_UNAVAILABLE');
        }
        
        const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
        
        // Check token expiration
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          throw new AppError('Token has expired', 401, 'EXPIRED_TOKEN');
        }
        
        // Set user context using Hono's context methods
        const user = {
          id: payload.id,
          email: payload.email,
          role: payload.role,
        };
        c.set('user', user);
        
        return next();
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        // Handle specific JWT errors
        if (error.message?.includes('expired')) {
          throw new AppError('Token has expired', 401, 'EXPIRED_TOKEN');
        }
        if (error.message?.includes('Invalid token') || error.message?.includes('signature')) {
          throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
        }
        throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
      }
    }

    throw new AppError('Invalid authentication method', 401, 'INVALID_AUTH_METHOD');
  } catch (error) {
    // Ensure all errors are properly handled and don't leak as 500s
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Authentication middleware error:', error);
    throw new AppError('Authentication failed', 500, 'AUTH_ERROR');
  }
};

// Require authentication middleware
export const requireAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const user = c.get('user');
  if (!user) {
    throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
  }
  return next();
};

// Require specific role middleware
export const requireRole = (role: string) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    
    if (user.role !== role && user.role !== 'admin') {
      throw new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    
    return next();
  };
};

// Require specific permissions middleware
export const requirePermissions = (permissions: string[]) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user');
    if (!user) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    
    // If using API key, check permissions
    if (user.apiKeyId) {
      try {
        if (!c.env?.CACHE) {
          throw new AppError('Cache service unavailable', 500, 'SERVICE_UNAVAILABLE');
        }
        
        const apiKeyData = await getApiKeyData(c.env.CACHE, c.req.header('X-API-Key')!);
        if (!apiKeyData) {
          throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
        }
        
        const hasPermissions = permissions.every(perm => 
          apiKeyData.permissions.includes(perm) || apiKeyData.permissions.includes('admin')
        );
        
        if (!hasPermissions) {
          throw new AppError('Insufficient API key permissions', 403, 'INSUFFICIENT_API_PERMISSIONS');
        }
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Permission check error:', error);
        throw new AppError('Permission check failed', 500, 'PERMISSION_ERROR');
      }
    }
    
    return next();
  };
};