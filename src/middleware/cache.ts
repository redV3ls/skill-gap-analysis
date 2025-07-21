import { MiddlewareHandler } from 'hono';
import { Env } from '../index';
import { CacheService, CacheNamespaces, CacheTTL } from '../services/cache';
import { logger } from '../utils/logger';

interface CacheOptions {
  namespace?: string;
  ttl?: number;
  keyGenerator?: (c: any) => string;
  condition?: (c: any) => boolean;
}

/**
 * Cache middleware for automatic caching of responses
 */
export const cacheMiddleware = (options: CacheOptions = {}): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    // Only cache GET requests by default
    if (c.req.method !== 'GET') {
      return await next();
    }

    // Check if caching should be applied
    if (options.condition && !options.condition(c)) {
      return await next();
    }

    const cacheService = new CacheService(c.env.CACHE);
    const namespace = options.namespace || CacheNamespaces.API_RESPONSES;
    const ttl = options.ttl || CacheTTL.SHORT;

    // Generate cache key
    const cacheKey = options.keyGenerator 
      ? options.keyGenerator(c)
      : `${c.req.path}:${c.req.url.split('?')[1] || ''}`;

    try {
      // Try to get from cache
      const cached = await cacheService.get(namespace, cacheKey);
      if (cached) {
        logger.info(`Cache hit for ${c.req.path}`);
        c.header('X-Cache', 'HIT');
        c.header('Cache-Control', `public, max-age=${ttl}`);
        return c.json(cached);
      }

      // If not cached, proceed with the request
      await next();

      // Cache successful responses
      if (c.res.status >= 200 && c.res.status < 300) {
        const response = await c.res.json();
        await cacheService.set(namespace, cacheKey, response, { ttl });
        
        // Rebuild response with cache headers
        c.header('X-Cache', 'MISS');
        c.header('Cache-Control', `public, max-age=${ttl}`);
        return c.json(response);
      }
    } catch (error) {
      logger.error('Cache middleware error:', error);
      // Continue without caching on error
      if (!c.res) {
        await next();
      }
    }
  };
};

/**
 * Cache invalidation middleware
 */
export const cacheInvalidationMiddleware = (namespace: string): MiddlewareHandler<{ Bindings: Env }> => {
  return async (c, next) => {
    // Only invalidate on mutation methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      return await next();
    }

    await next();

    // Invalidate cache after successful mutations
    if (c.res.status >= 200 && c.res.status < 300) {
      try {
        const cacheService = new CacheService(c.env.CACHE);
        await cacheService.clearNamespace(namespace);
        logger.info(`Cache invalidated for namespace: ${namespace}`);
      } catch (error) {
        logger.error('Cache invalidation error:', error);
      }
    }
  };
};

/**
 * Conditional caching based on response size
 */
export const conditionalCacheMiddleware = (minSize: number = 1024): MiddlewareHandler<{ Bindings: Env }> => {
  return cacheMiddleware({
    condition: async (c) => {
      // Estimate response size (this is a simplified check)
      const contentLength = c.res?.headers.get('content-length');
      if (contentLength) {
        return parseInt(contentLength) >= minSize;
      }
      return true; // Default to caching if size unknown
    }
  });
};

/**
 * User-specific cache middleware
 */
export const userCacheMiddleware = (options: Omit<CacheOptions, 'keyGenerator'> = {}): MiddlewareHandler<{ Bindings: Env }> => {
  return cacheMiddleware({
    ...options,
    keyGenerator: (c) => {
      const userId = c.get('user')?.id || 'anonymous';
      const path = c.req.path;
      const query = c.req.url.split('?')[1] || '';
      return `user:${userId}:${path}:${query}`;
    }
  });
};
