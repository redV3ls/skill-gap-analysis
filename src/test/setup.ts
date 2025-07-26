import { jest } from '@jest/globals';

// Import test utilities
import './auth-mock';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    http: jest.fn(),
  },
}));

// Mock services that depend on external APIs
jest.mock('../services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    http: jest.fn(),
  },
}));

// Mock logging service
jest.mock('../services/logging', () => ({
  LoggingService: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock performance API for Node.js compatibility
if (typeof performance === 'undefined') {
  global.performance = {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn(),
    getEntriesByName: jest.fn(() => []),
    getEntriesByType: jest.fn(() => []),
    getEntries: jest.fn(() => []),
  } as any;
}

// Global test utilities for Cloudflare Workers environment
declare global {
  function getMiniflareBindings(): {
    DB: D1Database;
    CACHE: KVNamespace;
  };
}

// Re-export test utilities for convenience
export * from './workers-test-utils';
export * from './drizzle-d1-mock';
export * from './auth-mock';