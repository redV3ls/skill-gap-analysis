export interface ErrorContext {
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
  timestamp: string;
  [key: string]: any;
}

export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly context?: ErrorContext;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational: boolean = true,
    context?: ErrorContext
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.context = context;
    
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack
    };
  }
}

// 400 Bad Request Errors
export class ValidationError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 400, 'VALIDATION_ERROR', true, context);
  }
}

export class InvalidInputError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 400, 'INVALID_INPUT', true, context);
  }
}

export class MissingParameterError extends BaseError {
  constructor(parameter: string, context?: ErrorContext) {
    super(`Missing required parameter: ${parameter}`, 400, 'MISSING_PARAMETER', true, context);
  }
}

// 401 Unauthorized Errors
export class UnauthorizedError extends BaseError {
  constructor(message: string = 'Unauthorized', context?: ErrorContext) {
    super(message, 401, 'UNAUTHORIZED', true, context);
  }
}

export class InvalidTokenError extends BaseError {
  constructor(message: string = 'Invalid authentication token', context?: ErrorContext) {
    super(message, 401, 'INVALID_TOKEN', true, context);
  }
}

export class ExpiredTokenError extends BaseError {
  constructor(message: string = 'Authentication token has expired', context?: ErrorContext) {
    super(message, 401, 'TOKEN_EXPIRED', true, context);
  }
}

// 403 Forbidden Errors
export class ForbiddenError extends BaseError {
  constructor(message: string = 'Access forbidden', context?: ErrorContext) {
    super(message, 403, 'FORBIDDEN', true, context);
  }
}

export class InsufficientPermissionsError extends BaseError {
  constructor(resource: string, context?: ErrorContext) {
    super(`Insufficient permissions to access ${resource}`, 403, 'INSUFFICIENT_PERMISSIONS', true, context);
  }
}

// 404 Not Found Errors
export class NotFoundError extends BaseError {
  constructor(resource: string, context?: ErrorContext) {
    super(`${resource} not found`, 404, 'NOT_FOUND', true, context);
  }
}

export class ResourceNotFoundError extends BaseError {
  constructor(resourceType: string, resourceId: string, context?: ErrorContext) {
    super(`${resourceType} with ID ${resourceId} not found`, 404, 'RESOURCE_NOT_FOUND', true, context);
  }
}

// 409 Conflict Errors
export class ConflictError extends BaseError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 409, 'CONFLICT', true, context);
  }
}

export class DuplicateResourceError extends BaseError {
  constructor(resource: string, field: string, value: string, context?: ErrorContext) {
    super(`${resource} with ${field} '${value}' already exists`, 409, 'DUPLICATE_RESOURCE', true, context);
  }
}

// 429 Too Many Requests
export class RateLimitError extends BaseError {
  constructor(retryAfter?: number, context?: ErrorContext) {
    const message = retryAfter 
      ? `Rate limit exceeded. Please retry after ${retryAfter} seconds`
      : 'Rate limit exceeded';
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true, { ...context, retryAfter });
  }
}

// 500 Internal Server Errors
export class InternalServerError extends BaseError {
  constructor(message: string = 'Internal server error', context?: ErrorContext) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', false, context);
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string = 'Database operation failed', context?: ErrorContext) {
    super(message, 500, 'DATABASE_ERROR', false, context);
  }
}

export class ExternalServiceError extends BaseError {
  constructor(service: string, message?: string, context?: ErrorContext) {
    super(message || `External service '${service}' failed`, 502, 'EXTERNAL_SERVICE_ERROR', false, context);
  }
}

// 503 Service Unavailable
export class ServiceUnavailableError extends BaseError {
  constructor(message: string = 'Service temporarily unavailable', context?: ErrorContext) {
    super(message, 503, 'SERVICE_UNAVAILABLE', false, context);
  }
}

// Business Logic Errors
export class BusinessLogicError extends BaseError {
  constructor(message: string, code: string, context?: ErrorContext) {
    super(message, 422, code, true, context);
  }
}

export class InsufficientSkillsError extends BusinessLogicError {
  constructor(requiredLevel: string, currentLevel: string, skill: string, context?: ErrorContext) {
    super(
      `Insufficient skill level for ${skill}. Required: ${requiredLevel}, Current: ${currentLevel}`,
      'INSUFFICIENT_SKILLS',
      context
    );
  }
}

export class InvalidAnalysisRequestError extends BusinessLogicError {
  constructor(reason: string, context?: ErrorContext) {
    super(`Invalid analysis request: ${reason}`, 'INVALID_ANALYSIS_REQUEST', context);
  }
}

// Error Factory
export class ErrorFactory {
  static createError(type: string, params: any = {}): BaseError {
    switch (type) {
      case 'VALIDATION':
        return new ValidationError(params.message, params.context);
      
      case 'NOT_FOUND':
        return new NotFoundError(params.resource, params.context);
      
      case 'UNAUTHORIZED':
        return new UnauthorizedError(params.message, params.context);
      
      case 'FORBIDDEN':
        return new ForbiddenError(params.message, params.context);
      
      case 'RATE_LIMIT':
        return new RateLimitError(params.retryAfter, params.context);
      
      case 'CONFLICT':
        return new ConflictError(params.message, params.context);
      
      case 'DATABASE':
        return new DatabaseError(params.message, params.context);
      
      case 'INTERNAL':
        return new InternalServerError(params.message, params.context);
      
      default:
        return new BaseError(
          params.message || 'Unknown error',
          params.statusCode || 500,
          params.code || 'UNKNOWN_ERROR',
          params.isOperational !== false,
          params.context
        );
    }
  }

  static isOperationalError(error: Error): boolean {
    if (error instanceof BaseError) {
      return error.isOperational;
    }
    return false;
  }

  static getHttpStatusCode(error: Error): number {
    if (error instanceof BaseError) {
      return error.statusCode;
    }
    return 500;
  }

  static getErrorCode(error: Error): string {
    if (error instanceof BaseError) {
      return error.code;
    }
    return 'UNKNOWN_ERROR';
  }

  static getErrorContext(error: Error): ErrorContext | undefined {
    if (error instanceof BaseError) {
      return error.context;
    }
    return undefined;
  }
}

// Error response formatter
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    path?: string;
    requestId?: string;
    details?: any;
  };
}

export function formatErrorResponse(error: Error, request?: Request): ErrorResponse {
  const isProduction = true; // Always treat as production in Cloudflare Workers
  const errorCode = ErrorFactory.getErrorCode(error);
  const statusCode = ErrorFactory.getHttpStatusCode(error);
  const context = ErrorFactory.getErrorContext(error);
  
  const response: ErrorResponse = {
    error: {
      message: error.message,
      code: errorCode,
      statusCode,
      timestamp: new Date().toISOString(),
      path: request ? new URL(request.url).pathname : context?.path,
      requestId: request?.headers.get('cf-ray') || context?.requestId
    }
  };

  // Add additional details in non-production environments
  if (!isProduction && error instanceof BaseError) {
    response.error.details = {
      stack: error.stack,
      context: error.context
    };
  }

  return response;
}
