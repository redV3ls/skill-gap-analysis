import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { healthRoutes } from './routes/health';
import { apiRoutes } from './routes/api';

export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  CACHE: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  
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
    const allowedOrigin = c.env.CORS_ORIGIN || 'http://localhost:3000';
    return origin === allowedOrigin ? allowedOrigin : null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
}));

// Rate limiting
app.use('/api/*', rateLimiter);

// Error handling
app.onError(errorHandler);

// Routes
app.route('/health', healthRoutes);
app.route('/api', authMiddleware, apiRoutes);

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

export default app;