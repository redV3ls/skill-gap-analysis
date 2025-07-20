import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  CACHE: KVNamespace;
  // RATE_LIMITER: DurableObjectNamespace; // Requires paid plan
  
  // Environment variables
  NODE_ENV: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_WINDOW_MS: string;
  RATE_LIMIT_MAX_REQUESTS: string;
  LOG_LEVEL: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// CORS configuration
app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigin = c.env?.CORS_ORIGIN || 'http://localhost:3000';
    return origin === allowedOrigin ? allowedOrigin : null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
}));

// Basic health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: c.env?.NODE_ENV || 'development',
  });
});

// Detailed health check
app.get('/health/detailed', async (c) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: c.env?.NODE_ENV || 'development',
    dependencies: {
      database: 'unknown',
      cache: 'unknown',
    },
    cloudflare: {
      colo: c.req.header('CF-RAY')?.split('-')[1] || 'unknown',
      country: c.req.header('CF-IPCountry') || 'unknown',
      ray: c.req.header('CF-RAY') || 'unknown',
    },
  };

  // Check D1 database connection
  try {
    if (c.env?.DB) {
      await c.env.DB.prepare('SELECT 1').first();
      healthStatus.dependencies.database = 'healthy';
    }
  } catch (error) {
    healthStatus.dependencies.database = 'unhealthy';
    healthStatus.status = 'degraded';
  }

  // Check KV cache
  try {
    if (c.env?.CACHE) {
      await c.env.CACHE.put('health_check', 'ok', { expirationTtl: 60 });
      const result = await c.env.CACHE.get('health_check');
      healthStatus.dependencies.cache = result === 'ok' ? 'healthy' : 'unhealthy';
    }
  } catch (error) {
    healthStatus.dependencies.cache = 'unhealthy';
    healthStatus.status = 'degraded';
  }

  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
  return c.json(healthStatus, statusCode);
});

// API root endpoint
app.get('/api/v1', (c) => {
  return c.json({
    message: 'Skill Gap Analysis API v1',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      documentation: '/api/v1/docs',
      analyze: {
        gap: 'POST /api/v1/analyze/gap',
        team: 'POST /api/v1/analyze/team',
      },
      trends: {
        industry: 'GET /api/v1/trends/industry/{industry_id}',
        skills: 'GET /api/v1/trends/skills/emerging',
        geographic: 'GET /api/v1/trends/geographic/{region}',
      },
    },
    timestamp: new Date().toISOString(),
    cloudflare: {
      colo: c.req.header('CF-RAY')?.split('-')[1] || 'unknown',
      country: c.req.header('CF-IPCountry') || 'unknown',
    },
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Skill Gap Analysis API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api/v1',
      documentation: '/api/v1/docs',
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      path: c.req.path,
    },
  }, 404);
});

export default app;

// Note: Durable Objects require a paid Cloudflare plan
// For free tier, we'll implement rate limiting using KV storage instead