import { Hono } from 'hono';
import { healthRoutes } from '../health';
import { createTestEnvironment, testHonoApp } from '../../test/workers-test-utils';

// Create test app with health routes
const app = new Hono();
app.route('/health', healthRoutes);

describe('Health Routes', () => {
  let testEnv: any;

  beforeEach(() => {
    testEnv = createTestEnvironment({
      dbResponses: {
        'SELECT 1': { result: 1 }
      },
      kvData: {
        'health-check': 'ok'
      }
    });
  });

  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const req = new Request('http://localhost/health');
      const res = await testHonoApp(app, req, testEnv);
      
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
      const res = await testHonoApp(app, req, testEnv);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
      });
    });
  });
});