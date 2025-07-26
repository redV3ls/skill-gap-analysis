import { Context, Next } from 'hono';
import { Env } from '../index';
import { environmentValidator, EnvironmentValidationReport } from '../services/environmentValidator';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

// Global validation state
let validationReport: EnvironmentValidationReport | null = null;
let validationPerformed = false;

/**
 * Middleware to validate environment on first request
 * This ensures the Worker fails fast if configuration is invalid
 */
export const environmentValidationMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  // Skip validation for health check endpoints during startup
  if (c.req.path === '/health' && !validationPerformed) {
    // Allow basic health check to pass, but mark that we need validation
    return next();
  }

  // Perform validation on first non-health request
  if (!validationPerformed) {
    try {
      logger.info('Performing environment validation on startup');
      validationReport = environmentValidator.validateAll(c.env);
      validationPerformed = true;

      // Log the results
      environmentValidator.logValidationResults(validationReport);

      // If validation fails, prevent the Worker from serving requests
      if (!validationReport.overall.isValid) {
        const errorMessage = 'Environment validation failed - Worker cannot start';
        logger.error(errorMessage, {
          errors: validationReport.overall.errors,
          warnings: validationReport.overall.warnings
        });

        throw new AppError(
          'Service configuration error',
          503,
          'ENVIRONMENT_VALIDATION_FAILED'
        );
      }

      logger.info('Environment validation passed - Worker ready to serve requests');
    } catch (error) {
      validationPerformed = true; // Prevent retry loops
      
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Environment validation error:', error);
      throw new AppError(
        'Service configuration error',
        503,
        'ENVIRONMENT_VALIDATION_ERROR'
      );
    }
  }

  // If we reach here, validation has passed
  return next();
};

/**
 * Get the current validation report
 */
export const getValidationReport = (): EnvironmentValidationReport | null => {
  return validationReport;
};

/**
 * Check if environment validation has been performed
 */
export const isValidationPerformed = (): boolean => {
  return validationPerformed;
};

/**
 * Reset validation state (useful for testing)
 */
export const resetValidationState = (): void => {
  validationReport = null;
  validationPerformed = false;
};

/**
 * Enhanced health check that includes validation status
 */
export const getEnvironmentHealthStatus = () => {
  if (!validationPerformed) {
    return {
      status: 'pending',
      message: 'Environment validation not yet performed'
    };
  }

  if (!validationReport) {
    return {
      status: 'error',
      message: 'Environment validation failed to complete'
    };
  }

  if (!validationReport.overall.isValid) {
    return {
      status: 'invalid',
      message: 'Environment validation failed',
      errors: validationReport.overall.errors,
      warnings: validationReport.overall.warnings
    };
  }

  return {
    status: 'valid',
    message: 'Environment validation passed',
    warnings: validationReport.overall.warnings.length > 0 ? validationReport.overall.warnings : undefined
  };
};

/**
 * Middleware for endpoints that require validated environment
 */
export const requireValidEnvironment = async (c: Context<{ Bindings: Env }>, next: Next) => {
  if (!validationPerformed || !validationReport || !validationReport.overall.isValid) {
    throw new AppError(
      'Service not ready - environment validation required',
      503,
      'ENVIRONMENT_NOT_VALIDATED'
    );
  }

  return next();
};

/**
 * Get detailed validation information for admin endpoints
 */
export const getDetailedValidationInfo = () => {
  if (!validationReport) {
    return null;
  }

  return {
    performed: validationPerformed,
    timestamp: new Date().toISOString(),
    overall: validationReport.overall,
    details: {
      environment: validationReport.environment,
      secrets: validationReport.secrets,
      bindings: validationReport.bindings
    }
  };
};