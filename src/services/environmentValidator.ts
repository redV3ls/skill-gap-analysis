import { Env } from '../index';
import { logger } from '../utils/logger';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnvironmentValidationReport {
  environment: ValidationResult;
  secrets: ValidationResult;
  bindings: ValidationResult;
  overall: ValidationResult;
}

export class EnvironmentValidator {
  /**
   * Validate all environment aspects
   */
  validateAll(env: Env): EnvironmentValidationReport {
    const environment = this.validateEnvironment(env);
    const secrets = this.validateSecrets(env);
    const bindings = this.validateBindings(env);

    // Combine all errors and warnings
    const allErrors = [
      ...environment.errors,
      ...secrets.errors,
      ...bindings.errors
    ];

    const allWarnings = [
      ...environment.warnings,
      ...secrets.warnings,
      ...bindings.warnings
    ];

    const overall: ValidationResult = {
      isValid: environment.isValid && secrets.isValid && bindings.isValid,
      errors: allErrors,
      warnings: allWarnings
    };

    return {
      environment,
      secrets,
      bindings,
      overall
    };
  }

  /**
   * Validate environment variables
   */
  validateEnvironment(env: Env): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check NODE_ENV
    if (!env.NODE_ENV) {
      warnings.push('NODE_ENV not set, defaulting to development');
    } else if (!['development', 'staging', 'production'].includes(env.NODE_ENV)) {
      warnings.push(`NODE_ENV "${env.NODE_ENV}" is not a standard environment`);
    }

    // Check LOG_LEVEL
    if (!env.LOG_LEVEL) {
      warnings.push('LOG_LEVEL not set, defaulting to info');
    } else if (!['debug', 'info', 'warn', 'error'].includes(env.LOG_LEVEL)) {
      warnings.push(`LOG_LEVEL "${env.LOG_LEVEL}" is not valid`);
    }

    // Check CORS_ORIGIN
    if (!env.CORS_ORIGIN) {
      warnings.push('CORS_ORIGIN not set, using default localhost');
    } else {
      try {
        new URL(env.CORS_ORIGIN);
      } catch {
        errors.push(`CORS_ORIGIN "${env.CORS_ORIGIN}" is not a valid URL`);
      }
    }

