# API Versioning Strategy

## Overview

The Skill Gap Analysis API uses URL-based versioning to ensure backward compatibility while allowing for continuous improvement and evolution of the API.

## Current Version

- **Current Stable Version**: v1
- **Base URL**: `/api/v1`
- **Status**: Production Ready

## Versioning Principles

### 1. URL-Based Versioning

We use URL path versioning for clarity and simplicity:

```
https://api.skillgap.example.com/api/v1/users/profile
https://api.skillgap.example.com/api/v2/users/profile
```

**Advantages**:
- Clear and explicit version selection
- Easy to route different versions to different implementations
- Works well with API gateways and load balancers
- Simple for clients to understand and implement

### 2. Semantic Versioning

We follow semantic versioning principles:

- **Major version (v1, v2)**: Breaking changes
- **Minor version (1.x)**: New features, backward compatible
- **Patch version (1.x.x)**: Bug fixes, backward compatible

Minor and patch versions are tracked internally but don't change the URL.

### 3. Version Lifecycle

```
Beta → Current → Deprecated → Sunset
```

- **Beta**: New version under development (6 months)
- **Current**: Stable, recommended version
- **Deprecated**: Still supported but not recommended (12 months)
- **Sunset**: No longer available

## Breaking Changes

A breaking change triggers a new major version. Examples include:

### What Constitutes a Breaking Change

1. **Removing endpoints**
2. **Removing response fields**
3. **Changing field types** (e.g., string to number)
4. **Changing field names**
5. **Changing authentication methods**
6. **Modifying required request parameters**
7. **Changing error response format**
8. **Altering pagination structure**

### What Does NOT Constitute a Breaking Change

1. **Adding new endpoints**
2. **Adding new optional request parameters**
3. **Adding new response fields**
4. **Adding new error codes**
5. **Performance improvements**
6. **Bug fixes**
7. **Documentation updates**

## Implementation

### Route Structure

```typescript
// Current implementation in src/index.ts
const API_VERSION = 'v1';

// All routes are prefixed with version
app.route(`/api/${API_VERSION}/auth`, authRoutes);
app.route(`/api/${API_VERSION}/users`, usersRoutes);
app.route(`/api/${API_VERSION}/analyze`, analyzeRoutes);
```

### Version Detection

```typescript
// Middleware to detect and validate API version
app.use('/api/:version/*', async (c, next) => {
  const version = c.req.param('version');
  
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return c.json({
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: `API version ${version} is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
        documentation: 'https://api.skillgap.example.com/docs/versioning'
      }
    }, 400);
  }
  
  // Add version to context for downstream use
  c.set('apiVersion', version);
  await next();
});
```

### Response Headers

All API responses include version information:

```http
HTTP/1.1 200 OK
X-API-Version: v1
X-API-Deprecated: false
X-API-Sunset-Date: null
Content-Type: application/json
```

## Migration Guide

### For API Consumers

When a new version is released:

1. **Review the changelog** for breaking changes
2. **Test in development** environment first
3. **Update SDK/client libraries** to support new version
4. **Migrate gradually** using feature flags
5. **Monitor deprecated version warnings**

### Version Negotiation

```javascript
// Example: Graceful version fallback
class APIClient {
  constructor() {
    this.preferredVersion = 'v2';
    this.fallbackVersion = 'v1';
  }
  
  async makeRequest(endpoint, options) {
    try {
      // Try preferred version first
      return await this.request(`/api/${this.preferredVersion}${endpoint}`, options);
    } catch (error) {
      if (error.code === 'UNSUPPORTED_VERSION') {
        // Fall back to previous version
        console.warn(`Falling back to API ${this.fallbackVersion}`);
        return await this.request(`/api/${this.fallbackVersion}${endpoint}`, options);
      }
      throw error;
    }
  }
}
```

## Version-Specific Documentation

Each API version maintains its own documentation:

- **v1 Documentation**: `/api/v1/docs`
- **v2 Documentation**: `/api/v2/docs` (future)

### OpenAPI Specifications

```yaml
# openapi-v1.yaml
openapi: 3.0.0
info:
  title: Skill Gap Analysis API
  version: 1.0.0
  x-api-version: v1
servers:
  - url: https://api.skillgap.example.com/api/v1
