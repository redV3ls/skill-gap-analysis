import { Env } from '../index';
import { logger } from '../utils/logger';

export interface UserDataExport {
  exportId: string;
  userId: string;
  requestedAt: string;
  completedAt?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  dataCategories: string[];
  format: 'json' | 'csv';
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
}

export interface ExportedData {
  profile: any;
  skills: any[];
  assessments: any[];
  gapAnalyses: any[];
  jobHistory: any[];
  auditLogs: any[];
  preferences: any;
  apiKeys: any[];
  metadata: {
    exportId: string;
    exportDate: string;
    dataRetentionPolicy: string;
    categories: string[];
  };
}

export class GDPRExportService {
  constructor(private env: Env) {}

  /**
   * Initiate a data export request for a user
   */
  async requestDataExport(
    userId: string,
    format: 'json' | 'csv' = 'json',
    categories?: string[]
  ): Promise<UserDataExport> {
    const exportId = this.generateExportId();
    const exportRequest: UserDataExport = {
      exportId,
      userId,
      requestedAt: new Date().toISOString(),
      status: 'pending',
      dataCategories: categories || ['all'],
      format,
    };

    // Store the export request
    await this.env.CACHE.put(
      `gdpr:export:${exportId}`,
      JSON.stringify(exportRequest),
      { expirationTtl: 86400 * 7 } // Keep for 7 days
    );

    // Add to user's export history
    await this.addToExportHistory(userId, exportId);

    // Queue the export job for async processing
    await this.queueExportJob(exportRequest);

    logger.info(`GDPR export requested for user ${userId}`, { exportId });

    return exportRequest;
  }

  /**
   * Process a data export request
   */
  async processDataExport(exportId: string): Promise<void> {
    const exportRequest = await this.getExportRequest(exportId);
    if (!exportRequest) {
      throw new Error(`Export request ${exportId} not found`);
    }

    try {
      // Update status to processing
      exportRequest.status = 'processing';
      await this.updateExportRequest(exportRequest);

      // Collect all user data
      const userData = await this.collectUserData(
        exportRequest.userId,
        exportRequest.dataCategories
      );

      // Format the data according to request
      const formattedData = exportRequest.format === 'json'
        ? this.formatAsJSON(userData)
        : this.formatAsCSV(userData);

      // Store the exported data
      const downloadUrl = await this.storeExportedData(
        exportId,
        formattedData,
        exportRequest.format
      );

      // Update export request with completion details
      exportRequest.status = 'completed';
      exportRequest.completedAt = new Date().toISOString();
      exportRequest.downloadUrl = downloadUrl;
      exportRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours
      await this.updateExportRequest(exportRequest);

      logger.info(`GDPR export completed for user ${exportRequest.userId}`, { exportId });
    } catch (error) {
      // Update status to failed
      exportRequest.status = 'failed';
      exportRequest.error = error instanceof Error ? error.message : 'Unknown error';
      await this.updateExportRequest(exportRequest);

      logger.error(`GDPR export failed for user ${exportRequest.userId}`, { exportId, error });
      throw error;
    }
  }

  /**
   * Collect all user data from various sources
   */
  private async collectUserData(
    userId: string,
    categories: string[]
  ): Promise<ExportedData> {
    const includeAll = categories.includes('all');
    const data: ExportedData = {
      profile: null,
      skills: [],
      assessments: [],
      gapAnalyses: [],
      jobHistory: [],
      auditLogs: [],
      preferences: null,
      apiKeys: [],
      metadata: {
        exportId: '',
        exportDate: new Date().toISOString(),
        dataRetentionPolicy: 'Data is retained according to our privacy policy',
        categories: categories,
      },
    };

    // Collect profile data
    if (includeAll || categories.includes('profile')) {
      data.profile = await this.getUserProfile(userId);
    }

    // Collect skills data
    if (includeAll || categories.includes('skills')) {
      data.skills = await this.getUserSkills(userId);
    }

    // Collect assessment data
    if (includeAll || categories.includes('assessments')) {
      data.assessments = await this.getUserAssessments(userId);
    }

    // Collect gap analysis data
    if (includeAll || categories.includes('gapAnalyses')) {
      data.gapAnalyses = await this.getUserGapAnalyses(userId);
    }

    // Collect job history
    if (includeAll || categories.includes('jobHistory')) {
      data.jobHistory = await this.getUserJobHistory(userId);
    }

    // Collect audit logs
    if (includeAll || categories.includes('auditLogs')) {
      data.auditLogs = await this.getUserAuditLogs(userId);
    }

    // Collect preferences
    if (includeAll || categories.includes('preferences')) {
      data.preferences = await this.getUserPreferences(userId);
    }

    // Collect API keys (sanitized)
    if (includeAll || categories.includes('apiKeys')) {
      data.apiKeys = await this.getUserApiKeys(userId);
    }

    return data;
  }

