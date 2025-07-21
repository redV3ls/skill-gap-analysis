import { Env } from '../index';
import { D1Database } from '@cloudflare/workers-types';
import { logger } from '../utils/logger';
import { GapAnalysisService } from './gapAnalysis';
import { TeamAnalysisService } from './teamAnalysis';
import { TrendsAnalysisService } from './trendsAnalysis';
import { CacheService } from './cache';
import { DatabaseManager } from './databaseManager';

export interface AsyncJob {
  id: string;
  type: 'gap_analysis' | 'team_analysis' | 'trend_computation' | 'bulk_import' | 'report_generation';
  userId: string;
  payload: any;
  priority: 'low' | 'normal' | 'high';
  maxRetries: number;
  attempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: {
    estimatedDuration?: number;
    actualDuration?: number;
    resourceUsage?: {
      cpu?: number;
      memory?: number;
      apiCalls?: number;
    };
  };
}

export interface ProcessingOptions {
  timeout?: number;
  retryDelay?: number;
  progressCallback?: (progress: number) => Promise<void>;
}

export class AsyncJobProcessor {
  private env: Env;
  private db: D1Database;
  private cache: CacheService;
  private dbManager: DatabaseManager;

  constructor(env: Env) {
    this.env = env;
    this.db = env.DB;
    this.cache = new CacheService(env.CACHE);
    this.dbManager = new DatabaseManager(env.DB, this.cache);
  }

  /**
   * Process a job with proper error handling and retry logic
   */
  async processJob(job: AsyncJob, options?: ProcessingOptions): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update job status to processing
      await this.updateJobStatus(job.id, {
        status: 'processing',
        startedAt: new Date().toISOString(),
        attempts: job.attempts + 1,
      });

