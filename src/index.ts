import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { compressionMiddleware } from './middleware/compression';
import { performanceTrackingMiddleware } from './middleware/performanceTracking';
import authRoutes from './routes/auth';
import analyzeRoutes from './routes/analyze';
import usersRoutes from './routes/users';
import monitoringRoutes from './routes/monitoring';
import jobsRoutes from './routes/jobs';
import { cacheMiddleware, userCacheMiddleware } from './middleware/cache';
import { CacheNamespaces, CacheTTL } from './services/cache';

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

// Global error handler
app.onError(errorHandler);

// Global middleware
app.use('*', performanceTrackingMiddleware);
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', secureHeaders({
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
  crossOriginEmbedderPolicy: false, // Disable for API
}));

// CORS configuration
app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = [
      c.env?.CORS_ORIGIN || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      'https://localhost:3001',
    ];
    
    if (!origin) return null; // No origin header (e.g., same-origin requests)
    return allowedOrigins.includes(origin) ? origin : null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Compression middleware (before rate limiting to compress all responses)
app.use('*', compressionMiddleware);

// Rate limiting middleware
app.use('*', rateLimiter);

// Authentication middleware (applied after public routes)
app.use('/api/v1/*', authMiddleware);

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

// Mount auth routes
app.route('/api/v1/auth', authRoutes);

// Mount analyze routes
app.route('/api/v1/analyze', analyzeRoutes);

// Mount users routes
app.route('/api/v1/users', usersRoutes);

// Mount monitoring routes (admin only)
app.route('/api/v1/monitoring', monitoringRoutes);

// Mount jobs routes for async processing
app.route('/api/v1/jobs', jobsRoutes);

// API root endpoint
app.get('/api/v1', (c) => {
  return c.json({
    message: 'Skill Gap Analysis API v1',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      documentation: '/api/v1/docs',
      auth: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        me: 'GET /api/v1/auth/me',
        refresh: 'POST /api/v1/auth/refresh',
        apiKeys: 'GET /api/v1/auth/api-keys',
        createApiKey: 'POST /api/v1/auth/api-keys',
      },
      analyze: {
        gap: 'POST /api/v1/analyze/gap',
        team: 'POST /api/v1/analyze/team',
      },
      users: {
        profile: 'GET /api/v1/users/profile',
        updateProfile: 'POST /api/v1/users/profile',
        updateSkills: 'PUT /api/v1/users/profile/skills',
        skillHistory: 'GET /api/v1/users/profile/skills/history',
        removeSkill: 'DELETE /api/v1/users/profile/skills/:skillId',
      },
      trends: {
        industry: 'GET /api/v1/trends/industry/{industry_id}',
        emerging: 'GET /api/v1/trends/skills/emerging',
        declining: 'GET /api/v1/trends/skills/declining',
        velocity: 'GET /api/v1/trends/skills/velocity',
        geographic: 'GET /api/v1/trends/geographic/{region}',
        forecast: 'POST /api/v1/trends/forecast',
      },
      jobs: {
        submitGapAnalysis: 'POST /api/v1/jobs/gap-analysis',
        submitTeamAnalysis: 'POST /api/v1/jobs/team-analysis',
        submitBulkImport: 'POST /api/v1/jobs/bulk-import',
        getJobStatus: 'GET /api/v1/jobs/{jobId}',
        getJobResult: 'GET /api/v1/jobs/{jobId}/result',
        listJobs: 'GET /api/v1/jobs',
        cancelJob: 'DELETE /api/v1/jobs/{jobId}',
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

// Export for scheduled workers
export { default as scheduled } from './workers/queueWorker';

export default app;

// Note: Durable Objects require a paid Cloudflare plan
// For free tier, we'll implement rate limiting using KV storage instead
