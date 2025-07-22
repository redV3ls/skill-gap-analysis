import { Hono } from 'hono';
import { z } from 'zod';
import { 
  generateJWT, 
  generateApiKey, 
  storeApiKey, 
  getUserApiKeys, 
  getApiKeyData,
  AuthenticatedContext,
  requireAuth,
  ApiKeyData 
} from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateRequest } from '../schemas/validation';
import { authRateLimiter } from '../middleware/rateLimiter';
import { Env } from '../index';

const auth = new Hono<{ Bindings: Env }>();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  organization: z.string().max(200, 'Organization name too long').optional(),
});

const apiKeyRequestSchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  expires_at: z.string().datetime().optional(),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).default(['read']),
});

// Apply rate limiting to all auth routes
auth.use('*', authRateLimiter);

// User registration
auth.post('/register', validateRequest(registerSchema), async (c) => {
  const validatedData = c.get('validatedData') as z.infer<typeof registerSchema>;
  const { email, password, name, organization } = validatedData;
  
  try {
    // Check if user already exists
    const existingUser = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first();
    
    if (existingUser) {
      throw new AppError('User with this email already exists', 409, 'USER_EXISTS');
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const userId = crypto.randomUUID();
    await c.env.DB
      .prepare('INSERT INTO users (id, email, password_hash, name, organization, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, email, hashedPassword, name, organization || null, 'user', new Date().toISOString())
      .run();
    
    // Generate JWT token
    const token = await generateJWT(
      { id: userId, email, role: 'user' },
      c.env.JWT_SECRET,
      86400 // 24 hours
    );
    
    return c.json({
      message: 'User registered successfully',
      user: {
        id: userId,
        email,
        name,
        organization,
        role: 'user',
      },
      token,
      expires_in: 86400,
    }, 201);
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Registration error:', error);
    throw new AppError('Registration failed', 500, 'REGISTRATION_FAILED');
  }
});

// User login
auth.post('/login', validateRequest(loginSchema), async (c) => {
  const validatedData = c.get('validatedData') as z.infer<typeof loginSchema>;
  const { email, password } = validatedData;
  
  try {
    // Get user from database
    const user = await c.env.DB
      .prepare('SELECT id, email, password_hash, name, organization, role FROM users WHERE email = ?')
      .bind(email)
      .first() as any;
    
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }
    
    // Update last login
    await c.env.DB
      .prepare('UPDATE users SET last_login = ? WHERE id = ?')
      .bind(new Date().toISOString(), user.id)
      .run();
    
    // Generate JWT token
    const token = await generateJWT(
      { id: user.id, email: user.email, role: user.role },
      c.env.JWT_SECRET,
      86400 // 24 hours
    );
    
    return c.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: user.organization,
        role: user.role,
      },
      token,
      expires_in: 86400,
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Login error:', error);
    throw new AppError('Login failed', 500, 'LOGIN_FAILED');
  }
});

// Get current user profile
auth.get('/me', requireAuth, async (c: AuthenticatedContext) => {
  try {
    const user = await c.env.DB
      .prepare('SELECT id, email, name, organization, role, created_at, last_login FROM users WHERE id = ?')
      .bind(c.user!.id)
      .first() as any;
    
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: user.organization,
        role: user.role,
        created_at: user.created_at,
        last_login: user.last_login,
      },
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Get user error:', error);
    throw new AppError('Failed to get user profile', 500, 'GET_USER_FAILED');
  }
});

// Create API key
auth.post('/api-keys', requireAuth, validateRequest(apiKeyRequestSchema), async (c: AuthenticatedContext) => {
  const validatedData = c.get('validatedData') as z.infer<typeof apiKeyRequestSchema>;
  const { name, description, expires_at, permissions } = validatedData;
  
  try {
    const apiKey = generateApiKey();
    const apiKeyId = crypto.randomUUID();
    
    const apiKeyData: ApiKeyData = {
      id: apiKeyId,
      name,
      userId: c.user!.id,
      permissions,
      createdAt: new Date().toISOString(),
      expiresAt: expires_at,
      isActive: true,
    };
    
    // Store in KV
    await storeApiKey(c.env.CACHE, apiKey, apiKeyData);
    
    // Store metadata in database
    await c.env.DB
      .prepare('INSERT INTO api_keys (id, user_id, name, description, permissions, expires_at, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        apiKeyId,
        c.user!.id,
        name,
        description || null,
        JSON.stringify(permissions),
        expires_at || null,
        new Date().toISOString(),
        1
      )
      .run();
    
    return c.json({
      message: 'API key created successfully',
      api_key: {
        id: apiKeyId,
        name,
        key: apiKey, // Only returned once during creation
        permissions,
        expires_at,
        created_at: apiKeyData.createdAt,
      },
      warning: 'Store this API key securely. It will not be shown again.',
    }, 201);
    
  } catch (error) {
    console.error('API key creation error:', error);
    throw new AppError('Failed to create API key', 500, 'API_KEY_CREATION_FAILED');
  }
});

// List user's API keys
auth.get('/api-keys', requireAuth, async (c: AuthenticatedContext) => {
  try {
    const apiKeys = await c.env.DB
      .prepare('SELECT id, name, description, permissions, expires_at, created_at, last_used, is_active FROM api_keys WHERE user_id = ? ORDER BY created_at DESC')
      .bind(c.user!.id)
      .all();
    
    return c.json({
      api_keys: apiKeys.results.map((key: any) => ({
        id: key.id,
        name: key.name,
        description: key.description,
        permissions: JSON.parse(key.permissions),
        expires_at: key.expires_at,
        created_at: key.created_at,
        last_used: key.last_used,
        is_active: Boolean(key.is_active),
        // Never return the actual key value
      })),
    });
    
  } catch (error) {
    console.error('List API keys error:', error);
    throw new AppError('Failed to list API keys', 500, 'LIST_API_KEYS_FAILED');
  }
});

// Revoke API key
auth.delete('/api-keys/:keyId', requireAuth, async (c: AuthenticatedContext) => {
  const keyId = c.req.param('keyId');
  
  try {
    // Check if key belongs to user
    const apiKey = await c.env.DB
      .prepare('SELECT id FROM api_keys WHERE id = ? AND user_id = ?')
      .bind(keyId, c.user!.id)
      .first();
    
    if (!apiKey) {
      throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
    }
    
    // Deactivate in database
    await c.env.DB
      .prepare('UPDATE api_keys SET is_active = 0, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), keyId)
      .run();
    
    // Note: We can't easily remove from KV without the actual key value
    // The key will expire naturally or be rejected due to is_active = false
    
    return c.json({
      message: 'API key revoked successfully',
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Revoke API key error:', error);
    throw new AppError('Failed to revoke API key', 500, 'REVOKE_API_KEY_FAILED');
  }
});

// Refresh JWT token
auth.post('/refresh', requireAuth, async (c: AuthenticatedContext) => {
  try {
    // Generate new token
    const token = await generateJWT(
      { id: c.user!.id, email: c.user!.email, role: c.user!.role || 'user' },
      c.env.JWT_SECRET,
      86400 // 24 hours
    );
    
    return c.json({
      message: 'Token refreshed successfully',
      token,
      expires_in: 86400,
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    throw new AppError('Failed to refresh token', 500, 'TOKEN_REFRESH_FAILED');
  }
});

// Password hashing utility
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Password verification utility
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computedHash = await hashPassword(password);
  return computedHash === hash;
}

export default auth;