import { Env } from './index';
import { JobScheduler } from './services/jobScheduler';
import { DataRetentionService } from './services/dataRetentionService';
import { logger } from './utils/logger';

export interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

/**
 * Scheduled handler for processing async jobs and data retention
 * Runs every 5 minutes based on wrangler.toml configuration
 */
export default async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const startTime = Date.now();
  
  logger.info(`Scheduled tasks started at ${new Date(event.scheduledTime).toISOString()}`);
  
  try {
    // Run data retention purging first (it's usually faster)
    await runDataRetentionPurge(env);
    
    // Then process async jobs
    // Create job scheduler with appropriate configuration
    const scheduler = new JobScheduler(env, {
      maxConcurrentJobs: 10, // Process up to 10 jobs concurrently
      pollInterval: 1000, // Check for new jobs every second during this run
    });

    // Process jobs for a maximum of 4 minutes (leaving 1 minute buffer)
    const maxRunTime = 4 * 60 * 1000; // 4 minutes
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.info('Scheduled job processor timeout reached');
        resolve();
      }, maxRunTime);
    });

    // Start the scheduler
    const schedulerPromise = scheduler.start();

    // Wait for either timeout or natural completion
    await Promise.race([schedulerPromise, timeoutPromise]);

    // Stop the scheduler gracefully
    await scheduler.stop();

    // Get and log statistics
    const stats = await scheduler.getStats();
    const duration = Date.now() - startTime;

    logger.info('Scheduled tasks completed', {
      duration,
      jobStats: {
        totalProcessed: stats.totalProcessed,
        totalFailed: stats.totalFailed,
        currentQueueSize: stats.currentQueueSize,
        jobsByType: stats.jobsByType,
        jobsByStatus: stats.jobsByStatus,
      },
    });

    // Store metrics for monitoring
    await storeScheduledRunMetrics(env, {
      timestamp: event.scheduledTime,
      duration,
      jobsProcessed: stats.totalProcessed,
      jobsFailed: stats.totalFailed,
      queueSize: stats.currentQueueSize,
    });

  } catch (error) {
    logger.error('Scheduled tasks error:', error);
    
    // Store error metrics
    await storeScheduledRunMetrics(env, {
      timestamp: event.scheduledTime,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Store metrics about scheduled runs for monitoring
 */
async function storeScheduledRunMetrics(
  env: Env,
  metrics: any
): Promise<void> {
  try {
    const key = `scheduled_run:${new Date(metrics.timestamp).toISOString()}`;
    await env.CACHE.put(key, JSON.stringify(metrics), {
      expirationTtl: 86400 * 7, // Keep for 7 days
    });

    // Update last run info
    await env.CACHE.put('scheduled_run:last', JSON.stringify({
      ...metrics,
      completedAt: new Date().toISOString(),
    }));
  } catch (error) {
    logger.error('Failed to store scheduled run metrics:', error);
  }
}

/**
 * Run data retention purging
 */
async function runDataRetentionPurge(env: Env): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting data retention purge');
  
  try {
    const retentionService = new DataRetentionService(env);
    const results = await retentionService.purgeExpiredData();
    
    const duration = Date.now() - startTime;
    logger.info('Data retention purge completed', {
      duration,
      results,
    });
    
    // Store retention metrics
    await env.CACHE.put('retention:last_run', JSON.stringify({
      timestamp: new Date().toISOString(),
      duration,
      results,
    }), {
      expirationTtl: 86400 * 30, // Keep for 30 days
    });
  } catch (error) {
    logger.error('Data retention purge failed:', error);
    throw error;
  }
}

/**
 * Alternative implementation using Cloudflare Queues (requires paid plan)
 * This would be the preferred approach for production
 */
export async function handleQueueBatch(
  batch: MessageBatch,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  logger.info(`Processing queue batch with ${batch.messages.length} messages`);

  for (const message of batch.messages) {
    try {
      // Process each message
      const job = message.body as any;
      
      // Use the job scheduler to process
      const scheduler = new JobScheduler(env);
      await scheduler.submitJob(
        job.type,
        job.userId,
        job.payload,
        {
          priority: job.priority,
          maxRetries: job.maxRetries,
        }
      );

      // Acknowledge successful processing
      message.ack();
    } catch (error) {
      logger.error(`Failed to process message ${message.id}:`, error);
      
      // Retry the message
      message.retry();
    }
  }
}

// Export types for Cloudflare Queues
interface MessageBatch {
  readonly queue: string;
  readonly messages: Message[];
}

interface Message {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: any;
  ack(): void;
  retry(): void;
}
