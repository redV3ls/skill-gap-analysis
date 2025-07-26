import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { logger } from '../utils/logger';

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
}

export interface PasswordService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  needsMigration(hash: string): boolean;
  migrateFromSHA256(password: string, oldHash: string): Promise<string | null>;
  validatePasswordStrength(password: string): PasswordValidationResult;
}

// Password validation schema
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters');

export class SecurePasswordService implements PasswordService {
  private readonly saltRounds = 12; // Good balance of security and performance
  private readonly sha256Regex = /^[a-f0-9]{64}$/i; // SHA-256 produces 64 hex characters

  /**
   * Hash a password using bcrypt with secure salt rounds
   */
  async hashPassword(password: string): Promise<string> {
    try {
      // Validate password format
      passwordSchema.parse(password);
      
      // Hash with bcrypt
      const hash = await bcrypt.hash(password, this.saltRounds);
      
      logger.info('Password hashed successfully');
      return hash;
    } catch (error) {
      logger.error('Error hashing password:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against a bcrypt hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      // Validate inputs
      passwordSchema.parse(password);
      
      if (!hash || typeof hash !== 'string') {
        logger.warn('Invalid hash provided for password verification');
        return false;
      }

      // Check if this is an old SHA-256 hash that needs migration
      if (this.needsMigration(hash)) {
        logger.info('Detected SHA-256 hash during verification');
        return await this.verifyLegacySHA256(password, hash);
      }

      // Verify with bcrypt
      const isValid = await bcrypt.compare(password, hash);
      
      if (isValid) {
        logger.info('Password verification successful');
      } else {
        logger.warn('Password verification failed');
      }
      
      return isValid;
    } catch (error) {
      logger.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Check if a hash needs migration from SHA-256 to bcrypt
   */
  needsMigration(hash: string): boolean {
    if (!hash || typeof hash !== 'string') {
      return false;
    }
    
    // Check if it's a SHA-256 hash (64 hex characters)
    return this.sha256Regex.test(hash);
  }

  /**
   * Migrate from SHA-256 hash to bcrypt
   * Returns new bcrypt hash if migration successful, null otherwise
   */
  async migrateFromSHA256(password: string, oldHash: string): Promise<string | null> {
    try {
      // Verify the password against the old SHA-256 hash
      if (!(await this.verifyLegacySHA256(password, oldHash))) {
        logger.warn('Password does not match SHA-256 hash during migration');
        return null;
      }

      // Create new bcrypt hash
      const newHash = await this.hashPassword(password);
      
      logger.info('Successfully migrated password from SHA-256 to bcrypt');
      return newHash;
    } catch (error) {
      logger.error('Error migrating password hash:', error);
      return null;
    }
  }

  /**
   * Validate password strength and provide feedback
   */
  validatePasswordStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }

    // Character variety checks
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    // Common patterns check
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password should not contain repeated characters');
      score -= 1;
    }

    if (/123|abc|qwe|password|admin/i.test(password)) {
      errors.push('Password should not contain common patterns');
      score -= 1;
    }

    // Determine strength
    let strength: PasswordValidationResult['strength'];
    if (score >= 6) {
      strength = 'very-strong';
    } else if (score >= 4) {
      strength = 'strong';
    } else if (score >= 2) {
      strength = 'medium';
    } else {
      strength = 'weak';
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength
    };
  }

  /**
   * Verify password against legacy SHA-256 hash
   * This is used during migration period only
   */
  private async verifyLegacySHA256(password: string, sha256Hash: string): Promise<boolean> {
    try {
      // Create SHA-256 hash of the password
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      
      // Use Web Crypto API (available in Cloudflare Workers)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex === sha256Hash.toLowerCase();
    } catch (error) {
      logger.error('Error verifying legacy SHA-256 hash:', error);
      return false;
    }
  }

  /**
   * Generate a secure random password
   * Useful for temporary passwords or password reset
   */
  generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    // Ensure at least one character from each required category
    const categories = [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // uppercase
      'abcdefghijklmnopqrstuvwxyz', // lowercase
      '0123456789', // numbers
      '!@#$%^&*()_+-=[]{}|;:,.<>?' // special characters
    ];
    
    // Add one character from each category
    categories.forEach(category => {
      const randomIndex = Math.floor(Math.random() * category.length);
      password += category[randomIndex];
    });
    
    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    
    // Shuffle the password to avoid predictable patterns
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Check if a password has been compromised in known breaches
   * This would typically integrate with services like HaveIBeenPwned
   * For now, it's a placeholder for future implementation
   */
  async checkPasswordBreach(password: string): Promise<boolean> {
    // TODO: Implement integration with breach detection service
    // For now, just check against common passwords
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];
    
    return commonPasswords.includes(password.toLowerCase());
  }
}

// Export singleton instance
export const passwordService = new SecurePasswordService();