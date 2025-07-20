import { Context, Next } from 'hono';
import { Env } from '../index';

export class RateLimiter {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId') || 'anonymous';
    
    const windowMs = parseInt(this.env.RATE_LIMIT_WINDOW_MS) || 900000; // 15 minutes
    const maxRequests = parseInt(this.env.RATE_LIMIT_MAX_REQUESTS) || 100;
    
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    
    const key = `${clientId}:${windowStart}`;
    const count = (await this.state.storage.get<number>(key)) || 0;
    
    if (count >= maxRequests) {
      return new Response(JSON.stringify({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
        },
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': (windowStart + windowMs).toString(),
        },
      });
    }
    
    await this.state.storage.put(key, count + 1, {
      expirationTtl: Math.ceil(windowMs / 1000),
    });
    
    return new Response(JSON.stringify({
      allowed: true,
      count: count + 1,
      remaining: maxRequests - count - 1,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': (maxRequests - count - 1).toString(),
        'X-RateLimit-Reset': (windowStart + windowMs).toString(),
      },
    });
  }
}

export const rateLimiter = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const clientId = c.req.header('CF-Connecting-IP') || 
                   c.req.header('X-Forwarded-For') || 
                   'anonymous';
  
  const rateLimiterId = c.env.RATE_LIMITER.idFromName(clientId);
  const rateLimiterStub = c.env.RATE_LIMITER.get(rateLimiterId);
  
  const url = new URL(c.req.url);
  url.searchParams.set('clientId', clientId);
  
  const response = await rateLimiterStub.fetch(url.toString());
  const result = await response.json() as any;
  
  if (!result.allowed) {
    return c.json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
      },
    }, 429);
  }
  
  // Add rate limit headers
  c.header('X-RateLimit-Limit', response.headers.get('X-RateLimit-Limit') || '100');
  c.header('X-RateLimit-Remaining', response.headers.get('X-RateLimit-Remaining') || '0');
  c.header('X-RateLimit-Reset', response.headers.get('X-RateLimit-Reset') || '0');
  
  await next();
};