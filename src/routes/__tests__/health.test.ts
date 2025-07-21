import { Hono } from 'hono';
import { healthRoutes } from '../health';

// Mock environment for Cloudflare Workers
const mockEnv = {
  NODE_ENV: 'test',
  DB: {
    prepare: jest.fn().mockReturnValue({
      first: jest.fn().mockResolvedValue({ result: 1 })
    })
  },
  CACHE: {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue('ok')
  }
};

// Create test app with health routes
const app = new Hono<{ Bindings: typeof mockEnv }>();
app.route('/health', healthRoutes);

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, mockEnv);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
        environment: expect.any(String),
      });
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const req = new Request('http://localhost/health/live');
      const res = await app.fetch(req, mockEnv);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
      });
    });
  });
});