    // Check rate limiting configuration
    if (env.RATE_LIMIT_WINDOW_MS) {
      const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS);
      if (isNaN(windowMs) || windowMs < 1000) {
        errors.push('RATE_LIMIT_WINDOW_MS must be a number >= 1000');
      }
    }

    if (env.RATE_LIMIT_MAX_REQUESTS) {
      const maxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS);
      if (isNaN(maxRequests) || maxRequests < 1) {
        errors.push('RATE_LIMIT_MAX_REQUESTS must be a positive number');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate required secrets
   */
  validateSecrets(env: Env): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // JWT_SECRET is critical for authentication
    if (!env.JWT_SECRET) {
      errors.push('JWT_SECRET is required for authentication');
    } else {
      // Validate JWT secret strength
      const secretValidation = this.validateJWTSecret(env.JWT_SECRET);
      if (!secretValidation.isValid) {
        errors.push(...secretValidation.errors);
      }
      warnings.push(...secretValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate Cloudflare bindings
   */
  validateBindings(env: Env): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check D1 Database binding
    if (!env.DB) {
      errors.push('DB binding is required but not available');
    } else {
      // Try to validate DB binding is functional
      try {
        // This is a basic check - we can't run async operations here
        if (typeof env.DB.prepare !== 'function') {
          errors.push('DB binding does not appear to be a valid D1Database');
        }
      } catch (error) {
        warnings.push('Could not validate DB binding functionality');
      }
    }

    // Check KV Cache binding
    if (!env.CACHE) {
      errors.push('CACHE binding is required but not available');
    } else {
      // Try to validate KV binding is functional
      try {
        if (typeof env.CACHE.get !== 'function' || typeof env.CACHE.put !== 'function') {
          errors.push('CACHE binding does not appear to be a valid KVNamespace');
        }
      } catch (error) {
        warnings.push('Could not validate CACHE binding functionality');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate JWT secret strength
   */
  private validateJWTSecret(secret: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Length check
    if (secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    } else if (secret.length < 64) {
      warnings.push('JWT_SECRET should be at least 64 characters for better security');
    }

    // Entropy check (basic)
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 10) {
      warnings.push('JWT_SECRET has low entropy, consider using more varied characters');
    }

    // Common weak secrets
    const weakSecrets = [
      'your-super-secret-jwt-key-change-this-in-production',
      'test-secret-key-for-testing-only',
      'secret',
      'jwt-secret',
      'change-me'
    ];

    if (weakSecrets.includes(secret.toLowerCase())) {
      errors.push('JWT_SECRET appears to be a default/example value and must be changed');
    }

    // Pattern checks
    if (/^(.)\1+$/.test(secret)) {
      errors.push('JWT_SECRET cannot be all the same character');
    }

    if (/^(012|123|abc|qwe)/i.test(secret)) {
      warnings.push('JWT_SECRET starts with a common pattern, consider using random generation');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate validation report as formatted string
   */
  formatValidationReport(report: EnvironmentValidationReport): string {
    const lines: string[] = [];
    
    lines.push('🔍 Environment Validation Report');
    lines.push('================================');
    
    if (report.overall.isValid) {
      lines.push('✅ Overall Status: VALID');
    } else {
      lines.push('❌ Overall Status: INVALID');
    }
    
    lines.push('');

    // Environment Variables
    lines.push('📋 Environment Variables:');
    if (report.environment.isValid) {
      lines.push('  ✅ Valid');
    } else {
      lines.push('  ❌ Invalid');
      report.environment.errors.forEach(error => {
        lines.push(`    - ERROR: ${error}`);
      });
    }
    report.environment.warnings.forEach(warning => {
      lines.push(`    - WARNING: ${warning}`);
    });
    lines.push('');

    // Secrets
    lines.push('🔐 Secrets:');
    if (report.secrets.isValid) {
      lines.push('  ✅ Valid');
    } else {
      lines.push('  ❌ Invalid');
      report.secrets.errors.forEach(error => {
        lines.push(`    - ERROR: ${error}`);
      });
    }
    report.secrets.warnings.forEach(warning => {
      lines.push(`    - WARNING: ${warning}`);
    });
    lines.push('');

    // Bindings
    lines.push('🔗 Cloudflare Bindings:');
    if (report.bindings.isValid) {
      lines.push('  ✅ Valid');
    } else {
      lines.push('  ❌ Invalid');
      report.bindings.errors.forEach(error => {
        lines.push(`    - ERROR: ${error}`);
      });
    }
    report.bindings.warnings.forEach(warning => {
      lines.push(`    - WARNING: ${warning}`);
    });

    return lines.join('\n');
  }

  /**
   * Log validation results
   */
  logValidationResults(report: EnvironmentValidationReport): void {
    const formattedReport = this.formatValidationReport(report);
    
    if (report.overall.isValid) {
      logger.info('Environment validation passed');
      if (report.overall.warnings.length > 0) {
        logger.warn('Environment validation warnings:', {
          warnings: report.overall.warnings
        });
      }
    } else {
      logger.error('Environment validation failed');
      logger.error(formattedReport);
    }
  }

  /**
   * Validate environment and throw error if invalid
   */
  validateOrThrow(env: Env): void {
    const report = this.validateAll(env);
    
    this.logValidationResults(report);
    
    if (!report.overall.isValid) {
      const errorMessage = `Environment validation failed:\n${this.formatValidationReport(report)}`;
      throw new Error(errorMessage);
    }
  }
}

// Export singleton instance
export const environmentValidator = new EnvironmentValidator();