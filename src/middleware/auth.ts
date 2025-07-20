import { Context, Next } from 'hono';
import { jwt, verify, sign } from 'hono/jwt';
import { AppError } from './errorHandler';
import { Env } from '../index';
import { z } from 'zod';

export interface AuthenticatedContext extends Context {
  user?: {
    id: string;
    email: string;
    role?: string;
    apiKeyId?: string;
  };
}

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
}

// Generate JWT token
export const generateJWT = async (payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresIn: number = 86400): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
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
  // Skip auth for health checks and public endpoints
  const publicPaths = ['/health', '/api/v1/auth/login', '/api/v1/auth/register', '/'];
  if (publicPaths.some(path => c.req.path.startsWith(path))) {
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
      
      const apiKeyData = await getApiKeyData(c.env.CACHE, apiKey);
      if (!apiKeyData || !apiKeyData.isActive) {
        throw new AppError('Invalid or inactive API key', 401, 'INVALID_API_KEY');
      }
      
      // Check expiration
      if (apiKeyData.expiresAt && new Date(apiKeyData.expiresAt) < new Date()) {
        throw new AppError('API key has expired', 401, 'EXPIRED_API_KEY');
      }
      
      // Set user context from API key
      (c as AuthenticatedContext).user = {
        id: apiKeyData.userId,
        email: '', // API keys don't have email context
        role: apiKeyData.permissions.includes('admin') ? 'admin' : 'user',
        apiKeyId: apiKeyData.id,
      };
      
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Invalid API key format', 401, 'INVALID_API_KEY_FORMAT');
      }
      throw error;
    }
  }

  // JWT token authentication
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
      
      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        throw new AppError('Token has expired', 401, 'EXPIRED_TOKEN');
      }
      
      (c as AuthenticatedContext).user = {
        id: payload.id,
        email: payload.email,
        role: payload.role,
      };
      
      return next();
    } catch (error) {
      console.warn('JWT validation failed:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
    }
  }

  throw new AppError('Invalid authentication method', 401, 'INVALID_AUTH_METHOD');
};

// Require authentication middleware
export const requireAuth = async (c: AuthenticatedContext, next: Next) => {
  if (!c.user) {
    throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
  }
  return next();
};

// Require specific role middleware
export const requireRole = (role: string) => {
  return async (c: AuthenticatedContext, next: Next) => {
    if (!c.user) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    
    if (c.user.role !== role && c.user.role !== 'admin') {
      throw new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    
    return next();
  };
};

// Require specific permissions middleware
export const requirePermissions = (permissions: string[]) => {
  return async (c: AuthenticatedContext, next: Next) => {
    if (!c.user) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }
    
    // If using API key, check permissions
    if (c.user.apiKeyId) {
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
    }
    
    return next();
  };
};