      // Set timeout for job processing
      const timeout = options?.timeout || 300000; // 5 minutes default
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job processing timeout')), timeout);
      });

      // Process the job with timeout
      const result = await Promise.race([
        this.executeJob(job, options),
        timeoutPromise,
      ]);

      // Calculate duration
      const duration = Date.now() - startTime;

      // Update job as completed
      await this.updateJobStatus(job.id, {
        status: 'completed',
        progress: 100,
        result,
        completedAt: new Date().toISOString(),
        metadata: {
          ...job.metadata,
          actualDuration: duration,
        },
      });

      logger.info(`Job ${job.id} completed successfully in ${duration}ms`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Job ${job.id} failed:`, error);

      // Check if we should retry
      if (job.attempts < job.maxRetries && !this.isNonRetryableError(error)) {
        await this.scheduleRetry(job, errorMessage, options?.retryDelay);
      } else {
        // Mark as permanently failed
        await this.updateJobStatus(job.id, {
          status: 'failed',
          error: errorMessage,
          completedAt: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Execute the job based on its type
   */
  private async executeJob(job: AsyncJob, options?: ProcessingOptions): Promise<any> {
    const progressCallback = async (progress: number) => {
      await this.updateJobStatus(job.id, { progress });
      if (options?.progressCallback) {
        await options.progressCallback(progress);
      }
    };

    switch (job.type) {
      case 'gap_analysis':
        return await this.executeGapAnalysis(job, progressCallback);

      case 'team_analysis':
        return await this.executeTeamAnalysis(job, progressCallback);

      case 'trend_computation':
        return await this.executeTrendComputation(job, progressCallback);

      case 'bulk_import':
        return await this.executeBulkImport(job, progressCallback);

      case 'report_generation':
        return await this.executeReportGeneration(job, progressCallback);

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  /**
   * Execute gap analysis job
   */
  private async executeGapAnalysis(
    job: AsyncJob,
    progressCallback: (progress: number) => Promise<void>
  ): Promise<any> {
    const gapAnalysisService = new GapAnalysisService(this.db, this.cache);
    
    await progressCallback(10);

    // Extract skills from job description if needed
    const { user_skills, target_job, analysis_options } = job.payload;
    
    await progressCallback(30);

    // Perform the analysis
    const analysis = await gapAnalysisService.analyzeGap({
      userId: job.userId,
      userSkills: user_skills,
      targetJob: target_job,
      options: analysis_options,
    });

    await progressCallback(80);

    // Store the result
    await this.storeJobResult(job.id, analysis);

    await progressCallback(100);

    return {
      analysisId: analysis.id,
      overallMatch: analysis.overallMatch,
      skillGaps: analysis.skillGaps.length,
      recommendations: analysis.recommendations?.length || 0,
    };
  }

  /**
   * Execute team analysis job
   */
  private async executeTeamAnalysis(
    job: AsyncJob,
    progressCallback: (progress: number) => Promise<void>
  ): Promise<any> {
    const teamAnalysisService = new TeamAnalysisService(this.db, this.cache);
    
    const { team_members, project_requirements } = job.payload;
    const totalMembers = team_members.length;

    // Process each team member
    const memberAnalyses = [];
    for (let i = 0; i < totalMembers; i++) {
      const member = team_members[i];
      const progress = Math.round((i / totalMembers) * 80);
      await progressCallback(progress);

      const memberAnalysis = await teamAnalysisService.analyzeMember(member, project_requirements);
      memberAnalyses.push(memberAnalysis);
    }

    await progressCallback(90);

    // Aggregate team results
    const teamResult = await teamAnalysisService.aggregateTeamResults({
      teamId: crypto.randomUUID(),
      memberAnalyses,
      projectRequirements: project_requirements,
    });

    await progressCallback(100);

    return teamResult;
  }

  /**
   * Execute trend computation job
   */
  private async executeTrendComputation(
    job: AsyncJob,
    progressCallback: (progress: number) => Promise<void>
  ): Promise<any> {
    const trendsService = new TrendsAnalysisService(this.db, this.cache);
    
    await progressCallback(20);

    const { region, industry, timeframe } = job.payload;
    
    // Compute various trends
    const emergingSkills = await trendsService.getEmergingSkills({ limit: 10 });
    await progressCallback(40);

    const decliningSkills = await trendsService.getDecliningSkills({ limit: 10 });
    await progressCallback(60);

    const regionalTrends = region ? 
      await trendsService.getRegionalTrends(region) : null;
    await progressCallback(80);

    const forecast = await trendsService.generateForecast({
      skills: [...emergingSkills, ...decliningSkills].map(s => s.skill),
      months: 6,
    });
    await progressCallback(100);

    return {
      computedAt: new Date().toISOString(),
      emergingSkills: emergingSkills.length,
      decliningSkills: decliningSkills.length,
      regionalData: regionalTrends ? true : false,
      forecastGenerated: true,
    };
  }

  /**
   * Execute bulk import job
   */
  private async executeBulkImport(
    job: AsyncJob,
    progressCallback: (progress: number) => Promise<void>
  ): Promise<any> {
    const { type, format, data, url, options } = job.payload;
    
    await progressCallback(10);

    // Fetch data if URL provided
    let importData = data;
    if (url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      importData = await response.text();
    }

    await progressCallback(30);

    // Parse data based on format
    let items: any[] = [];
    if (format === 'csv') {
      items = this.parseCSV(importData);
    } else if (format === 'json') {
      items = JSON.parse(importData);
    }

    const totalItems = items.length;
    let imported = 0;
    let failed = 0;
    let skipped = 0;

    // Process items in batches
    const batchSize = 50;
    for (let i = 0; i < totalItems; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const progress = 30 + Math.round((i / totalItems) * 60);
      await progressCallback(progress);

      try {
        const results = await this.importBatch(type, batch, options);
        imported += results.imported;
        failed += results.failed;
        skipped += results.skipped;
      } catch (error) {
        failed += batch.length;
        logger.error(`Batch import failed at index ${i}:`, error);
      }
    }

    await progressCallback(100);

    return {
      totalItems,
      imported,
      failed,
      skipped,
      successRate: totalItems > 0 ? (imported / totalItems) * 100 : 0,
    };
  }

  /**
   * Execute report generation job
   */
  private async executeReportGeneration(
    job: AsyncJob,
    progressCallback: (progress: number) => Promise<void>
  ): Promise<any> {
    const { reportType, parameters, format } = job.payload;
    
    await progressCallback(20);

    // Generate report data
    const reportData = await this.generateReportData(reportType, parameters);
    await progressCallback(60);

    // Format report
    const formattedReport = await this.formatReport(reportData, format);
    await progressCallback(80);

    // Store report
    const reportId = crypto.randomUUID();
    await this.storeReport(reportId, formattedReport);
    await progressCallback(100);

    return {
      reportId,
      reportType,
      format,
      size: formattedReport.length,
      url: `/api/v1/reports/${reportId}`,
    };
  }

  /**
   * Helper methods
   */
  private async updateJobStatus(jobId: string, updates: Partial<AsyncJob>): Promise<void> {
    const key = `job:${jobId}`;
    const existing = await this.cache.get<AsyncJob>(key);
    
    if (!existing) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updated: AsyncJob = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.cache.set(key, updated, 86400); // 24 hours
  }

  private isNonRetryableError(error: any): boolean {
    const nonRetryableMessages = [
      'validation error',
      'invalid input',
      'unauthorized',
      'forbidden',
      'not found',
    ];

    const errorMessage = error?.message?.toLowerCase() || '';
    return nonRetryableMessages.some(msg => errorMessage.includes(msg));
  }

  private async scheduleRetry(job: AsyncJob, error: string, delay?: number): Promise<void> {
    const retryDelay = delay || Math.min(1000 * Math.pow(2, job.attempts), 60000); // Exponential backoff, max 1 minute
    
    await this.updateJobStatus(job.id, {
      status: 'pending',
      error: `Retry ${job.attempts}/${job.maxRetries}: ${error}`,
      metadata: {
        ...job.metadata,
        nextRetryAt: new Date(Date.now() + retryDelay).toISOString(),
      },
    });

    // Re-queue the job with delay
    setTimeout(async () => {
      await this.env.CACHE.put(`queue:${job.id}`, JSON.stringify(job), { expirationTtl: 3600 });
    }, retryDelay);
  }

  private async storeJobResult(jobId: string, result: any): Promise<void> {
    const key = `job_result:${jobId}`;
    await this.cache.set(key, result, 604800); // 7 days
  }

  private parseCSV(csvData: string): any[] {
    // Simple CSV parser - in production, use a proper library
    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const items = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const item: any = {};
      
      headers.forEach((header, index) => {
        item[header] = values[index];
      });
      
      items.push(item);
    }

    return items;
  }

  private async importBatch(
    type: string,
    items: any[],
    options: any
  ): Promise<{ imported: number; failed: number; skipped: number }> {
    let imported = 0;
    let failed = 0;
    let skipped = 0;

    // This would be implemented based on the import type
    // For now, simulate processing
    for (const item of items) {
      try {
        if (options?.skipDuplicates) {
          // Check for duplicates
          const exists = false; // Implement duplicate check
          if (exists) {
            skipped++;
            continue;
          }
        }

        // Import the item
        // await this.importItem(type, item);
        imported++;
      } catch (error) {
        failed++;
      }
    }

    return { imported, failed, skipped };
  }

  private async generateReportData(reportType: string, parameters: any): Promise<any> {
    // Implement report generation based on type
    return {
      type: reportType,
      generatedAt: new Date().toISOString(),
      data: {}, // Actual report data
    };
  }

  private async formatReport(data: any, format: string): Promise<string> {
    // Format report based on requested format
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      // Convert to CSV
      return 'csv,data,here';
    }
    return JSON.stringify(data);
  }

  private async storeReport(reportId: string, report: string): Promise<void> {
    await this.cache.set(`report:${reportId}`, report, 604800); // 7 days
  }
}
