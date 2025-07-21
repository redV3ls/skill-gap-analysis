# Error Handling and Logging Documentation

This document describes the comprehensive error handling and logging system implemented in the Skill Gap Analysis API.

## Overview

The system provides:
- Structured error responses
- Error tracking with KV storage
- Comprehensive logging capabilities
- Performance monitoring
- Error analytics and alerting
- Cloudflare Analytics integration

## Error Handling

### Error Types

1. **AppError** - Custom application errors
   ```typescript
   throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');
   ```

2. **HTTPException** - Hono framework errors
3. **ZodError** - Validation errors
4. **Generic Errors** - Unexpected errors

### Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "6e7c4b2a-7654-4321-b987-1234567890ab",
    "details": {} // Optional, for validation errors
  }
}
```

### Error Codes

Common error codes used throughout the API:

- `VALIDATION_ERROR` - Invalid input data
- `AUTH_ERROR` - Authentication failed
- `UNAUTHORIZED` - Missing or invalid credentials
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `DATABASE_ERROR` - Database operation failed
- `INTERNAL_ERROR` - Unexpected server error

### Error Tracking

Errors are automatically tracked and stored in KV with:
- Full error context
- Request details
- User information
- Performance impact
- Geographic data

## Logging System

### Log Levels

- `debug` - Detailed debugging information
- `info` - General informational messages
- `warn` - Warning messages
- `error` - Error messages
- `critical` - Critical system errors

### Logging Service Usage

```typescript
import { LoggingService } from './services/logging';

const logger = new LoggingService(env);

// Basic logging
await logger.info('User logged in', { userId: user.id });
await logger.error('Database connection failed', error);

// HTTP request logging
await logger.logRequest(context, duration, statusCode);
```

### Log Entry Structure

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "message": "User authentication successful",
  "context": {
    "userId": "123",
    "action": "login"
  },
  "metadata": {
    "requestId": "cf-ray-id",
    "path": "/api/v1/auth/login",
    "method": "POST",
    "duration": 125,
    "statusCode": 200,
    "ip": "192.168.1.1",
    "country": "US",
    "userAgent": "Mozilla/5.0..."
  }
}
```

## Monitoring Endpoints

### Error Monitoring

- `GET /api/v1/monitoring/errors/stats` - Error statistics
- `GET /api/v1/monitoring/errors/:errorId` - Specific error details
- `GET /api/v1/monitoring/errors?code=CODE&level=LEVEL` - Query errors

### Log Monitoring

- `GET /api/v1/monitoring/logs/stats?hours=24` - Log statistics
- `GET /api/v1/monitoring/logs?level=error&path=/api/v1/auth` - Query logs

### Cleanup

- `POST /api/v1/monitoring/cleanup` - Clean up old logs and errors
  ```json
  {
    "daysToKeep": 7
  }
  ```

## Configuration

### Environment Variables

```env
LOG_LEVEL=info           # Minimum log level to record
ERROR_RETENTION_DAYS=7   # Days to keep error records
LOG_RETENTION_DAYS=7     # Days to keep log entries
ENABLE_KV_LOGGING=true   # Enable KV storage for logs
```

### Middleware Order

The error handler must be registered first in the middleware chain:

```typescript
app.onError(errorHandler);
app.use('*', performanceTrackingMiddleware);
app.use('*', logger());
```

## Best Practices

### Error Handling

1. **Use Specific Error Codes**
   ```typescript
   throw new AppError('User not found', 404, 'USER_NOT_FOUND');
   ```

2. **Include Context**
   ```typescript
   throw new AppError(
     'Failed to process payment',
     500,
     'PAYMENT_FAILED',
     { orderId, amount }
   );
   ```

3. **Handle Async Errors**
   ```typescript
   app.get('/route', asyncHandler(async (c) => {
     // Async code automatically wrapped
   }));
   ```

### Logging

1. **Log at Appropriate Levels**
   - Use `debug` for development details
   - Use `info` for normal operations
   - Use `warn` for potential issues
   - Use `error` for actual errors
   - Use `critical` for system failures

2. **Include Relevant Context**
   ```typescript
   logger.info('Order processed', {
     orderId: order.id,
     userId: user.id,
     amount: order.total,
     items: order.items.length
   });
   ```

3. **Avoid Logging Sensitive Data**
   - Passwords
   - API keys
   - Personal information
   - Credit card numbers

## Performance Considerations

1. **Batched Logging**
   - Logs are batched before writing to KV
   - Default batch size: 100 entries
   - Flush interval: 5 seconds

2. **Automatic Cleanup**
   - Old logs and errors are automatically cleaned up
   - Configure retention periods based on needs

3. **Rate Limiting**
   - Error tracking includes rate limiting detection
   - Prevents log spam from repeated errors

## Cloudflare Analytics Integration

The system automatically captures:
- Request volume and patterns
- Error rates and types
- Geographic distribution
- Performance metrics
- User behavior

Access analytics via:
1. Cloudflare Dashboard
2. Monitoring API endpoints
3. Custom dashboards using the data

## Alerting

Critical errors trigger alerts when:
- Status code >= 500
- Authentication system fails
- Database errors occur
- Rate limits are exceeded

Alerts are stored in KV and can be integrated with external monitoring services.

## Troubleshooting

### Common Issues

1. **Logs Not Appearing**
   - Check LOG_LEVEL environment variable
   - Verify KV namespace is configured
   - Ensure proper permissions

2. **High KV Usage**
   - Reduce log retention period
   - Increase batch size
   - Filter unnecessary debug logs

3. **Performance Impact**
   - Use sampling for high-traffic endpoints
   - Adjust batch settings
   - Consider external logging service

### Debug Mode

Enable debug logging:
```typescript
const logger = new LoggingService(env, { level: 'debug' });
```

### Health Checks

Verify system health:
```bash
curl https://api.example.com/api/v1/monitoring/health/dependencies
```

## Examples

### Custom Error Handler

```typescript
export const customErrorHandler = async (err: Error, c: Context) => {
  // Add custom logic
  if (err.message.includes('payment')) {
    // Special handling for payment errors
  }
  
  // Call default handler
  return errorHandler(err, c);
};
```

### Request Logging Middleware

```typescript
app.use('*', async (c, next) => {
  const start = Date.now();
  
  await next();
  
  const duration = Date.now() - start;
  const logger = new LoggingService(c.env);
  await logger.logRequest(c, duration, c.res.status);
});
```

### Error Recovery

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed, attempting recovery', error);
  
  // Attempt recovery
  try {
    await recoveryOperation();
  } catch (recoveryError) {
    logger.critical('Recovery failed', recoveryError);
    throw new AppError('Service unavailable', 503, 'SERVICE_ERROR');
  }
}
```
