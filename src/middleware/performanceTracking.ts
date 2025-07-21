import { Context, Next } from 'hono';
import { Env } from '../index';

interface RequestMetrics {
  timestamp: number;
  method: string;
  path: string;
  status: number;
  duration: number;
  userAgent?: string;
  country?: string;
  colo?: string;
}

export const performanceTrackingMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const startTime = Date.now();
  const requestId = c.req.header('CF-Ray') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Log request start
  console.log(`[${requestId}] ${c.req.method} ${c.req.path} - Request started`);

  try {
    await next();
  } finally {
    const duration = Date.now() - startTime;
    const status = c.res.status;

    // Create metrics object
    const metrics: RequestMetrics = {
      timestamp: startTime,
      method: c.req.method,
      path: c.req.path,
      status,
      duration,
      userAgent: c.req.header('User-Agent'),
      country: c.req.header('CF-IPCountry'),
      colo: c.req.header('CF-Ray')?.split('-')[1],
    };

    // Log request completion
    console.log(`[${requestId}] ${c.req.method} ${c.req.path} - ${status} - ${duration}ms`);

    // Add performance headers
    c.header('X-Response-Time', `${duration}ms`);
    c.header('X-Request-ID', requestId);

    // Store metrics in KV (aggregated by hour)
    if (c.env?.CACHE) {
      try {
        const hourKey = new Date(startTime).toISOString().slice(0, 13); // YYYY-MM-DDTHH
        const metricsKey = `metrics:${hourKey}`;

        // Get existing metrics for this hour
        const existingMetrics = await c.env.CACHE.get(metricsKey, 'json') || {
          totalRequests: 0,
          totalDuration: 0,
          statusCodes: {},
          endpoints: {},
          slowRequests: [],
        };

        // Update metrics
        existingMetrics.totalRequests++;
        existingMetrics.totalDuration += duration;
        existingMetrics.statusCodes[status] = (existingMetrics.statusCodes[status] || 0) + 1;
        existingMetrics.endpoints[c.req.path] = (existingMetrics.endpoints[c.req.path] || 0) + 1;

        // Track slow requests (> 500ms)
        if (duration > 500) {
          existingMetrics.slowRequests.push({
            path: c.req.path,
            method: c.req.method,
            duration,
            timestamp: new Date(startTime).toISOString(),
          });
          // Keep only the last 100 slow requests
          if (existingMetrics.slowRequests.length > 100) {
            existingMetrics.slowRequests = existingMetrics.slowRequests.slice(-100);
          }
        }

        // Store updated metrics with 25 hour TTL
        await c.env.CACHE.put(metricsKey, JSON.stringify(existingMetrics), {
          expirationTtl: 90000, // 25 hours
        });

        // Update daily summary
        const dailyKey = `metrics:daily:${new Date(startTime).toISOString().slice(0, 10)}`;
        const dailyMetrics = await c.env.CACHE.get(dailyKey, 'json') || {
          requests: 0,
          avgResponseTime: 0,
          errors: 0,
          uniquePaths: new Set(),
        };

        dailyMetrics.requests++;
        dailyMetrics.avgResponseTime = 
          (dailyMetrics.avgResponseTime * (dailyMetrics.requests - 1) + duration) / dailyMetrics.requests;
        if (status >= 400) {
          dailyMetrics.errors++;
        }
        dailyMetrics.uniquePaths.add(c.req.path);

        await c.env.CACHE.put(dailyKey, JSON.stringify({
          ...dailyMetrics,
          uniquePaths: Array.from(dailyMetrics.uniquePaths),
        }), {
          expirationTtl: 2592000, // 30 days
        });

      } catch (error) {
        console.error('Failed to store performance metrics:', error);
      }
    }
  }
};

// Lightweight version that only adds headers
export const lightweightPerformanceMiddleware = async (c: Context, next: Next) => {
  const startTime = Date.now();
  await next();
  const duration = Date.now() - startTime;
  
  c.header('X-Response-Time', `${duration}ms`);
  c.header('X-Request-ID', c.req.header('CF-Ray') || `req_${Date.now()}`);
};
