import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { AuditService } from '../services/auditService';

const auditRoutes = new Hono<{ Bindings: Env }>();

// Query schema
const querySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
});

/**
 * Get audit logs for the current user
 */
auditRoutes.get('/my-logs', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query();
  
  try {
    const validatedQuery = querySchema.parse({
      ...query,
      userId, // Force to current user
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    const auditService = new AuditService(c.env);
    const logs = await auditService.query({
      userId: validatedQuery.userId,
      action: validatedQuery.action,
      resourceType: validatedQuery.resourceType,
      startDate: validatedQuery.startDate ? new Date(validatedQuery.startDate) : undefined,
      endDate: validatedQuery.endDate ? new Date(validatedQuery.endDate) : undefined,
      limit: validatedQuery.limit,
    });

    return c.json({
      success: true,
      logs,
      total: logs.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * Get audit statistics for the current user
 */
auditRoutes.get('/my-stats', async (c) => {
  const userId = c.get('userId');
  
  const auditService = new AuditService(c.env);
  const stats = await auditService.getStatistics(userId);

  return c.json({
    success: true,
    statistics: stats,
  });
});

/**
 * Admin: Query all audit logs
 */
auditRoutes.get('/admin/logs', async (c) => {
  const userRole = c.get('userRole');
  
  // Check if user is admin
  if (userRole !== 'admin') {
    return c.json({
      success: false,
      error: 'Unauthorized. Admin access required.',
    }, 403);
  }

  const query = c.req.query();
  
  try {
    const validatedQuery = querySchema.parse({
      ...query,
      limit: query.limit ? parseInt(query.limit) : undefined,
    });

    const auditService = new AuditService(c.env);
    const logs = await auditService.query({
      userId: validatedQuery.userId,
      action: validatedQuery.action,
      resourceType: validatedQuery.resourceType,
      startDate: validatedQuery.startDate ? new Date(validatedQuery.startDate) : undefined,
      endDate: validatedQuery.endDate ? new Date(validatedQuery.endDate) : undefined,
      limit: validatedQuery.limit,
    });

    return c.json({
      success: true,
      logs,
      total: logs.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * Admin: Get global audit statistics
 */
auditRoutes.get('/admin/stats', async (c) => {
  const userRole = c.get('userRole');
  
  // Check if user is admin
  if (userRole !== 'admin') {
    return c.json({
      success: false,
      error: 'Unauthorized. Admin access required.',
    }, 403);
  }

  const auditService = new AuditService(c.env);
  const stats = await auditService.getStatistics();

  return c.json({
    success: true,
    statistics: stats,
  });
});

/**
 * Get list of available audit actions
 */
auditRoutes.get('/actions', async (c) => {
  return c.json({
    success: true,
    actions: [
      { id: 'user.login', description: 'User login' },
      { id: 'user.logout', description: 'User logout' },
      { id: 'user.register', description: 'User registration' },
      { id: 'user.update', description: 'User profile update' },
      { id: 'user.delete', description: 'User account deletion', severity: 'critical' },
      { id: 'skill.add', description: 'Skill added' },
      { id: 'skill.update', description: 'Skill updated' },
      { id: 'skill.delete', description: 'Skill removed' },
      { id: 'gap.analyze', description: 'Gap analysis performed' },
      { id: 'team.analyze', description: 'Team analysis performed' },
      { id: 'gdpr.export.requested', description: 'GDPR data export requested', severity: 'critical' },
      { id: 'gdpr.export.downloaded', description: 'GDPR data export downloaded' },
      { id: 'gdpr.deletion.requested', description: 'Data deletion requested', severity: 'critical' },
      { id: 'api_key.created', description: 'API key created', severity: 'critical' },
      { id: 'api_key.deleted', description: 'API key deleted', severity: 'critical' },
      { id: 'api_key.used', description: 'API key used for authentication' },
      { id: 'permission.changed', description: 'User permissions changed', severity: 'critical' },
      { id: 'data.export', description: 'Data exported', severity: 'critical' },
      { id: 'data.import', description: 'Data imported' },
      { id: 'job.created', description: 'Async job created' },
      { id: 'job.completed', description: 'Async job completed' },
      { id: 'job.failed', description: 'Async job failed' },
      { id: 'security.breach_attempt', description: 'Security breach attempt detected', severity: 'critical' },
    ],
  });
});

export default auditRoutes;
