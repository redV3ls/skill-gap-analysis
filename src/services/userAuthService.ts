import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Database } from '../config/database';
import { users } from '../db/schema';
import { passwordService } from './passwordService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organization?: string;
  };
  passwordMigrated: boolean;
}

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

export class UserAuthService {
  constructor(private db: Database) {}

  /**
   * Authenticate user with email and password
   * Handles automatic password migration from SHA-256 to bcrypt
   */
  async authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      // Validate input
      const validatedCredentials = loginSchema.parse(credentials);
      
      // Find user by email
      const userResult = await this.db
        .select()
        .from(users)
        .where(eq(users.email, validatedCredentials.email))
        .limit(1);

      if (userResult.length === 0) {
        logger.warn(`Authentication failed: User not found for email ${validatedCredentials.email}`);
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      const user = userResult[0];

      // Check if password hash exists
      if (!user.passwordHash) {
        logger.error(`User ${user.id} has no password hash`);
        throw new AppError('Account configuration error', 500, 'ACCOUNT_ERROR');
      }

      // Verify password
      const isPasswordValid = await passwordService.verifyPassword(
        validatedCredentials.password,
        user.passwordHash
      );

      if (!isPasswordValid) {
        logger.warn(`Authentication failed: Invalid password for user ${user.id}`);
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
      }

      // Check if password needs migration
      let passwordMigrated = false;
      if (passwordService.needsMigration(user.passwordHash)) {
        passwordMigrated = await this.migrateUserPassword(
          user.id,
          validatedCredentials.password,
          user.passwordHash
        );
      }

      // Update last login
      await this.updateLastLogin(user.id);

      logger.info(`User authenticated successfully: ${user.id}${passwordMigrated ? ' (password migrated)' : ''}`);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organization: user.organization || undefined
        },
        passwordMigrated
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Error during user authentication:', error);
      throw new AppError('Authentication failed', 500, 'AUTH_ERROR');
    }
  }

  /**
   * Migrate user password from SHA-256 to bcrypt
   */
  private async migrateUserPassword(
    userId: string,
    plainPassword: string,
    oldHash: string
  ): Promise<boolean> {
    try {
      // Generate new bcrypt hash
      const newHash = await passwordService.migrateFromSHA256(plainPassword, oldHash);
      
      if (!newHash) {
        logger.error(`Failed to migrate password for user ${userId}`);
        return false;
      }

      // Update user's password hash in database
      await this.db
        .update(users)
        .set({
          passwordHash: newHash,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, userId));

      logger.info(`Password successfully migrated for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Error migrating password for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    try {
      await this.db
        .update(users)
        .set({
          lastLogin: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, userId));
    } catch (error) {
      // Don't fail authentication if last login update fails
      logger.warn(`Failed to update last login for user ${userId}:`, error);
    }
  }

  /**
   * Register a new user with secure password hashing
   */
  async registerUser(userData: {
    email: string;
    password: string;
    name: string;
    organization?: string;
  }): Promise<AuthResult> {
    try {
      // Validate password strength
      const passwordValidation = passwordService.validatePasswordStrength(userData.password);
      if (!passwordValidation.isValid) {
        throw new AppError(
          `Password does not meet requirements: ${passwordValidation.errors.join(', ')}`,
          400,
          'WEAK_PASSWORD'
        );
      }

      // Check if user already exists
      const existingUser = await this.db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new AppError('User already exists with this email', 409, 'USER_EXISTS');
      }

      // Hash password
      const passwordHash = await passwordService.hashPassword(userData.password);

      // Create user
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();

      await this.db.insert(users).values({
        id: userId,
        email: userData.email,
        passwordHash,
        name: userData.name,
        organization: userData.organization,
        role: 'user', // Default role
        createdAt: now,
        updatedAt: now
      });

      logger.info(`New user registered: ${userId}`);

      return {
        user: {
          id: userId,
          email: userData.email,
          name: userData.name,
          role: 'user',
          organization: userData.organization
        },
        passwordMigrated: false
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Error during user registration:', error);
      throw new AppError('Registration failed', 500, 'REGISTRATION_ERROR');
    }
  }

  /**
   * Change user password with proper validation
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      // Get current user
      const userResult = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResult.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      const user = userResult[0];

      // Verify current password
      const isCurrentPasswordValid = await passwordService.verifyPassword(
        currentPassword,
        user.passwordHash
      );

      if (!isCurrentPasswordValid) {
        throw new AppError('Current password is incorrect', 401, 'INVALID_CURRENT_PASSWORD');
      }

      // Validate new password strength
      const passwordValidation = passwordService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new AppError(
          `New password does not meet requirements: ${passwordValidation.errors.join(', ')}`,
          400,
          'WEAK_PASSWORD'
        );
      }

      // Hash new password
      const newPasswordHash = await passwordService.hashPassword(newPassword);

      // Update password
      await this.db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: new Date().toISOString()
        })
        .where(eq(users.id, userId));

      logger.info(`Password changed successfully for user ${userId}`);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error(`Error changing password for user ${userId}:`, error);
      throw new AppError('Password change failed', 500, 'PASSWORD_CHANGE_ERROR');
    }
  }

  /**
   * Generate password reset token (placeholder for future implementation)
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    // TODO: Implement password reset functionality
    // This would typically:
    // 1. Generate a secure random token
    // 2. Store it in the database with expiration
    // 3. Send email to user
    // 4. Return token for testing purposes
    
    throw new AppError('Password reset not yet implemented', 501, 'NOT_IMPLEMENTED');
  }

  /**
   * Reset password using token (placeholder for future implementation)
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // TODO: Implement password reset functionality
    throw new AppError('Password reset not yet implemented', 501, 'NOT_IMPLEMENTED');
  }
}