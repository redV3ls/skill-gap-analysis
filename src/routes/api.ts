import { Hono } from 'hono';
import { Env } from '../index';

const api = new Hono<{ Bindings: Env }>();

// API version 1 routes
api.use('/v1/*', async (c, next) => {
  // Add API version to response headers
  c.header('API-Version', 'v1');
  await next();
});

// API root endpoint
api.get('/v1', (c) => {
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

// Placeholder endpoints for future implementation
api.get('/v1/docs', (c) => {
  return c.json({
    message: 'API Documentation',
    swagger: '/api/v1/swagger.json',
    redoc: '/api/v1/redoc',
    timestamp: new Date().toISOString(),
  });
});

// Future route groups will be added here:
// api.route('/v1/analyze', analyzeRoutes);
// api.route('/v1/trends', trendsRoutes);
// api.route('/v1/users', usersRoutes);

export { api as apiRoutes };