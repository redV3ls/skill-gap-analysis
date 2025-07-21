# Data Privacy and Compliance Documentation

## Overview

The Skill Gap Analysis API implements comprehensive data privacy and compliance features to ensure user data protection and regulatory compliance, including GDPR (General Data Protection Regulation) requirements.

## Table of Contents

1. [Data Retention System](#data-retention-system)
2. [GDPR Data Export](#gdpr-data-export)
3. [Audit Logging](#audit-logging)
4. [Data Deletion](#data-deletion)
5. [Privacy Best Practices](#privacy-best-practices)
6. [API Reference](#api-reference)

## Data Retention System

### Overview

The data retention system automatically purges expired data according to configured retention policies. This ensures compliance with data minimization principles and reduces storage costs.

### Retention Policies

| Data Type | Retention Period | Description |
|-----------|-----------------|-------------|
| Skill Assessments | 365 days | Individual skill assessment records |
| Gap Analysis | 180 days | Gap analysis results |
| User Profiles | 730 days | User profile data (2 years after last activity) |
| Error Logs | 90 days | Error tracking logs |
| Application Logs | 30 days | General application logs |
| Analytics Data | 365 days | Usage analytics and metrics |
| Cache Data | 7 days | Cached responses and computations |
| Job Queue | 30 days | Completed job records |
| Audit Logs | 2555 days | Security and compliance audit logs (7 years) |

### Configuration

Retention policies are configured in `src/config/dataRetention.ts`. You can customize:

- `retentionDays`: How long to keep data
- `enabled`: Whether the policy is active
- `keyPattern`: RegExp pattern to match data keys

### Automatic Purging

Data purging runs automatically via scheduled workers every 5 minutes. The system:

1. Scans for expired data based on retention policies
2. Batches deletions to avoid rate limits
3. Logs all purging activities
4. Maintains metrics for monitoring

### Manual Configuration

```typescript
// Environment variables for retention configuration
RETENTION_BATCH_SIZE=100      // Number of keys to delete per batch
RETENTION_DELAY_MS=100        // Delay between batches (ms)
RETENTION_DRY_RUN=false       // Set to true for testing without deletion
```

## GDPR Data Export

### Overview

Users can request a complete export of their personal data in machine-readable formats (JSON or CSV).

### Requesting an Export

```bash
POST /api/v1/gdpr/export
Authorization: Bearer {token}

{
  "format": "json",  // or "csv"
  "categories": ["all"]  // or specific categories
}
```

### Export Categories

- `all` - Export all available data
- `profile` - Basic profile information
- `skills` - Skills and proficiency levels
- `assessments` - Historical skill assessments
- `gapAnalyses` - Skills gap analysis results
- `jobHistory` - Async job processing history
- `auditLogs` - Activity and access logs
- `preferences` - Application preferences
- `apiKeys` - API key information (sanitized)

### Export Process

1. User requests export
2. System queues export job
3. Background worker collects all user data
4. Data is formatted and stored securely
5. User receives notification when ready
6. Export available for download for 72 hours

### Checking Export Status

```bash
GET /api/v1/gdpr/export/{exportId}
Authorization: Bearer {token}
```

### Downloading Export

```bash
GET /api/v1/gdpr/export/{exportId}/download
Authorization: Bearer {token}
```

## Audit Logging

### Overview

All data access and modifications are logged for security and compliance purposes.

### Logged Actions

Critical actions that are always logged:

- User authentication (login/logout)
- Data exports and downloads
- Profile modifications
- API key operations
- Permission changes
- Data deletion requests
- Security events

### Audit Log Structure

```json
{
  "id": "aud_1234567890_abc123",
  "action": "gdpr.export.requested",
  "userId": "user_123",
  "resourceType": "gdpr_export",
  "resourceId": "exp_123",
  "timestamp": "2024-01-20T10:30:00Z",
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "method": "POST",
  "path": "/api/v1/gdpr/export",
  "severity": "critical",
  "metadata": {
    "format": "json",
    "categories": ["all"]
  }
}
```

### Querying Audit Logs

Users can query their own audit logs:

```bash
GET /api/v1/audit/my-logs?action=gdpr.export.requested&limit=50
Authorization: Bearer {token}
```

Administrators can query all audit logs:

```bash
GET /api/v1/audit/admin/logs?userId=user_123&startDate=2024-01-01
Authorization: Bearer {admin_token}
```

### Audit Statistics

```bash
GET /api/v1/audit/my-stats
Authorization: Bearer {token}

Response:
{
  "totalActions": 245,
  "actionsByType": {
    "user.login": 45,
    "gap.analyze": 23,
    "skill.update": 67
  },
  "recentActions": [...],
  "criticalActions": 5
}
```

## Data Deletion

### Right to be Forgotten

Users can request complete deletion of their personal data:

```bash
DELETE /api/v1/gdpr/data
Authorization: Bearer {token}
X-Confirmation-Token: {confirmation_token}
```

### Deletion Process

1. User requests deletion with confirmation token
2. System schedules deletion for 30 days later
3. User receives confirmation email
4. Grace period allows cancellation
5. After 30 days, all user data is permanently deleted
6. Deletion is logged for compliance

### Data Affected by Deletion

- User profile and authentication data
- All skills and assessments
- Gap analysis results
- Job history
- Preferences and settings
- API keys
- Associated cache entries

### Exceptions

Some data may be retained for legal compliance:

- Audit logs (anonymized)
- Aggregated analytics (anonymized)
- Legal hold data (if applicable)

## Privacy Best Practices

### Data Minimization

- Only collect necessary data
- Implement field-level access controls
- Use aggregation where possible
- Regular data cleanup via retention policies

### Security Measures

- All data encrypted at rest (Cloudflare KV)
- TLS encryption in transit
- API authentication required
- Rate limiting on sensitive endpoints
- IP-based access logging

### Transparency

- Clear data retention policies
- User-accessible audit logs
- Export functionality
- Deletion options
- Privacy policy compliance

### Compliance Features

- GDPR Article 15: Right of access (data export)
- GDPR Article 17: Right to erasure (data deletion)
- GDPR Article 20: Data portability (JSON/CSV export)
- Audit trail for accountability
- Configurable retention periods

## API Reference

### GDPR Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/gdpr/export` | POST | Request data export |
| `/api/v1/gdpr/export/{id}` | GET | Check export status |
| `/api/v1/gdpr/export/{id}/download` | GET | Download export |
| `/api/v1/gdpr/exports` | GET | List export history |
| `/api/v1/gdpr/categories` | GET | List data categories |
| `/api/v1/gdpr/data` | DELETE | Request data deletion |

### Audit Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/audit/my-logs` | GET | Get user's audit logs |
| `/api/v1/audit/my-stats` | GET | Get user's audit statistics |
| `/api/v1/audit/admin/logs` | GET | Admin: Query all logs |
| `/api/v1/audit/admin/stats` | GET | Admin: Global statistics |
| `/api/v1/audit/actions` | GET | List available actions |

## Implementation Examples

### Implementing Audit Logging in Your Code

```typescript
import { auditLog } from '../services/auditService';

// Log a data access event
await auditLog(env, {
  action: 'user.profile.viewed',
  userId: currentUser.id,
  resourceType: 'user_profile',
  resourceId: profileId,
  metadata: {
    viewer: currentUser.id,
    timestamp: new Date().toISOString()
  }
}, request);
```

### Handling Data Exports

```typescript
// Process GDPR export in background job
if (job.type === 'gdpr_export') {
  const gdprService = new GDPRExportService(env);
  await gdprService.processDataExport(job.exportId);
}
```

### Configuring Retention

```typescript
// Add custom retention policy
export const CUSTOM_RETENTION_POLICY: RetentionPolicy = {
  name: 'custom_data',
  description: 'Custom business data',
  retentionDays: 90,
  kvNamespace: 'CUSTOM_DATA',
  keyPattern: /^custom:/,
  enabled: true
};
```

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Data Retention**
   - Number of records purged
   - Purge job duration
   - Failed purge attempts

2. **GDPR Exports**
   - Export requests per day
   - Average export size
   - Export completion time

3. **Audit Logs**
   - Critical actions count
   - Unusual access patterns
   - Failed authentication attempts

### Setting Up Alerts

Configure alerts for:

- Failed data purge jobs
- Excessive GDPR export requests
- Critical audit events
- Data deletion requests

## Troubleshooting

### Common Issues

1. **Export takes too long**
   - Check job queue status
   - Verify worker is running
   - Check for large data volumes

2. **Retention not working**
   - Verify scheduled worker is active
   - Check retention configuration
   - Review error logs

3. **Audit logs missing**
   - Ensure audit service is initialized
   - Check KV storage quotas
   - Verify retention policies

### Debug Commands

```bash
# Check retention status
GET /api/v1/monitoring/retention/status

# View recent purge results
GET /api/v1/monitoring/retention/history

# Check export queue
GET /api/v1/jobs?type=gdpr_export&status=pending
```

## Security Considerations

### Access Control

- Implement role-based access for admin endpoints
- Use API keys with limited scopes
- Regular security audits
- Monitor for suspicious activity

### Data Handling

- Sanitize exported data
- Remove sensitive fields (passwords, tokens)
- Implement download rate limiting
- Use secure temporary storage

### Compliance Checklist

- [ ] Data retention policies defined
- [ ] Automatic purging implemented
- [ ] GDPR export functionality working
- [ ] Audit logging comprehensive
- [ ] Data deletion process documented
- [ ] Privacy policy updated
- [ ] Security measures in place
- [ ] Monitoring and alerts configured

## Future Enhancements

1. **Consent Management**
   - Granular consent tracking
   - Consent withdrawal handling
   - Purpose-based data processing

2. **Advanced Privacy Features**
   - Differential privacy for analytics
   - Data anonymization tools
   - Pseudonymization options

3. **Extended Compliance**
   - CCPA compliance features
   - PIPEDA compliance
   - Industry-specific regulations

4. **Enhanced Monitoring**
   - Real-time compliance dashboard
   - Automated compliance reports
   - Privacy impact assessments
