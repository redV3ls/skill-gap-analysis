import { Env } from '../index';
import { AsyncJob, AsyncJobProcessor } from './asyncJobProcessor';
import { CacheService } from './cache';
import { logger } from '../utils/logger';

export interface SchedulerConfig {
  maxConcurrentJobs: number;
  pollInterval: number; // milliseconds
  priorityWeights: {
    high: number;
    normal: number;
    low: number;
  };
}

export interface SchedulerStats {
  totalProcessed: number;
  totalFailed: number;
  averageProcessingTime: number;
  currentQueueSize: number;
  jobsByType: Record<string, number>;
  jobsByStatus: Record<string, number>;
}

export class JobScheduler {
  private env: Env;
  private cache: CacheService;
  private processor: AsyncJobProcessor;
  private config: SchedulerConfig;
  private isRunning: boolean = false;
  private activeJobs: Map<string, Promise<void>> = new Map();
  private stats: SchedulerStats = {
    totalProcessed: 0,
    totalFailed: 0,
    averageProcessingTime: 0,
    currentQueueSize: 0,
    jobsByType: {},
    jobsByStatus: {},
  };

  constructor(env: Env, config?: Partial<SchedulerConfig>) {
    this.env = env;
    this.cache = new CacheService(env.CACHE);
    this.processor = new AsyncJobProcessor(env);
    this.config = {
      maxConcurrentJobs: config?.maxConcurrentJobs || 5,
      pollInterval: config?.pollInterval || 5000, // 5 seconds
      priorityWeights: config?.priorityWeights || {
        high: 3,
        normal: 2,
        low: 1,
      },
    };
  }

  /**
   * Start the job scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Job scheduler started');

    while (this.isRunning) {
      try {
        await this.processNextBatch();
        await this.cleanupCompletedJobs();
        await this.updateStats();
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, this.config.pollInterval));
      } catch (error) {
        logger.error('Scheduler error:', error);
        // Continue running despite errors
      }
    }
  }

  /**
   * Stop the job scheduler
   */
  async stop(): Promise<void> {
    logger.info('Stopping job scheduler...');
    this.isRunning = false;

    // Wait for active jobs to complete
    if (this.activeJobs.size > 0) {
      logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      await Promise.all(this.activeJobs.values());
    }

    logger.info('Job scheduler stopped');
  }

  /**
   * Process the next batch of jobs
   */
  private async processNextBatch(): Promise<void> {
    // Check if we have capacity for more jobs
    const availableSlots = this.config.maxConcurrentJobs - this.activeJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    // Get pending jobs
    const pendingJobs = await this.getPendingJobs(availableSlots * 2); // Get more than needed for selection
    if (pendingJobs.length === 0) {
      return;
    }

    // Sort jobs by priority and creation time
    const sortedJobs = this.prioritizeJobs(pendingJobs);

    // Process jobs up to available slots
    const jobsToProcess = sortedJobs.slice(0, availableSlots);

    for (const job of jobsToProcess) {
      this.processJob(job);
    }
  }

  /**
   * Process a single job
   */
  private processJob(job: AsyncJob): void {
    const jobPromise = this.processor.processJob(job, {
      progressCallback: async (progress) => {
        // Update progress in real-time
        await this.updateJobProgress(job.id, progress);
      },
    }).finally(() => {
      // Remove from active jobs when complete
      this.activeJobs.delete(job.id);
      this.stats.totalProcessed++;
    });

    this.activeJobs.set(job.id, jobPromise);
    logger.info(`Started processing job ${job.id} (${job.type})`);
  }

  /**
   * Get pending jobs from the queue
   */
  private async getPendingJobs(limit: number): Promise<AsyncJob[]> {
    const jobs: AsyncJob[] = [];

    try {
      // List all job keys
      const { keys } = await this.env.CACHE.list({ 
        prefix: 'job:',
        limit: 1000, // Get more to filter
      });

      for (const key of keys) {
        const job = await this.cache.get<AsyncJob>(key.name.replace('job:', ''));
        
        if (job && job.status === 'pending' && this.shouldProcessJob(job)) {
          jobs.push(job);
          if (jobs.length >= limit) break;
        }
      }
    } catch (error) {
      logger.error('Failed to get pending jobs:', error);
    }

    return jobs;
  }

