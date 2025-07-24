// Debug script to test user routes
const { Hono } = require('hono');

// Mock environment
const mockEnv = {
  DB: {
    prepare: jest.fn().mockReturnValue({
      bind: jest.fn().mockReturnValue({
        first: jest.fn(),
        all: jest.fn(),
        run: jest.fn()
      })
    }),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn()
  },
  CACHE: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  },
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-key-for-jwt-signing',
  CORS_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  LOG_LEVEL: 'info'
};

console.log('Mock DB methods:', Object.keys(mockEnv.DB));
console.log('Mock DB select type:', typeof mockEnv.DB.select);