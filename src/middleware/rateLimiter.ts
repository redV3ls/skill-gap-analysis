import { Context, Next } from 'hono';
import { AppError } from './errorHandler';
import { Env } from '../index';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (c: Context) => string;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsPerWindow: number;
  resetTime: Date;
  remaining: number;
}

// KV-based rate limiter for Cloudflare Workers free tier
export class KVRateLimiter {
  private config: RateLimitConfig;
  private kv: KVNamespace;

  constructor(kv: KVNamespace, config: RateLimitConfig) {
    this.kv = kv;
    this.config = {
      windowMs: 900000, // 15 minutes default
      maxRequests: 100, // 100 requests per window default
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (c: Context) => this.getClientId(c),
      ...config,
    };
  }

  private getClientId(c: Context): string {
    // Try to get the real IP address
    const cfConnectingIp = c.req.header('CF-Connecting-IP');
    const xForwardedFor = c.req.header('X-Forwarded-For');
    const xRealIp = c.req.header('X-Real-IP');
    
    return cfConnectingIp || xForwardedFor?.split(',')[0].trim() || xRealIp || 'anonymous';
  }

  private getRateLimitKey(clientId: string, windowStart: number): string {
    return `rate_limit:${clientId}:${windowStart}`;
  }

  async checkRateLimit(c: Context): Promise<RateLimitInfo> {
    const clientId = this.config.keyGenerator!(c);
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const resetTime = new Date(windowStart + this.config.windowMs);
    
    const key = this.getRateLimitKey(clientId, windowStart);
    
    // Get current count from KV
    const currentCountStr = await this.kv.get(key);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
    
    const remaining = Math.max(0, this.config.maxRequests - currentCount - 1);
    
    return {
      totalHits: currentCount + 1,
      totalHitsPerWindow: currentCount + 1,
      resetTime,
      remaining,
    };
  }

  async incrementCounter(c: Context): Promise<void> {
    const clientId = this.config.keyGenerator!(c);
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    
    const key = this.getRateLimitKey(clientId, windowStart);
    
    // Get current count
    const currentCountStr = await this.kv.get(key);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
    const newCount = currentCount + 1;
    
    // Store with TTL equal to the window duration
    const ttl = Math.ceil(this.config.windowMs / 1000);
    await this.kv.put(key, newCount.toString(), { expirationTtl: ttl });
  }

  async isRateLimited(c: Context): Promise<boolean> {
    const info = await this.checkRateLimit(c);
    return info.totalHits > this.config.maxRequests;
  }
}

// Rate limiter middleware factory
export const createRateLimiter = (config: Partial<RateLimitConfig> = {}) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // Skip rate limiting for health checks
    if (c.req.path.startsWith('/health')) {
      return next();
    }

    const windowMs = parseInt(c.env.RATE_LIMIT_WINDOW_MS) || 900000; // 15 minutes
    const maxRequests = parseInt(c.env.RATE_LIMIT_MAX_REQUESTS) || 100;

    const rateLimiter = new KVRateLimiter(c.env.CACHE, {
      windowMs,
      maxRequests,
      ...config,
    });

    // Check if rate limited
    const isLimited = await rateLimiter.isRateLimited(c);
    
    if (isLimited) {
      const info = await rateLimiter.checkRateLimit(c);
      
      // Set rate limit headers
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', Math.floor(info.resetTime.getTime() / 1000).toString());
      c.header('Retry-After', Math.ceil((info.resetTime.getTime() - Date.now()) / 1000).toString());
      
      throw new AppError(
        'Too many requests from this IP, please try again later.',
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    // Increment counter
    await rateLimiter.incrementCounter(c);
    
    // Get updated info for headers
    const info = await rateLimiter.checkRateLimit(c);
    
    // Set rate limit headers
    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', info.remaining.toString());
    c.header('X-RateLimit-Reset', Math.floor(info.resetTime.getTime() / 1000).toString());

    await next();
  };
};

// Default rate limiter middleware
export const rateLimiter = createRateLimiter();

// Stricter rate limiter for authentication endpoints
export const authRateLimiter = createRateLimiter({
  windowMs: 900000, // 15 minutes
  maxRequests: 10,   // Only 10 auth attempts per 15 minutes
});

// More lenient rate limiter for read-only operations
export const readOnlyRateLimiter = createRateLimiter({
  windowMs: 300000,  // 5 minutes
  maxRequests: 200,  // 200 requests per 5 minutes
});