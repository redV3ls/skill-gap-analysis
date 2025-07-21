import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { Env } from '../../index';

const app = new OpenAPIHono<{ Bindings: Env }>();

// Register endpoint
const registerRoute = createRoute({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Authentication'],
  summary: 'Register a new user',
  description: 'Create a new user account with email and password',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email().describe('User email address'),
            password: z.string().min(8).describe('Password (minimum 8 characters)'),
            name: z.string().optional().describe('User full name')
          })
        }
      }
    }
  },
  responses: {
    201: {
      description: 'User successfully registered',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            user: z.object({
              id: z.string(),
              email: z.string().email(),
              name: z.string().nullable(),
              role: z.string()
            }),
            token: z.string().describe('JWT authentication token'),
            refreshToken: z.string().describe('JWT refresh token')
          })
        }
      }
    },
    400: {
      description: 'Invalid request data',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.string()
          })
        }
      }
    },
    409: {
      description: 'Email already registered',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.string()
          })
        }
      }
    }
  }
});

// Login endpoint
const loginRoute = createRoute({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Authentication'],
  summary: 'User login',
  description: 'Authenticate with email and password to receive JWT tokens',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email().describe('User email address'),
            password: z.string().describe('User password')
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
            user: z.object({
              id: z.string(),
              email: z.string().email(),
              name: z.string().nullable(),
              role: z.string()
            }),
            token: z.string().describe('JWT authentication token'),
            refreshToken: z.string().describe('JWT refresh token')
          })
        }
      }
    },
    401: {
      description: 'Invalid credentials',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.string()
          })
        }
      }
    }
  }
});

// Get current user endpoint
const getMeRoute = createRoute({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Authentication'],
  summary: 'Get current user',
  description: 'Get information about the authenticated user',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'User information',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            user: z.object({
              id: z.string(),
              email: z.string().email(),
              name: z.string().nullable(),
              role: z.string(),
              createdAt: z.string().datetime(),
              updatedAt: z.string().datetime()
            })
          })
        }
      }
    },
    401: {
      description: 'Not authenticated',
      content: {
        'application/json': {
          schema: z.object({
            error: z.object({
              code: z.string(),
              message: z.string()
            })
          })
        }
      }
    }
  }
});

// Refresh token endpoint
const refreshRoute = createRoute({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Authentication'],
  summary: 'Refresh authentication token',
  description: 'Exchange a refresh token for new access and refresh tokens',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            refreshToken: z.string().describe('Valid refresh token')
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Tokens refreshed successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            token: z.string().describe('New JWT authentication token'),
            refreshToken: z.string().describe('New JWT refresh token')
          })
        }
      }
    },
    401: {
      description: 'Invalid refresh token',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.string()
          })
        }
      }
    }
  }
});

// API Keys endpoints
const getApiKeysRoute = createRoute({
  method: 'get',
  path: '/api/v1/auth/api-keys',
  tags: ['Authentication'],
  summary: 'List API keys',
  description: 'Get all API keys for the authenticated user',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of API keys',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            apiKeys: z.array(z.object({
              id: z.string(),
              name: z.string(),
              key: z.string().describe('Masked API key'),
              scopes: z.array(z.string()),
              createdAt: z.string().datetime(),
              lastUsedAt: z.string().datetime().nullable(),
              expiresAt: z.string().datetime().nullable()
            }))
          })
        }
      }
    }
  }
});

const createApiKeyRoute = createRoute({
  method: 'post',
  path: '/api/v1/auth/api-keys',
  tags: ['Authentication'],
  summary: 'Create API key',
  description: 'Create a new API key with specified scopes',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().describe('API key name/description'),
            scopes: z.array(z.string()).describe('Permissions granted to this key'),
            expiresIn: z.number().optional().describe('Expiration time in seconds')
          })
        }
      }
    }
  },
  responses: {
    201: {
      description: 'API key created successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            apiKey: z.object({
              id: z.string(),
              name: z.string(),
              key: z.string().describe('Full API key (only shown once)'),
              scopes: z.array(z.string()),
              createdAt: z.string().datetime(),
              expiresAt: z.string().datetime().nullable()
            })
          })
        }
      }
    }
  }
});

// Export routes for registration
export const authDocRoutes = {
  register: registerRoute,
  login: loginRoute,
  getMe: getMeRoute,
  refresh: refreshRoute,
  getApiKeys: getApiKeysRoute,
  createApiKey: createApiKeyRoute
};
