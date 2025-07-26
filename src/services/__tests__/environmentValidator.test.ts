import { describe, it, expect, beforeEach } from 'vitest';
import { EnvironmentValidator } from '../environmentValidator';
import { Env } from '../../index';

describe('EnvironmentValidator', () => {
  let validator: EnvironmentValidator;
  let mockEnv: Env;

  beforeEach(() => {
    validator = new EnvironmentValidator();
    
    // Create a valid mock environment
    mockEnv = {
      DB: {
        prepare: vi.fn(() => ({ first: vi.fn() }))
      } as any,
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
      } as any,
      NODE_ENV: 'development',
      JWT_SECRET: 'a-very-secure-jwt-secret-that-is-long-enough-for-production-use-12345',
      CORS_ORIGIN: 'http://localhost:3000',
      RATE_LIMIT_WINDOW_MS: '900000',
      RATE_LIMIT_MAX_REQUESTS: '100',
      LOG_LEVEL: 'info'
    };
  });

  describe('validateEnvironment', () => {
    it('should pass validation with valid environment variables', () => {
      const result = validator.validateEnvironment(mockEnv);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about missing NODE_ENV', () => {
      delete mockEnv.NODE_ENV;
      
      const result = validator.validateEnvironment(mockEnv);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('NODE_ENV not set'))).toBe(true);
    });

    it('should error on invalid CORS_ORIGIN', () => {
      mockEnv.CORS_ORIGIN = 'not-a-valid-url';
      
      const result = validator.validateEnvironment(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('not a valid URL'))).toBe(true);
    });

    it('should error on invalid rate limit configuration', () => {
      mockEnv.RATE_LIMIT_WINDOW_MS = 'invalid';
      mockEnv.RATE_LIMIT_MAX_REQUESTS = '-1';
      
      const result = validator.validateEnvironment(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('RATE_LIMIT_WINDOW_MS'))).toBe(true);
      expect(result.errors.some(e => e.includes('RATE_LIMIT_MAX_REQUESTS'))).toBe(true);
    });
  });

  describe('validateSecrets', () => {
    it('should pass validation with strong JWT secret', () => {
      const result = validator.validateSecrets(mockEnv);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error when JWT_SECRET is missing', () => {
      delete mockEnv.JWT_SECRET;
      
      const result = validator.validateSecrets(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('JWT_SECRET is required'))).toBe(true);
    });

    it('should error on weak JWT secret', () => {
      mockEnv.JWT_SECRET = 'weak';
      
      const result = validator.validateSecrets(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 32 characters'))).toBe(true);
    });

    it('should error on default JWT secret', () => {
      mockEnv.JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';
      
      const result = validator.validateSecrets(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('default/example value'))).toBe(true);
    });

    it('should warn on medium-strength JWT secret', () => {
      mockEnv.JWT_SECRET = 'this-is-a-medium-strength-secret-key'; // 38 chars, less than 64
      
      const result = validator.validateSecrets(mockEnv);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('should be at least 64 characters'))).toBe(true);
    });
  });

  describe('validateBindings', () => {
    it('should pass validation with valid bindings', () => {
      const result = validator.validateBindings(mockEnv);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error when DB binding is missing', () => {
      delete mockEnv.DB;
      
      const result = validator.validateBindings(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('DB binding is required'))).toBe(true);
    });

    it('should error when CACHE binding is missing', () => {
      delete mockEnv.CACHE;
      
      const result = validator.validateBindings(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('CACHE binding is required'))).toBe(true);
    });

    it('should error when DB binding is invalid', () => {
      mockEnv.DB = {} as any; // Invalid binding without prepare method
      
      const result = validator.validateBindings(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('not appear to be a valid D1Database'))).toBe(true);
    });

    it('should error when CACHE binding is invalid', () => {
      mockEnv.CACHE = {} as any; // Invalid binding without get/put methods
      
      const result = validator.validateBindings(mockEnv);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('not appear to be a valid KVNamespace'))).toBe(true);
    });
  });

  describe('validateAll', () => {
    it('should pass overall validation with valid environment', () => {
      const report = validator.validateAll(mockEnv);
      
      expect(report.overall.isValid).toBe(true);
      expect(report.environment.isValid).toBe(true);
      expect(report.secrets.isValid).toBe(true);
      expect(report.bindings.isValid).toBe(true);
    });

    it('should fail overall validation if any component fails', () => {
      delete mockEnv.JWT_SECRET; // Make secrets invalid
      
      const report = validator.validateAll(mockEnv);
      
      expect(report.overall.isValid).toBe(false);
      expect(report.environment.isValid).toBe(true);
      expect(report.secrets.isValid).toBe(false);
      expect(report.bindings.isValid).toBe(true);
    });

    it('should combine all errors and warnings', () => {
      delete mockEnv.JWT_SECRET;
      delete mockEnv.NODE_ENV;
      mockEnv.CORS_ORIGIN = 'invalid-url';
      
      const report = validator.validateAll(mockEnv);
      
      expect(report.overall.errors.length).toBeGreaterThan(0);
      expect(report.overall.warnings.length).toBeGreaterThan(0);
      expect(report.overall.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);
      expect(report.overall.errors.some(e => e.includes('CORS_ORIGIN'))).toBe(true);
      expect(report.overall.warnings.some(w => w.includes('NODE_ENV'))).toBe(true);
    });
  });

  describe('formatValidationReport', () => {
    it('should format a valid report correctly', () => {
      const report = validator.validateAll(mockEnv);
      const formatted = validator.formatValidationReport(report);
      
      expect(formatted).toContain('Environment Validation Report');
      expect(formatted).toContain('✅ Overall Status: VALID');
      expect(formatted).toContain('📋 Environment Variables:');
      expect(formatted).toContain('🔐 Secrets:');
      expect(formatted).toContain('🔗 Cloudflare Bindings:');
    });

    it('should format an invalid report correctly', () => {
      delete mockEnv.JWT_SECRET;
      
      const report = validator.validateAll(mockEnv);
      const formatted = validator.formatValidationReport(report);
      
      expect(formatted).toContain('❌ Overall Status: INVALID');
      expect(formatted).toContain('ERROR: JWT_SECRET is required');
    });
  });

  describe('validateOrThrow', () => {
    it('should not throw with valid environment', () => {
      expect(() => validator.validateOrThrow(mockEnv)).not.toThrow();
    });

    it('should throw with invalid environment', () => {
      delete mockEnv.JWT_SECRET;
      
      expect(() => validator.validateOrThrow(mockEnv)).toThrow('Environment validation failed');
    });
  });
});