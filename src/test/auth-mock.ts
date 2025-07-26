import { jest } from '@jest/globals';
import { Context } from 'hono';

// Mock user for testing
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
};

// Mock authentication middleware that bypasses JWT verification
export function createMockAuthMiddleware(user = mockUser) {
  return jest.fn(async (c: Context, next: () => Promise<void>) => {
    // Set user context
    c.set('user', user);
    await next();
  });
}

// Mock JWT verification
export function mockJwtVerify(token: string) {
  if (token.startsWith('Bearer mock-jwt-token-')) {
    const userId = token.replace('Bearer mock-jwt-token-', '');
    return {
      id: userId,
      email: `${userId}@example.com`,
    };
  }
  throw new Error('Invalid token');
}

// Helper to create authenticated request headers
export function createAuthHeaders(userId: string = 'test-user-id'): Record<string, string> {
  return {
    'Authorization': `Bearer mock-jwt-token-${userId}`,
    'Content-Type': 'application/json',
  };
}

// Mock JWT generation function
export function mockGenerateJWT(payload: any, secret: string, expiresIn: number = 3600): Promise<string> {
  return Promise.resolve(`mock-jwt-token-${payload.id}`);
}

// Mock the auth middleware module
jest.mock('../middleware/auth', () => ({
  authMiddleware: createMockAuthMiddleware(),
  verifyJWT: jest.fn().mockImplementation(mockJwtVerify),
  generateJWT: jest.fn().mockImplementation(mockGenerateJWT),
}));