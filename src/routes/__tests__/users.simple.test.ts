import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Hono } from 'hono';
import { Env } from '../../index';
import usersRoutes from '../users';

// Simple test to verify basic functionality
describe('Users Routes - Simple Tests', () => {
  let app: Hono<{ Bindings: Env }>;
  let mockEnv: Env;

  beforeEach(() => {
    // Create a simple mock environment
    mockEnv = {
      DB: {} as any,
      CACHE: {} as any,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      CORS_ORIGIN: 'http://localhost:3000',
      RATE_LIMIT_WINDOW_MS: '900000',
      RATE_LIMIT_MAX_REQUESTS: '100',
      LOG_LEVEL: 'info'
    };

    app = new Hono<{ Bindings: Env }>();
    
    // Mock environment middleware
    app.use('*', async (c, next) => {
      (c as any).env = mockEnv;
      await next();
    });

    // Mock authentication middleware
    app.use('/users/*', async (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: { message: 'Authentication required' } }, 401);
      }
      // Mock authenticated user
      (c as any).user = {
        id: 'test-user-123',
        email: 'test@example.com',
        role: 'user'
      };
      return next();
    });

    app.route('/users', usersRoutes);
  });

  it('should require authentication for profile endpoint', async () => {
    const response = await app.request('/users/profile', {
      method: 'GET'
    });

    expect(response.status).toBe(401);
  });

  it('should handle missing database connection', async () => {
    // Set DB to null to simulate missing connection
    mockEnv.DB = null as any;

    const response = await app.request('/users/profile', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });

    expect(response.status).toBe(500);
    const responseText = await response.text();
    console.log('Response text:', responseText);
    // Try to parse as JSON if possible
    try {
      const result = JSON.parse(responseText);
      expect(result.error.code).toBe('DATABASE_UNAVAILABLE');
    } catch (e) {
      // If not JSON, check if it contains the expected error
      expect(responseText).toContain('DATABASE_UNAVAILABLE');
    }
  });

  it('should handle missing user context', async () => {
    // Override auth middleware to not set user
    app.use('/users/*', async (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: { message: 'Authentication required' } }, 401);
      }
      // Don't set user context
      return next();
    });

    const response = await app.request('/users/profile', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });

    expect(response.status).toBe(500);
    const responseText = await response.text();
    console.log('Response text:', responseText);
    // Try to parse as JSON if possible
    try {
      const result = JSON.parse(responseText);
      expect(result.error.code).toBe('USER_NOT_AUTHENTICATED');
    } catch (e) {
      // If not JSON, check if it contains the expected error
      expect(responseText).toContain('USER_NOT_AUTHENTICATED');
    }
  });
});