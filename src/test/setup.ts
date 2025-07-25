// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// Mock Cloudflare Workers global objects
global.Request = global.Request || class MockRequest {
  constructor(public url: string, public init?: RequestInit) {}
  headers = new Map();
  method = 'GET';
  body = null;
  json = async () => ({});
  text = async () => '';
};

global.Response = global.Response || class MockResponse {
  constructor(public body?: any, public init?: ResponseInit) {}
  status = 200;
  headers = new Map();
  json = async () => this.body;
  text = async () => String(this.body);
};

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