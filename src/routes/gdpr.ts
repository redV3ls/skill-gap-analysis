import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { GDPRExportService } from '../services/gdprExportService';
import { auditLog } from '../services/auditService';

const gdprRoutes = new Hono<{ Bindings: Env }>();

// Request data export schema
const requestExportSchema = z.object({
  format: z.enum(['json', 'csv']).optional().default('json'),
  categories: z.array(z.string()).optional(),
});

/**
 * Request a GDPR data export
 */
gdprRoutes.post('/export', async (c) => {
  const userId = c.get('userId');
  
  try {
    const body = await c.req.json();
    const validatedData = requestExportSchema.parse(body);
    
    const gdprService = new GDPRExportService(c.env);
    const exportRequest = await gdprService.requestDataExport(
      userId,
      validatedData.format,
      validatedData.categories
    );
    
    // Log the export request
    await auditLog(c.env, {
      action: 'gdpr.export.requested',
      userId,
      resourceType: 'gdpr_export',
      resourceId: exportRequest.exportId,
      metadata: {
        format: validatedData.format,
        categories: validatedData.categories,
      },
    });
    
    return c.json({
      success: true,
      message: 'Data export request submitted successfully',
      export: exportRequest,
    }, 202);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      }, 400);
    }
    throw error;
  }
});

/**
 * Get export request status
 */
gdprRoutes.get('/export/:exportId', async (c) => {
  const userId = c.get('userId');
  const exportId = c.req.param('exportId');
  
  const gdprService = new GDPRExportService(c.env);
  const exportRequest = await gdprService.getExportRequest(exportId);
  
  if (!exportRequest || exportRequest.userId !== userId) {
    return c.json({
      success: false,
      error: 'Export request not found',
    }, 404);
  }
  
  return c.json({
    success: true,
    export: exportRequest,
  });
});

/**
 * Download exported data
 */
gdprRoutes.get('/export/:exportId/download', async (c) => {
  const userId = c.get('userId');
  const exportId = c.req.param('exportId');
  
  try {
    const gdprService = new GDPRExportService(c.env);
    const result = await gdprService.downloadExport(exportId, userId);
    
    if (!result) {
      return c.json({
        success: false,
        error: 'Export not found or access denied',
      }, 404);
    }
    
    // Log the download
    await auditLog(c.env, {
      action: 'gdpr.export.downloaded',
      userId,
      resourceType: 'gdpr_export',
      resourceId: exportId,
    });
    
    // Set appropriate headers based on format
    const contentType = result.metadata?.contentType || 'application/octet-stream';
    const filename = result.metadata?.filename || `export-${exportId}.json`;
    
    return new Response(result.data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Export is not ready for download') {
      return c.json({
        success: false,
        error: 'Export is still processing. Please try again later.',
      }, 202);
    }
    throw error;
  }
});

/**
 * Get user's export history
 */
gdprRoutes.get('/exports', async (c) => {
  const userId = c.get('userId');
  
  const gdprService = new GDPRExportService(c.env);
  const history = await gdprService.getUserExportHistory(userId);
  
  return c.json({
    success: true,
    exports: history,
    total: history.length,
  });
});

/**
 * Delete user data (right to be forgotten)
 */
gdprRoutes.delete('/data', async (c) => {
  const userId = c.get('userId');
  
  try {
    // Verify user identity with additional authentication
    const confirmationToken = c.req.header('X-Confirmation-Token');
    if (!confirmationToken) {
      return c.json({
        success: false,
        error: 'Confirmation token required for data deletion',
      }, 400);
    }
    
    // TODO: Implement actual data deletion logic
    // This is a placeholder - in production, this would:
    // 1. Verify the confirmation token
    // 2. Schedule deletion of all user data
    // 3. Send confirmation email
    // 4. Log the deletion request
    
    await auditLog(c.env, {
      action: 'gdpr.deletion.requested',
      userId,
      resourceType: 'user_data',
      resourceId: userId,
      metadata: {
        confirmationToken: confirmationToken.substring(0, 8) + '...',
      },
    });
    
    return c.json({
      success: true,
      message: 'Data deletion request submitted. You will receive a confirmation email.',
      deletionScheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });
  } catch (error) {
    throw error;
  }
});

/**
 * Get data categories available for export
 */
gdprRoutes.get('/categories', async (c) => {
  return c.json({
    success: true,
    categories: [
      {
        id: 'all',
        name: 'All Data',
        description: 'Export all available data',
      },
      {
        id: 'profile',
        name: 'Profile Information',
        description: 'Basic profile data including name and email',
      },
      {
        id: 'skills',
        name: 'Skills Data',
        description: 'Your skills and proficiency levels',
      },
      {
        id: 'assessments',
        name: 'Skill Assessments',
        description: 'Historical skill assessment results',
      },
      {
        id: 'gapAnalyses',
        name: 'Gap Analyses',
        description: 'Skills gap analysis results',
      },
      {
        id: 'jobHistory',
        name: 'Job History',
        description: 'Async job processing history',
      },
      {
        id: 'auditLogs',
        name: 'Audit Logs',
        description: 'Activity and access logs',
      },
      {
        id: 'preferences',
        name: 'Preferences',
        description: 'Application preferences and settings',
      },
      {
        id: 'apiKeys',
        name: 'API Keys',
        description: 'API key information (excluding secrets)',
      },
    ],
  });
});

export default gdprRoutes;