  /**
   * Get user profile from database
   */
  private async getUserProfile(userId: string): Promise<any> {
    try {
      const result = await this.env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(userId).first();
      
      if (result) {
        // Remove sensitive fields
        delete result.password_hash;
        delete result.refresh_token;
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to get user profile for GDPR export: ${userId}`, error);
      return null;
    }
  }

  /**
   * Get user skills from database
   */
  private async getUserSkills(userId: string): Promise<any[]> {
    try {
      const results = await this.env.DB.prepare(
        'SELECT * FROM user_skills WHERE user_id = ? ORDER BY created_at DESC'
      ).bind(userId).all();
      
      return results.results || [];
    } catch (error) {
      logger.error(`Failed to get user skills for GDPR export: ${userId}`, error);
      return [];
    }
  }

  /**
   * Get user assessments from KV storage
   */
  private async getUserAssessments(userId: string): Promise<any[]> {
    try {
      const assessments = [];
      const keys = await this.env.CACHE.list({ prefix: `assessment:${userId}:` });
      
      for (const key of keys.keys) {
        const data = await this.env.CACHE.get(key.name, 'json');
        if (data) {
          assessments.push(data);
        }
      }
      
      return assessments;
    } catch (error) {
      logger.error(`Failed to get user assessments for GDPR export: ${userId}`, error);
      return [];
    }
  }

  /**
   * Get user gap analyses from KV storage
   */
  private async getUserGapAnalyses(userId: string): Promise<any[]> {
    try {
      const analyses = [];
      const keys = await this.env.CACHE.list({ prefix: `gap:${userId}:` });
      
      for (const key of keys.keys) {
        const data = await this.env.CACHE.get(key.name, 'json');
        if (data) {
          analyses.push(data);
        }
      }
      
      return analyses;
    } catch (error) {
      logger.error(`Failed to get user gap analyses for GDPR export: ${userId}`, error);
      return [];
    }
  }

  /**
   * Get user job history from KV storage
   */
  private async getUserJobHistory(userId: string): Promise<any[]> {
    try {
      const jobs = [];
      const keys = await this.env.CACHE.list({ prefix: `job:${userId}:` });
      
      for (const key of keys.keys) {
        const data = await this.env.CACHE.get(key.name, 'json');
        if (data) {
          jobs.push(data);
        }
      }
      
      return jobs;
    } catch (error) {
      logger.error(`Failed to get user job history for GDPR export: ${userId}`, error);
      return [];
    }
  }

  /**
   * Get user audit logs
   */
  private async getUserAuditLogs(userId: string): Promise<any[]> {
    try {
      const logs = [];
      const keys = await this.env.CACHE.list({ prefix: `audit:${userId}:` });
      
      for (const key of keys.keys) {
        const data = await this.env.CACHE.get(key.name, 'json');
        if (data) {
          logs.push(data);
        }
      }
      
      return logs;
    } catch (error) {
      logger.error(`Failed to get user audit logs for GDPR export: ${userId}`, error);
      return [];
    }
  }

  /**
   * Get user preferences
   */
  private async getUserPreferences(userId: string): Promise<any> {
    try {
      return await this.env.CACHE.get(`user:preferences:${userId}`, 'json') || {};
    } catch (error) {
      logger.error(`Failed to get user preferences for GDPR export: ${userId}`, error);
      return {};
    }
  }

  /**
   * Get user API keys (sanitized)
   */
  private async getUserApiKeys(userId: string): Promise<any[]> {
    try {
      const results = await this.env.DB.prepare(
        'SELECT id, name, scopes, created_at, last_used_at, expires_at FROM api_keys WHERE user_id = ?'
      ).bind(userId).all();
      
      return results.results || [];
    } catch (error) {
      logger.error(`Failed to get user API keys for GDPR export: ${userId}`, error);
      return [];
    }
  }

  /**
   * Format data as JSON
   */
  private formatAsJSON(data: ExportedData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format data as CSV (simplified for key data points)
   */
  private formatAsCSV(data: ExportedData): string {
    // This is a simplified CSV export focusing on key data
    // In production, you might want to create multiple CSV files for different data types
    const csvLines: string[] = [];
    
    // Header
    csvLines.push('Category,Type,Data');
    
    // Profile data
    if (data.profile) {
      csvLines.push(`Profile,User ID,${data.profile.id}`);
      csvLines.push(`Profile,Email,${data.profile.email}`);
      csvLines.push(`Profile,Name,${data.profile.name || ''}`);
      csvLines.push(`Profile,Created At,${data.profile.created_at}`);
    }
    
    // Skills summary
    csvLines.push(`Skills,Total Count,${data.skills.length}`);
    data.skills.forEach(skill => {
      csvLines.push(`Skills,${skill.skill_name},Level ${skill.proficiency_level}`);
    });
    
    // Assessments summary
    csvLines.push(`Assessments,Total Count,${data.assessments.length}`);
    
    // Gap analyses summary
    csvLines.push(`Gap Analyses,Total Count,${data.gapAnalyses.length}`);
    
    return csvLines.join('\n');
  }

  /**
   * Store exported data and return download URL
   */
  private async storeExportedData(
    exportId: string,
    data: string,
    format: 'json' | 'csv'
  ): Promise<string> {
    const key = `gdpr:export:data:${exportId}`;
    const filename = `user-data-export-${exportId}.${format}`;
    
    // Store in KV with expiration
    await this.env.CACHE.put(key, data, {
      expirationTtl: 259200, // 72 hours
      metadata: {
        filename,
        contentType: format === 'json' ? 'application/json' : 'text/csv',
      },
    });
    
    // Return a URL that can be used to download the data
    // In production, this would be a signed URL or similar secure mechanism
    return `/api/v1/gdpr/export/${exportId}/download`;
  }

  /**
   * Get export request from storage
   */
  async getExportRequest(exportId: string): Promise<UserDataExport | null> {
    const data = await this.env.CACHE.get(`gdpr:export:${exportId}`, 'json');
    return data as UserDataExport | null;
  }

  /**
   * Update export request in storage
   */
  private async updateExportRequest(exportRequest: UserDataExport): Promise<void> {
    await this.env.CACHE.put(
      `gdpr:export:${exportRequest.exportId}`,
      JSON.stringify(exportRequest),
      { expirationTtl: 86400 * 7 } // Keep for 7 days
    );
  }

  /**
   * Add export ID to user's export history
   */
  private async addToExportHistory(userId: string, exportId: string): Promise<void> {
    const historyKey = `gdpr:export:history:${userId}`;
    const history = await this.env.CACHE.get(historyKey, 'json') || [];
    
    history.push({
      exportId,
      requestedAt: new Date().toISOString(),
    });
    
    // Keep only last 10 exports in history
    if (history.length > 10) {
      history.shift();
    }
    
    await this.env.CACHE.put(historyKey, JSON.stringify(history), {
      expirationTtl: 86400 * 365, // Keep for 1 year
    });
  }

  /**
   * Queue export job for async processing
   */
  private async queueExportJob(exportRequest: UserDataExport): Promise<void> {
    // In a real implementation, this would queue to Cloudflare Queues or similar
    // For now, we'll store it in a job queue pattern
    const jobKey = `job:gdpr:export:${exportRequest.exportId}`;
    await this.env.CACHE.put(jobKey, JSON.stringify({
      type: 'gdpr_export',
      exportId: exportRequest.exportId,
      userId: exportRequest.userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }), {
      expirationTtl: 86400, // 24 hours
    });
  }

  /**
   * Generate unique export ID
   */
  private generateExportId(): string {
    return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get user's export history
   */
  async getUserExportHistory(userId: string): Promise<any[]> {
    const historyKey = `gdpr:export:history:${userId}`;
    const history = await this.env.CACHE.get(historyKey, 'json') || [];
    
    // Fetch details for each export
    const detailedHistory = await Promise.all(
      history.map(async (item: any) => {
        const exportData = await this.getExportRequest(item.exportId);
        return exportData || item;
      })
    );
    
    return detailedHistory;
  }

  /**
   * Download exported data
   */
  async downloadExport(exportId: string, userId: string): Promise<{ data: string; metadata: any } | null> {
    // Verify the export belongs to the user
    const exportRequest = await this.getExportRequest(exportId);
    if (!exportRequest || exportRequest.userId !== userId) {
      return null;
    }
    
    if (exportRequest.status !== 'completed') {
      throw new Error('Export is not ready for download');
    }
    
    // Get the exported data
    const dataKey = `gdpr:export:data:${exportId}`;
    const data = await this.env.CACHE.get(dataKey);
    const metadata = await this.env.CACHE.get(dataKey, { type: 'json', cacheTtl: 0 });
    
    if (!data) {
      throw new Error('Export data not found or expired');
    }
    
    return { data, metadata };
  }
}