```

## Deprecation Process

### 1. Announcement (T-0)

- Add deprecation notice to documentation
- Include `X-API-Deprecated: true` header
- Add console warnings in SDKs

```http
HTTP/1.1 200 OK
X-API-Version: v1
X-API-Deprecated: true
X-API-Sunset-Date: 2025-01-01T00:00:00Z
Warning: 299 - "API v1 is deprecated. Please migrate to v2"
```

### 2. Migration Period (T+6 months)

- Maintain full support for deprecated version
- Provide migration tools and guides
- Offer migration assistance

### 3. Sunset Warning (T+9 months)

- Add sunset warnings to all responses
- Increase warning visibility
- Final migration push

### 4. Sunset (T+12 months)

- Return 410 Gone for deprecated endpoints
- Provide clear migration message

```json
{
  "error": {
    "code": "VERSION_SUNSET",
    "message": "API v1 has been sunset. Please use v2.",
    "migration_guide": "https://api.skillgap.example.com/docs/migration/v1-to-v2"
  }
}
```

## Client Libraries

### Version Support Matrix

| Client Library | v1 Support | v2 Support | Recommended Version |
|---------------|------------|------------|-------------------|
| JavaScript SDK | ✅ 1.x     | ✅ 2.x     | 2.x              |
| Python SDK    | ✅ 1.x     | ✅ 2.x     | 2.x              |
| Go SDK        | ✅ 1.x     | 🚧 Beta    | 1.x              |

### SDK Version Detection

```javascript
// JavaScript SDK Example
class SkillGapSDK {
  constructor(options = {}) {
    this.apiVersion = options.apiVersion || 'v1';
    this.autoUpgrade = options.autoUpgrade || false;
  }
  
  async init() {
    const versions = await this.getAvailableVersions();
    
    if (this.autoUpgrade && versions.current !== this.apiVersion) {
      console.log(`Upgrading from ${this.apiVersion} to ${versions.current}`);
      this.apiVersion = versions.current;
    }
    
    if (versions.deprecated.includes(this.apiVersion)) {
      console.warn(`API ${this.apiVersion} is deprecated. Please upgrade to ${versions.current}`);
    }
  }
}
```

## Best Practices

### For API Developers

1. **Plan for versioning from day one**
2. **Minimize breaking changes**
3. **Batch breaking changes into major releases**
4. **Maintain clear upgrade paths**
5. **Provide comprehensive migration tools**
6. **Support at least 2 versions concurrently**

### For API Consumers

1. **Always specify version explicitly**
2. **Monitor deprecation notices**
3. **Test against beta versions early**
4. **Implement version fallback logic**
5. **Keep client libraries updated**
6. **Subscribe to version announcements**

## Version History

### v1 (Current)

- **Released**: January 2024
- **Status**: Current
- **Features**:
  - Core skill gap analysis
  - Team analysis
  - User profiles
  - Industry trends
  - GDPR compliance
  - Async job processing

### v2 (Planned)

- **Planned Release**: July 2024
- **Status**: In Development
- **New Features**:
  - GraphQL support
  - Real-time subscriptions
  - Advanced analytics
  - Machine learning predictions
  - Enhanced team collaboration

## Communication Channels

Stay informed about version changes:

1. **API Changelog**: `/api/changelog`
2. **Email Notifications**: Subscribe at `/api/notifications`
3. **Developer Blog**: https://blog.skillgap.example.com
4. **Status Page**: https://status.skillgap.example.com
5. **GitHub Releases**: https://github.com/skillgap/api/releases

## Testing Different Versions

### Using cURL

```bash
# Test v1
curl https://api.skillgap.example.com/api/v1/health

# Test v2 (when available)
curl https://api.skillgap.example.com/api/v2/health
```

### Using Postman

Import version-specific collections:
- [Postman Collection v1](https://api.skillgap.example.com/postman/v1)
- [Postman Collection v2](https://api.skillgap.example.com/postman/v2)

## FAQ

### Q: How long will old versions be supported?

A: We commit to supporting each major version for at least 12 months after the release of its successor. Critical security updates may extend this period.

### Q: Can I use multiple API versions simultaneously?

A: Yes, you can use different versions for different parts of your application during migration. However, we recommend consolidating to a single version as soon as practical.

### Q: How are version-specific rate limits applied?

A: Rate limits are applied per version. Using multiple versions doesn't increase your overall rate limit.

### Q: Will version upgrades affect my stored data?

A: No, your data remains unchanged. Version changes only affect the API interface, not the underlying data.

### Q: How do I request features for the next version?

A: Submit feature requests through:
- GitHub Issues: https://github.com/skillgap/api/issues
- Developer Forum: https://forum.skillgap.example.com
- Email: api-feedback@skillgap.example.com
