import { beforeAll, afterAll, beforeEach } from 'vitest';

// Global test configuration for integration tests
beforeAll(async () => {
  // Set up test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
  
  console.log('Setting up integration test environment...');
});

afterAll(async () => {
  // Clean up after all tests
  console.log('Cleaning up integration test environment...');
});

beforeEach(async () => {
  // Reset state before each test
  console.log('Resetting test state...');
});

// Mock external services for integration tests
global.fetch = async (url: string, options?: RequestInit) => {
  console.log(`Mock fetch called: ${url}`);
  
  // Mock responses for external APIs
  if (url.includes('/api/external')) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Default mock response
  return new Response('Not Found', { status: 404 });
};

// Export test utilities
export const testUtils = {
  createMockRequest: (path: string, options: RequestInit = {}) => {
    return new Request(`http://localhost:8787${path}`, {
      method: 'GET',
      ...options,
    });
  },
  
  createMockEnv: () => ({
    JWT_SECRET: 'test-jwt-secret',
    ENVIRONMENT: 'test',
    DB: {} as any, // Mock D1 database
    CACHE: {} as any, // Mock KV namespace
  }),
  
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};