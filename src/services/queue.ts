import { Env } from '../index';
import { logger } from '../utils/logger';

export interface QueueMessage {
  id: string;
  type: 'gap_analysis' | 'team_analysis' | 'trend_computation' | 'bulk_import';
  userId: string;
  payload: any;
  timestamp: string;
  attempts?: number;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class QueueService {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Enqueue a job for async processing
   */
  async enqueueJob(message: QueueMessage): Promise<string> {
    const jobId = message.id || crypto.randomUUID();
    
    try {
      // Store job status in KV
      const jobStatus: JobStatus = {
        id: jobId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await this.env.CACHE.put(
        `job:${jobId}`,
        JSON.stringify(jobStatus),
        { expirationTtl: 86400 } // 24 hours
      );
      
      // In production, this would use Cloudflare Queues
      // For now, we'll simulate with KV storage
      await this.env.CACHE.put(
        `queue:${jobId}`,
        JSON.stringify({ ...message, id: jobId }),
        { expirationTtl: 3600 } // 1 hour
      );
      
      logger.info(`Job enqueued: ${jobId} (${message.type})`);
      return jobId;
      
    } catch (error) {
      logger.error('Failed to enqueue job:', error);
      throw new Error('Failed to enqueue job');
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    try {
      const status = await this.env.CACHE.get(`job:${jobId}`, 'json');
      return status as JobStatus | null;
    } catch (error) {
      logger.error('Failed to get job status:', error);
      return null;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string, 
    updates: Partial<JobStatus>
  ): Promise<void> {
    try {
      const current = await this.getJobStatus(jobId);
      if (!current) {
        throw new Error('Job not found');
      }
      
      const updated: JobStatus = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      if (updates.status === 'completed' || updates.status === 'failed') {
        updated.completedAt = new Date().toISOString();
      }
      
      await this.env.CACHE.put(
        `job:${jobId}`,
        JSON.stringify(updated),
        { expirationTtl: 86400 } // 24 hours
      );
      
      logger.info(`Job status updated: ${jobId} -> ${updates.status}`);
    } catch (error) {
      logger.error('Failed to update job status:', error);
      throw error;
    }
  }

  /**
   * Process queued jobs (worker function)
   */
  async processQueue(): Promise<void> {
    try {
      // List all pending jobs
      const queuePrefix = 'queue:';
      const { keys } = await this.env.CACHE.list({ prefix: queuePrefix });
      
      for (const key of keys) {
        const jobId = key.name.replace(queuePrefix, '');
        const message = await this.env.CACHE.get(key.name, 'json') as QueueMessage;
        
        if (message) {
          await this.processJob(message);
          await this.env.CACHE.delete(key.name);
        }
      }
    } catch (error) {
      logger.error('Queue processing error:', error);
    }
  }

  /**
   * Process individual job
   */
  private async processJob(message: QueueMessage): Promise<void> {
    const { id, type, userId, payload } = message;
    
    try {
      await this.updateJobStatus(id, { 
        status: 'processing',
        progress: 0 
      });
      
      let result: any;
      
      switch (type) {
        case 'gap_analysis':
          result = await this.processGapAnalysis(id, userId, payload);
          break;
          
        case 'team_analysis':
          result = await this.processTeamAnalysis(id, userId, payload);
          break;
          
        case 'trend_computation':
          result = await this.processTrendComputation(id, payload);
          break;
          
        case 'bulk_import':
          result = await this.processBulkImport(id, userId, payload);
          break;
          
        default:
          throw new Error(`Unknown job type: ${type}`);
      }
      
      await this.updateJobStatus(id, {
        status: 'completed',
        progress: 100,
        result
      });
      
    } catch (error) {
      logger.error(`Job processing failed: ${id}`, error);
      await this.updateJobStatus(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process gap analysis job
   */
  private async processGapAnalysis(
    jobId: string,
    userId: string,
    payload: any
  ): Promise<any> {
    // Simulate processing with progress updates
    for (let i = 0; i <= 100; i += 20) {
      await this.updateJobStatus(jobId, { progress: i });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // In real implementation, this would call the gap analysis service
    return {
      analysisId: crypto.randomUUID(),
      overallMatch: 75,
      skillGaps: payload.skills?.length || 0,
      processingTime: 500
    };
  }

  /**
   * Process team analysis job
   */
  private async processTeamAnalysis(
    jobId: string,
    userId: string,
    payload: any
  ): Promise<any> {
    const teamSize = payload.team_members?.length || 0;
    
    // Update progress as we process each member
    for (let i = 0; i < teamSize; i++) {
      const progress = Math.round((i / teamSize) * 100);
      await this.updateJobStatus(jobId, { progress });
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return {
      analysisId: crypto.randomUUID(),
      teamSize,
      overallMatch: 68,
      criticalGaps: 5
    };
  }

  /**
   * Process trend computation job
   */
  private async processTrendComputation(
    jobId: string,
    payload: any
  ): Promise<any> {
    // Simulate trend computation
    await this.updateJobStatus(jobId, { progress: 50 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      trendsComputed: payload.skills?.length || 0,
      emergingSkills: 3,
      decliningSkills: 1
    };
  }

  /**
   * Process bulk import job
   */
  private async processBulkImport(
    jobId: string,
    userId: string,
    payload: any
  ): Promise<any> {
    const totalItems = payload.items?.length || 0;
    
    // Process items in batches
    const batchSize = 10;
    for (let i = 0; i < totalItems; i += batchSize) {
      const progress = Math.round((i / totalItems) * 100);
      await this.updateJobStatus(jobId, { progress });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      imported: totalItems,
      failed: 0,
      skipped: 0
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      const status = await this.getJobStatus(jobId);
      if (!status) {
        throw new Error('Job not found');
      }
      
      if (status.status === 'completed' || status.status === 'failed') {
        throw new Error('Cannot cancel completed job');
      }
      
      await this.updateJobStatus(jobId, {
        status: 'failed',
        error: 'Job cancelled by user'
      });
      
      // Remove from queue
      await this.env.CACHE.delete(`queue:${jobId}`);
      
    } catch (error) {
      logger.error('Failed to cancel job:', error);
      throw error;
    }
  }

  /**
   * Get user's jobs
   */
  async getUserJobs(userId: string, limit: number = 10): Promise<JobStatus[]> {
    const jobs: JobStatus[] = [];
    
    try {
      // In production, this would query a proper database
      // For now, we'll scan KV keys (not efficient for large datasets)
      const { keys } = await this.env.CACHE.list({ 
        prefix: 'job:',
        limit: 1000 
      });
      
      for (const key of keys) {
        const job = await this.env.CACHE.get(key.name, 'json') as JobStatus;
        if (job && key.name.includes(userId)) {
          jobs.push(job);
        }
      }
      
      // Sort by creation date and limit
      return jobs
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
        
    } catch (error) {
      logger.error('Failed to get user jobs:', error);
      return [];
    }
  }
}

// Queue worker for scheduled execution
export async function queueWorker(env: Env): Promise<void> {
  const queueService = new QueueService(env);
  await queueService.processQueue();
}
