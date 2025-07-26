import { describe, it, expect, beforeEach } from '@jest/globals';
import { SecurePasswordService } from '../passwordService';

describe('SecurePasswordService', () => {
  let passwordService: SecurePasswordService;

  beforeEach(() => {
    passwordService = new SecurePasswordService();
  });

  describe('hashPassword', () => {
    it('should hash a password using bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await passwordService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('should throw error for invalid password', async () => {
      const shortPassword = '123';
      
      await expect(passwordService.hashPassword(shortPassword))
        .rejects.toThrow('Failed to hash password');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password against bcrypt hash', async () => {
      const password = 'TestPassword123!';
      const hash = await passwordService.hashPassword(password);
      
      const isValid = await passwordService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await passwordService.hashPassword(password);
      
      const isValid = await passwordService.verifyPassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should handle SHA-256 hash verification', async () => {
      const password = 'TestPassword123!';
      // This is SHA-256 hash of 'TestPassword123!'
      const sha256Hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      const isValid = await passwordService.verifyPassword(password, sha256Hash);
      expect(isValid).toBe(true);
    });
  });

  describe('needsMigration', () => {
    it('should detect SHA-256 hash', () => {
      const sha256Hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      expect(passwordService.needsMigration(sha256Hash)).toBe(true);
    });

    it('should not detect bcrypt hash as needing migration', async () => {
      const password = 'TestPassword123!';
      const bcryptHash = await passwordService.hashPassword(password);
      expect(passwordService.needsMigration(bcryptHash)).toBe(false);
    });

    it('should handle invalid hash', () => {
      expect(passwordService.needsMigration('')).toBe(false);
      expect(passwordService.needsMigration('invalid')).toBe(false);
    });
  });

  describe('migrateFromSHA256', () => {
    it('should migrate valid SHA-256 hash to bcrypt', async () => {
      const password = 'TestPassword123!';
      const sha256Hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      const newHash = await passwordService.migrateFromSHA256(password, sha256Hash);
      
      expect(newHash).toBeDefined();
      expect(newHash).not.toBe(sha256Hash);
      expect(newHash!.startsWith('$2a$') || newHash!.startsWith('$2b$')).toBe(true);
      
      // Verify the new hash works
      const isValid = await passwordService.verifyPassword(password, newHash!);
      expect(isValid).toBe(true);
    });

    it('should return null for incorrect password', async () => {
      const wrongPassword = 'WrongPassword123!';
      const sha256Hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      const newHash = await passwordService.migrateFromSHA256(wrongPassword, sha256Hash);
      expect(newHash).toBeNull();
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const strongPassword = 'StrongPassword123!';
      const result = passwordService.validatePasswordStrength(strongPassword);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(['strong', 'very-strong']).toContain(result.strength);
    });

    it('should reject weak password', () => {
      const weakPassword = '123';
      const result = passwordService.validatePasswordStrength(weakPassword);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.strength).toBe('weak');
    });

    it('should detect common patterns', () => {
      const commonPassword = 'password123';
      const result = passwordService.validatePasswordStrength(commonPassword);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('common patterns'))).toBe(true);
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate password of specified length', () => {
      const password = passwordService.generateSecurePassword(16);
      expect(password).toHaveLength(16);
    });

    it('should generate password with required character types', () => {
      const password = passwordService.generateSecurePassword(16);
      
      expect(/[A-Z]/.test(password)).toBe(true); // uppercase
      expect(/[a-z]/.test(password)).toBe(true); // lowercase
      expect(/\d/.test(password)).toBe(true); // number
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)).toBe(true); // special
    });

    it('should generate different passwords each time', () => {
      const password1 = passwordService.generateSecurePassword(16);
      const password2 = passwordService.generateSecurePassword(16);
      
      expect(password1).not.toBe(password2);
    });
  });

  describe('checkPasswordBreach', () => {
    it('should detect common passwords', async () => {
      const commonPassword = 'password';
      const isBreached = await passwordService.checkPasswordBreach(commonPassword);
      expect(isBreached).toBe(true);
    });

    it('should not flag secure passwords', async () => {
      const securePassword = 'SecureUniquePassword123!';
      const isBreached = await passwordService.checkPasswordBreach(securePassword);
      expect(isBreached).toBe(false);
    });
  });
});