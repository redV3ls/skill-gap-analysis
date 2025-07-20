# Authentication & Security Guide

This document describes the authentication and security features implemented in the Skill Gap Analysis API.

## Overview

The API implements a comprehensive authentication and security system with the following features:

- **JWT-based authentication** for user sessions
- **API key management** for programmatic access
- **Request validation** using Zod schemas
- **Rate limiting** using KV-based counters (free tier compatible)
- **Role-based access control** (RBAC)
- **Secure password hashing**
- **CORS protection**
- **Security headers**

## Authentication Methods

### 1. JWT Tokens

JWT tokens are used for user session authentication and are issued upon successful login.

**Token Structure:**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "role": "user|admin",
  "iat": 1640995200,
  "exp": 1641081600
}
```

**Usage:**
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.example.com/api/v1/auth/me
```

### 2. API Keys

API keys provide programmatic access to the API and support different permission levels.

**API Key Format:** `sk_[48 alphanumeric characters]`

**Usage:**
```bash
curl -H "X-API-Key: sk_your_api_key_here" \
     https://api.example.com/api/v1/analyze/gap
```

## Authentication Endpoints

### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "organization": "Acme Corp"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one lowercase letter
- At least one uppercase letter
- At least one number

### Login User
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

### Get User Profile
```http
GET /api/v1/auth/me
Authorization: Bearer YOUR_JWT_TOKEN
```

### Refresh Token
```http
POST /api/v1/auth/refresh
Authorization: Bearer YOUR_JWT_TOKEN
```

### Create API Key
```http
POST /api/v1/auth/api-keys
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "My API Key",
  "description": "For automated analysis",
  "permissions": ["read", "write"],
  "expires_at": "2024-12-31T23:59:59Z"
}
```

### List API Keys
```http
GET /api/v1/auth/api-keys
Authorization: Bearer YOUR_JWT_TOKEN
```

### Revoke API Key
```http
DELETE /api/v1/auth/api-keys/{keyId}
Authorization: Bearer YOUR_JWT_TOKEN
```

## Permissions System

### User Roles
- **user**: Standard user with access to personal data and analysis
- **admin**: Full system access including user management

### API Key Permissions
- **read**: Read-only access to data and analysis results
- **write**: Create and update data, perform analysis
- **admin**: Full administrative access (user management, system settings)

## Rate Limiting

The API implements KV-based rate limiting compatible with Cloudflare Workers free tier.

### Default Limits
- **General endpoints**: 100 requests per 15 minutes
- **Authentication endpoints**: 10 requests per 15 minutes
- **Read-only endpoints**: 200 requests per 5 minutes

### Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
Retry-After: 900
```

## Security Features

### Password Security
- Passwords are hashed using SHA-256
- Minimum complexity requirements enforced
- No password storage in plain text

### API Key Security
- Keys are hashed before storage in KV
- Support for expiration dates
- Can be revoked instantly
- Usage tracking (last used timestamp)

### Request Validation
All API requests are validated using Zod schemas:

```typescript
// Example: Gap analysis request validation
const gapAnalysisRequestSchema = z.object({
  user_skills: z.array(skillSchema).min(1),
  target_job: jobRequirementSchema,
  analysis_options: analysisOptionsSchema.optional(),
});
```

### CORS Protection
- Configurable allowed origins
- Supports credentials
- Proper preflight handling

### Security Headers
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

## Error Handling

### Authentication Errors
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired token",
    "timestamp": "2024-01-20T10:30:00Z",
    "request_id": "cf-ray-id"
  }
}
```

### Common Error Codes
- `UNAUTHORIZED`: No authentication provided
- `INVALID_TOKEN`: JWT token is invalid or expired
- `INVALID_API_KEY`: API key is invalid or inactive
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `VALIDATION_ERROR`: Request data validation failed

## Environment Variables

### Required Secrets
```bash
# Set using: wrangler secret put JWT_SECRET
JWT_SECRET=your-super-secret-jwt-key-here
```

### Configuration Variables
```toml
# wrangler.toml
[vars]
NODE_ENV = "production"
CORS_ORIGIN = "https://your-frontend-domain.com"
RATE_LIMIT_WINDOW_MS = "900000"
RATE_LIMIT_MAX_REQUESTS = "100"
LOG_LEVEL = "info"
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  organization TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  last_login TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### API Keys Table
```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL, -- JSON array
  expires_at TEXT,
  last_used TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Testing

### Run Authentication Tests
```bash
npm test -- --testPathPattern=auth.test.ts
```

### Manual API Testing
```bash
# Start development server
npm run dev

# Run authentication test script
node test-auth.js
```

## Best Practices

### For API Consumers
1. **Store JWT tokens securely** (httpOnly cookies recommended for web apps)
2. **Implement token refresh logic** before expiration
3. **Use API keys for server-to-server communication**
4. **Handle rate limiting gracefully** with exponential backoff
5. **Validate all user inputs** on the client side as well

### For API Key Management
1. **Use descriptive names** for API keys
2. **Set appropriate expiration dates**
3. **Use minimal required permissions**
4. **Rotate keys regularly**
5. **Revoke unused keys immediately**

### Security Considerations
1. **Never log sensitive data** (passwords, tokens, API keys)
2. **Use HTTPS in production** (handled by Cloudflare)
3. **Monitor for suspicious activity**
4. **Implement proper error handling** without information leakage
5. **Keep dependencies updated**

## Troubleshooting

### Common Issues

**"Invalid or expired token"**
- Check token expiration time
- Verify JWT_SECRET is set correctly
- Ensure token format is correct

**"Rate limit exceeded"**
- Implement exponential backoff
- Check if you're making too many requests
- Consider using API keys for higher limits

**"API key not found"**
- Verify API key format (starts with 'sk_')
- Check if key has been revoked
- Ensure key hasn't expired

**"Validation error"**
- Check request body format
- Verify all required fields are present
- Ensure data types match schema requirements