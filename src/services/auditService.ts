import { Env } from '../index';
import { logger } from '../utils/logger';

export interface AuditLog {
  id?: string;
  action: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export class AuditService {
  constructor(private env: Env) {}

  /**
   * Log an audit event
   */
  async log(log: Omit<AuditLog, 'id' | 'timestamp'>, request?: Request): Promise<void> {
    const auditId = this.generateAuditId();
    const logEntry: AuditLog = {
      id: auditId,
      ...log,
      timestamp: new Date().toISOString(),
      ipAddress: request?.headers.get('CF-Connecting-IP') || request?.headers.get('X-Forwarded-For') || 'unknown',
      userAgent: request?.headers.get('User-Agent') || 'unknown',
      method: request?.method,
      path: request ? new URL(request.url).pathname : undefined,
    };

    try {
      // Store in KV with structured key for better querying
      const key = `audit:${log.userId}:${Date.now()}:${auditId}`;
      await this.env.CACHE.put(key, JSON.stringify(logEntry), {
        expirationTtl: 86400 * 365 * 7, // 7 years retention for compliance
        metadata: {
          userId: log.userId,
          action: log.action,
          resourceType: log.resourceType,
          timestamp: logEntry.timestamp,
        },
      });

      // Also store by action type for faster lookups
      const actionKey = `audit:action:${log.action}:${Date.now()}:${auditId}`;
      await this.env.CACHE.put(actionKey, JSON.stringify({ userId: log.userId, auditId }), {
        expirationTtl: 86400 * 90, // 90 days for action indices
      });

      // Log critical actions separately for alerts
      if (log.severity === 'critical' || this.isCriticalAction(log.action)) {
        await this.logCriticalAction(logEntry);
      }

      logger.info('Audit log recorded', { auditId, action: log.action });
    } catch (error) {
      logger.error('Failed to record audit log', { error, auditId });
      // In production, you might want to send this to a backup logging service
    }
  }

  /**
   * Query audit logs
   */
  async query(query: AuditQuery): Promise<AuditLog[]> {
    const logs: AuditLog[] = [];
    const limit = query.limit || 100;

    try {
      if (query.userId) {
        // Query by user ID
        const keys = await this.env.CACHE.list({ 
          prefix: `audit:${query.userId}:`,
          limit: limit * 2, // Get more to filter
        });

        for (const key of keys.keys) {
          const data = await this.env.CACHE.get(key.name, 'json') as AuditLog;
          if (data && this.matchesQuery(data, query)) {
            logs.push(data);
            if (logs.length >= limit) break;
          }
        }
      } else if (query.action) {
        // Query by action
        const keys = await this.env.CACHE.list({ 
          prefix: `audit:action:${query.action}:`,
          limit: limit,
        });

        for (const key of keys.keys) {
          const ref = await this.env.CACHE.get(key.name, 'json') as { userId: string; auditId: string };
          if (ref) {
            // Fetch the actual audit log
            const auditKeys = await this.env.CACHE.list({ 
              prefix: `audit:${ref.userId}:`,
              limit: 1000,
            });
            
            for (const auditKey of auditKeys.keys) {
              if (auditKey.name.includes(ref.auditId)) {
                const data = await this.env.CACHE.get(auditKey.name, 'json') as AuditLog;
                if (data && this.matchesQuery(data, query)) {
                  logs.push(data);
                  if (logs.length >= limit) break;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to query audit logs', { error, query });
    }

    // Sort by timestamp descending
    return logs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, limit);
  }

  /**
   * Get audit statistics
   */
  async getStatistics(userId?: string): Promise<any> {
    const stats = {
      totalActions: 0,
      actionsByType: {} as Record<string, number>,
      recentActions: [] as AuditLog[],
      criticalActions: 0,
    };

    try {
      const prefix = userId ? `audit:${userId}:` : 'audit:';
      const keys = await this.env.CACHE.list({ prefix, limit: 1000 });
      
      stats.totalActions = keys.keys.length;

      // Get recent actions
      const recentKeys = keys.keys.slice(0, 10);
      for (const key of recentKeys) {
        const data = await this.env.CACHE.get(key.name, 'json') as AuditLog;
        if (data) {
          stats.recentActions.push(data);
          
          // Count by action type
          stats.actionsByType[data.action] = (stats.actionsByType[data.action] || 0) + 1;
          
          // Count critical actions
          if (data.severity === 'critical' || this.isCriticalAction(data.action)) {
            stats.criticalActions++;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to get audit statistics', { error });
    }

    return stats;
  }

  /**
   * Generate unique audit ID
   */
  private generateAuditId(): string {
    return `aud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if action is critical
   */
  private isCriticalAction(action: string): boolean {
    const criticalActions = [
      'user.delete',
      'data.export',
      'data.delete',
      'gdpr.export.requested',
      'gdpr.deletion.requested',
      'api_key.created',
      'api_key.deleted',
      'permission.changed',
      'security.breach_attempt',
    ];
    return criticalActions.includes(action);
  }

  /**
   * Log critical action for alerting
   */
  private async logCriticalAction(log: AuditLog): Promise<void> {
    const key = `audit:critical:${Date.now()}:${log.id}`;
    await this.env.CACHE.put(key, JSON.stringify(log), {
      expirationTtl: 86400 * 30, // 30 days for critical action alerts
    });
  }

  /**
   * Check if log matches query criteria
   */
  private matchesQuery(log: AuditLog, query: AuditQuery): boolean {
    if (query.action && log.action !== query.action) return false;
    if (query.resourceType && log.resourceType !== query.resourceType) return false;
    
    const logDate = new Date(log.timestamp);
    if (query.startDate && logDate < query.startDate) return false;
    if (query.endDate && logDate > query.endDate) return false;
    
    return true;
  }
}

/**
 * Helper function for backward compatibility
 */
export async function auditLog(
  env: Env, 
  log: Omit<AuditLog, 'id' | 'timestamp'>,
  request?: Request
): Promise<void> {
  const service = new AuditService(env);
  await service.log(log, request);
}
