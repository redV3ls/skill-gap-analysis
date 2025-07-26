import { vi } from 'vitest';

// Import test utilities
// Note: auth-mock is available for selective use but not globally applied

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    http: vi.fn(),
  },
}));

// Mock services that depend on external APIs
vi.mock('../services/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    http: vi.fn(),
  },
}));

// Mock logging service
vi.mock('../services/logging', () => ({
  LoggingService: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock performance API for Node.js compatibility
if (typeof performance === 'undefined') {
  global.performance = {
    now: vi.fn(() => Date.now()),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    getEntriesByName: vi.fn(() => []),
    getEntriesByType: vi.fn(() => []),
    getEntries: vi.fn(() => []),
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