import { jest } from '@jest/globals';
import { Hono } from 'hono';

// Types for Cloudflare Workers environment
export interface TestEnv {
  NODE_ENV: string;
  JWT_SECRET: string;
  DB: D1Database;
  CACHE: KVNamespace;
}

// Mock D1 Database implementation for testing
export class MockD1Database implements D1Database {
  private mockResponses: Map<string, any> = new Map();
  private queryLog: string[] = [];

  constructor(responses: Record<string, any> = {}) {
    Object.entries(responses).forEach(([pattern, response]) => {
      this.mockResponses.set(pattern, response);
    });
  }

  prepare(query: string): D1PreparedStatement {
    this.queryLog.push(query);
    
    const mockStmt: D1PreparedStatement = {
      bind: jest.fn().mockReturnThis(),
      first: jest.fn(async () => {
        // Find matching response based on query patterns
        for (const [pattern, response] of this.mockResponses.entries()) {
          if (query.includes(pattern)) {
            return Array.isArray(response) ? response[0] : response;
          }
        }
        return null;
      }),
      all: jest.fn(async () => {
        // Find matching response based on query patterns
        for (const [pattern, response] of this.mockResponses.entries()) {
          if (query.includes(pattern)) {
            return {
              results: Array.isArray(response) ? response : [response],
              success: true,
              meta: { duration: 1 }
            };
          }
        }
        return { results: [], success: true, meta: { duration: 1 } };
      }),
      run: jest.fn(async () => ({
        success: true,
        meta: { changes: 1, last_row_id: 1, duration: 1 }
      })),
      raw: jest.fn(async () => {
        for (const [pattern, response] of this.mockResponses.entries()) {
          if (query.includes(pattern)) {
            return Array.isArray(response) ? response : [response];
          }
        }
        return [];
      }),
    } as any;

    return mockStmt;
  }

  batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return Promise.resolve(statements.map(() => ({
      success: true,
      meta: { changes: 1, last_row_id: 1, duration: 1 },
      results: []
    })));
  }

  exec(query: string): Promise<D1ExecResult> {
    this.queryLog.push(query);
    return Promise.resolve({
      count: 1,
      duration: 1
    });
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  getQueryLog(): string[] {
    return [...this.queryLog];
  }

  setMockResponse(pattern: string, response: any): void {
    this.mockResponses.set(pattern, response);
  }
}

// Mock KV Namespace implementation for testing
export class MockKVNamespace implements KVNamespace {
  private storage = new Map<string, { value: string; expiration?: number }>();

  async get(key: string, options?: KVNamespaceGetOptions): Promise<string | null> {
    const item = this.storage.get(key);
    if (!item) return null;
    
    if (item.expiration && Date.now() > item.expiration) {
      this.storage.delete(key);
      return null;
    }
    
    if (options?.type === 'json') {
      return JSON.parse(item.value) as any;
    }
    
    return item.value;
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: KVNamespacePutOptions): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const expiration = options?.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : undefined;
    
    this.storage.set(key, { value: stringValue, expiration });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult> {
    const keys = Array.from(this.storage.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix))
      .slice(0, options?.limit || 1000)
      .map(name => ({ name }));

    return {
      keys,
      list_complete: true,
      cursor: undefined
    };
  }

  getWithMetadata<Metadata = unknown>(key: string, options?: KVNamespaceGetOptions): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>> {
    return this.get(key, options).then(value => ({
      value,
      metadata: null as Metadata
    }));
  }

  // Helper methods for testing
  clear(): void {
    this.storage.clear();
  }

  size(): number {
    return this.storage.size;
  }

  has(key: string): boolean {
    return this.storage.has(key);
  }
}

// Create test environment with mocked Cloudflare Workers bindings
export function createTestEnvironment(options: {
  dbResponses?: Record<string, any>;
  kvData?: Record<string, any>;
} = {}): TestEnv {
  const mockDB = new MockD1Database(options.dbResponses || {});
  const mockKV = new MockKVNamespace();

  // Pre-populate KV with test data
  if (options.kvData) {
    Object.entries(options.kvData).forEach(([key, value]) => {
      mockKV.put(key, JSON.stringify(value));
    });
  }

  return {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-key-for-testing-only',
    DB: mockDB as any,
    CACHE: mockKV as any,
  };
}

// Helper to create authenticated request context
export function createAuthenticatedRequest(
  url: string,
  options: RequestInit & { userId?: string } = {}
): Request {
  const { userId = 'test-user-id', ...requestOptions } = options;
  
  const headers = new Headers(requestOptions.headers);
  
  // Add mock JWT token
  const mockToken = `Bearer mock-jwt-token-${userId}`;
  headers.set('Authorization', mockToken);
  
  return new Request(url, {
    ...requestOptions,
    headers,
  });
}

// Helper to test Hono app with Cloudflare Workers environment
export async function testHonoApp<T extends TestEnv>(
  app: Hono<{ Bindings: T }>,
  request: Request,
  env?: T
): Promise<Response> {
  const testEnv = env || createTestEnvironment() as T;
  return app.fetch(request, testEnv);
}

// Mock authentication middleware for testing
export function mockAuthMiddleware(userId: string = 'test-user-id') {
  return jest.fn(async (c: any, next: any) => {
    c.set('user', {
      id: userId,
      email: 'test@example.com',
    });
    await next();
  });
}

// Helper to create test database schema
export function createTestDatabaseSchema(): Record<string, any> {
  return {
    // User profiles
    'SELECT * FROM user_profiles': [
      {
        id: 'profile-1',
        user_id: 'test-user-id',
        title: 'Software Engineer',
        industry: 'Technology',
        location: 'San Francisco, CA',
        experience: 5,
        learning_style: 'visual',
        time_commitment: 10,
        budget_range: '$1000-$5000',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ],
    
    // Skills
    'SELECT * FROM skills': [
      {
        id: 'skill-1',
        name: 'JavaScript',
        category: 'Programming Languages',
        description: 'JavaScript programming language',
        created_at: new Date().toISOString(),
      },
      {
        id: 'skill-2',
        name: 'React',
        category: 'Frontend Frameworks',
        description: 'React JavaScript library',
        created_at: new Date().toISOString(),
      }
    ],
    
    // User skills
    'SELECT * FROM user_skills': [
      {
        id: 'user-skill-1',
        user_id: 'test-user-id',
        skill_id: 'skill-1',
        level: 'intermediate',
        years_experience: 3,
        last_used: new Date().toISOString(),
        certifications: ['JavaScript Fundamentals'],
        confidence_score: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ],
    
    // Gap analyses
    'SELECT * FROM gap_analyses': [
      {
        id: 'analysis-1',
        user_id: 'test-user-id',
        target_job_title: 'Senior Frontend Developer',
        overall_match: 0.75,
        created_at: new Date().toISOString(),
      }
    ],
  };
}