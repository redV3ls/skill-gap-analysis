import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { HTML_CONTENT } from './constants/htmlContent';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { compressionMiddleware } from './middleware/compression';
import { performanceTrackingMiddleware } from './middleware/performanceTracking';
import { environmentValidationMiddleware, getEnvironmentHealthStatus } from './middleware/environmentValidation';
// Import routes
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import jobsRoutes from './routes/jobs';
// import analyzeRoutes from './routes/analyze';
// import monitoringRoutes from './routes/monitoring';
// import gdprRoutes from './routes/gdpr';
// import auditRoutes from './routes/audit';
// import trendsRoutes from './routes/trends';
// Temporarily commented out cache imports
// import { cacheMiddleware, userCacheMiddleware } from './middleware/cache';
// import { CacheNamespaces, CacheTTL } from './services/cache';
import { createOpenAPIApp } from './lib/openapi';

export interface Env {
  // Cloudflare bindings (required)
  DB: D1Database;
  CACHE: KVNamespace;
  // RATE_LIMITER: DurableObjectNamespace; // Requires paid plan
  
  // Environment variables
  NODE_ENV?: string;
  JWT_SECRET?: string;
  CORS_ORIGIN?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX_REQUESTS?: string;
  LOG_LEVEL?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global error handler
app.onError(errorHandler);

// Global middleware
app.use('*', environmentValidationMiddleware);
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

// Authentication middleware for protected routes
app.use('/api/v1/*', async (c, next) => {
  const publicPaths = ['/api/v1/auth/login', '/api/v1/auth/register'];
  if (publicPaths.some(path => c.req.path.startsWith(path))) {
    return next();
  }
  return authMiddleware(c, next);
});

// Basic health check
app.get('/health', (c) => {
  const envHealth = getEnvironmentHealthStatus();
  
  return c.json({
    status: envHealth.status === 'valid' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: c.env?.NODE_ENV || 'development',
    validation: envHealth
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
    await c.env.DB.prepare('SELECT 1').first();
    healthStatus.dependencies.database = 'healthy';
  } catch (error) {
    healthStatus.dependencies.database = 'unhealthy';
    healthStatus.status = 'degraded';
  }

  // Check KV cache
  try {
    await c.env.CACHE.put('health_check', 'ok', { expirationTtl: 60 });
    const result = await c.env.CACHE.get('health_check');
    healthStatus.dependencies.cache = result === 'ok' ? 'healthy' : 'unhealthy';
  } catch (error) {
    healthStatus.dependencies.cache = 'unhealthy';
    healthStatus.status = 'degraded';
  }

  const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
  return c.json(healthStatus, statusCode);
});

// API routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', usersRoutes);
app.route('/api/v1/jobs', jobsRoutes);
// app.route('/api/v1/analyze', analyzeRoutes);
// app.route('/api/v1/monitoring', monitoringRoutes);
// app.route('/api/v1/gdpr', gdprRoutes);
// app.route('/api/v1/audit', auditRoutes);
// app.route('/api/v1/trends', trendsRoutes);

// Temporarily commented out OpenAPI docs
// const openAPIApp = createOpenAPIApp();
// app.route('/', openAPIApp);

// API root endpoint
app.get('/api/v1', (c) => {
  return c.json({
    message: 'Clearsight IP API v1',
    version: '1.0.0',
    status: 'Basic endpoints active',
    endpoints: {
      health: '/health',
      root: '/',
      api: '/api/v1',
    },
    note: 'Full API endpoints will be available once database is configured',
    timestamp: new Date().toISOString(),
    cloudflare: {
      colo: c.req.header('CF-RAY')?.split('-')[1] || 'unknown',
      country: c.req.header('CF-IPCountry') || 'unknown',
    },
  });
});

// Root endpoint - serve the HTML home page
app.get('/', (c) => {
  return c.html(HTML_CONTENT);
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
export { default as scheduled } from './scheduled';

export default app;

// Note: Durable Objects require a paid Cloudflare plan
// For free tier, we'll implement rate limiting using KV storage instead