  /**
   * Check if a job should be processed
   */
  private shouldProcessJob(job: AsyncJob): boolean {
    // Check if job is already being processed
    if (this.activeJobs.has(job.id)) {
      return false;
    }

    // Check retry delay
    if (job.metadata?.nextRetryAt) {
      const retryTime = new Date(job.metadata.nextRetryAt).getTime();
      if (retryTime > Date.now()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Prioritize jobs based on priority and age
   */
  private prioritizeJobs(jobs: AsyncJob[]): AsyncJob[] {
    return jobs.sort((a, b) => {
      // First, sort by priority
      const priorityDiff = 
        this.config.priorityWeights[b.priority] - this.config.priorityWeights[a.priority];
      
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Then, sort by creation time (FIFO within same priority)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const key = `job:${jobId}`;
    const job = await this.cache.get<AsyncJob>(key);
    
    if (job) {
      job.progress = progress;
      job.updatedAt = new Date().toISOString();
      await this.cache.set(key, job, 86400); // 24 hours
    }
  }

  /**
   * Clean up completed jobs older than retention period
   */
  private async cleanupCompletedJobs(): Promise<void> {
    const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffTime = Date.now() - retentionPeriod;

    try {
      const { keys } = await this.env.CACHE.list({ prefix: 'job:' });

      for (const key of keys) {
        const job = await this.cache.get<AsyncJob>(key.name.replace('job:', ''));
        
        if (job && 
            (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
            job.completedAt &&
            new Date(job.completedAt).getTime() < cutoffTime) {
          
          await this.env.CACHE.delete(key.name);
          await this.env.CACHE.delete(`job_result:${job.id}`);
          logger.info(`Cleaned up old job: ${job.id}`);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old jobs:', error);
    }
  }

  /**
   * Update scheduler statistics
   */
  private async updateStats(): Promise<void> {
    try {
      const { keys } = await this.env.CACHE.list({ prefix: 'job:' });
      
      // Reset counters
      this.stats.jobsByType = {};
      this.stats.jobsByStatus = {};
      this.stats.currentQueueSize = 0;

      for (const key of keys) {
        const job = await this.cache.get<AsyncJob>(key.name.replace('job:', ''));
        
        if (job) {
          // Count by type
          this.stats.jobsByType[job.type] = (this.stats.jobsByType[job.type] || 0) + 1;
          
          // Count by status
          this.stats.jobsByStatus[job.status] = (this.stats.jobsByStatus[job.status] || 0) + 1;
          
          // Count queue size
          if (job.status === 'pending') {
            this.stats.currentQueueSize++;
          }
        }
      }

      // Store stats
      await this.cache.set('scheduler:stats', this.stats, 3600); // 1 hour
    } catch (error) {
      logger.error('Failed to update stats:', error);
    }
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<SchedulerStats> {
    return { ...this.stats };
  }

  /**
   * Submit a new job to the scheduler
   */
  async submitJob(
    type: AsyncJob['type'],
    userId: string,
    payload: any,
    options?: {
      priority?: AsyncJob['priority'];
      maxRetries?: number;
      estimatedDuration?: number;
    }
  ): Promise<string> {
    const jobId = crypto.randomUUID();
    
    const job: AsyncJob = {
      id: jobId,
      type,
      userId,
      payload,
      priority: options?.priority || 'normal',
      maxRetries: options?.maxRetries || 3,
      attempts: 0,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        estimatedDuration: options?.estimatedDuration,
      },
    };

    // Store job
    await this.cache.set(`job:${jobId}`, job, 86400); // 24 hours

    // Add to queue
    await this.cache.set(`queue:${jobId}`, { jobId, timestamp: Date.now() }, 3600); // 1 hour

    logger.info(`Job submitted: ${jobId} (${type}) with ${job.priority} priority`);

    return jobId;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.cache.get<AsyncJob>(`job:${jobId}`);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw new Error(`Cannot cancel ${job.status} job`);
    }

    // Check if job is currently being processed
    if (this.activeJobs.has(jobId)) {
      throw new Error('Cannot cancel job that is currently being processed');
    }

    // Update job status
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    await this.cache.set(`job:${jobId}`, job, 86400);

    // Remove from queue
    await this.env.CACHE.delete(`queue:${jobId}`);

    logger.info(`Job cancelled: ${jobId}`);
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<AsyncJob | null> {
    return await this.cache.get<AsyncJob>(`job:${jobId}`);
  }

  /**
   * List jobs for a user
   */
  async listUserJobs(
    userId: string,
    options?: {
      status?: AsyncJob['status'];
      type?: AsyncJob['type'];
      limit?: number;
      offset?: number;
    }
  ): Promise<AsyncJob[]> {
    const jobs: AsyncJob[] = [];
    const limit = options?.limit || 10;
    const offset = options?.offset || 0;

    try {
      const { keys } = await this.env.CACHE.list({ prefix: 'job:' });

      for (const key of keys) {
        const job = await this.cache.get<AsyncJob>(key.name.replace('job:', ''));
        
        if (job && job.userId === userId) {
          // Apply filters
          if (options?.status && job.status !== options.status) continue;
          if (options?.type && job.type !== options.type) continue;
          
          jobs.push(job);
        }
      }

      // Sort by creation date (newest first)
      jobs.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Apply pagination
      return jobs.slice(offset, offset + limit);
    } catch (error) {
      logger.error('Failed to list user jobs:', error);
      return [];
    }
  }
}
