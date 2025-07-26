import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { validateBody, validateHeaders } from '../middleware/inputValidation';
import { UserAuthService } from '../services/userAuthService';
import { generateJWT } from '../middleware/auth';
import { DatabaseManager } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { authRateLimiter } from '../middleware/rateLimiter';

const auth = new Hono<{ Bindings: Env }>();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(1, 'Password is required').max(128)
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().min(1, 'Name is required').max(255),
  organization: z.string().max(255).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128)
});

// Apply rate limiting to all auth routes
auth.use('*', authRateLimiter);

/**
 * POST /auth/login
 * Authenticate user with email and password
 */
auth.post('/login', 
  validateBody(loginSchema, { sanitize: true }),
  async (c) => {
    try {
      const credentials = c.get('validatedBody');
      const db = DatabaseManager.initialize(c.env.DB);
      const authService = new UserAuthService(db);

      const authResult = await authService.authenticateUser(credentials);

      // Generate JWT token
      if (!c.env.JWT_SECRET) {
        throw new AppError('JWT service unavailable', 500, 'SERVICE_UNAVAILABLE');
      }

      const token = await generateJWT({
        id: authResult.user.id,
        email: authResult.user.email,
        role: authResult.user.role
      }, c.env.JWT_SECRET);

      return c.json({
        success: true,
        data: {
          user: authResult.user,
          token,
          passwordMigrated: authResult.passwordMigrated
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Login failed', 500, 'LOGIN_ERROR');
    }
  }
);

/**
 * POST /auth/register
 * Register a new user account
 */
auth.post('/register',
  validateBody(registerSchema, { sanitize: true }),
  async (c) => {
    try {
      const userData = c.get('validatedBody');
      const db = DatabaseManager.initialize(c.env.DB);
      const authService = new UserAuthService(db);

      const authResult = await authService.registerUser(userData);

      // Generate JWT token
      if (!c.env.JWT_SECRET) {
        throw new AppError('JWT service unavailable', 500, 'SERVICE_UNAVAILABLE');
      }

      const token = await generateJWT({
        id: authResult.user.id,
        email: authResult.user.email,
        role: authResult.user.role
      }, c.env.JWT_SECRET);

      return c.json({
        success: true,
        data: {
          user: authResult.user,
          token
        }
      }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Registration failed', 500, 'REGISTRATION_ERROR');
    }
  }
);

/**
 * POST /auth/change-password
 * Change user password (requires authentication)
 */
auth.post('/change-password',
  validateHeaders(['Authorization']),
  validateBody(changePasswordSchema, { sanitize: true }),
  async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
      }

      const { currentPassword, newPassword } = c.get('validatedBody');
      const db = DatabaseManager.initialize(c.env.DB);
      const authService = new UserAuthService(db);

      await authService.changePassword(user.id, currentPassword, newPassword);

      return c.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Password change failed', 500, 'PASSWORD_CHANGE_ERROR');
    }
  }
);

/**
 * POST /auth/logout
 * Logout user (placeholder for token invalidation)
 */
auth.post('/logout',
  validateHeaders(['Authorization']),
  async (c) => {
    // In a stateless JWT system, logout is typically handled client-side
    // In the future, we could implement token blacklisting
    return c.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
);

/**
 * GET /auth/me
 * Get current user information
 */
auth.get('/me',
  validateHeaders(['Authorization']),
  async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
      }

      return c.json({
        success: true,
        data: {
          user
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to get user information', 500, 'USER_INFO_ERROR');
    }
  }
);

export default auth;