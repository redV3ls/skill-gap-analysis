import { Env } from '../index';
import { QueueService } from '../services/queue';
import { logger } from '../utils/logger';

export interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

/**
 * Scheduled worker for processing queued jobs
 * This runs on a cron schedule defined in wrangler.toml
 */
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info(`Queue worker triggered at ${new Date(event.scheduledTime).toISOString()}`);
    
    try {
      const queueService = new QueueService(env);
      
      // Process pending jobs
      await queueService.processQueue();
      
      // Clean up old completed jobs (older than 7 days)
      await cleanupOldJobs(env);
      
      logger.info('Queue worker completed successfully');
    } catch (error) {
      logger.error('Queue worker error:', error);
      // In production, you might want to send alerts here
    }
  }
};

/**
 * Clean up old job records from KV storage
 */
async function cleanupOldJobs(env: Env): Promise<void> {
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const { keys } = await env.CACHE.list({ prefix: 'job:' });
    
    let cleanedCount = 0;
    
    for (const key of keys) {
      const job = await env.CACHE.get(key.name, 'json') as any;
      
      if (job && job.completedAt) {
        const completedTime = new Date(job.completedAt).getTime();
        
        if (completedTime < sevenDaysAgo) {
          await env.CACHE.delete(key.name);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old job records`);
    }
  } catch (error) {
    logger.error('Failed to clean up old jobs:', error);
  }
}

/**
 * Alternative: Durable Object for more sophisticated queue processing
 * This requires a paid Cloudflare plan
 */
export class QueueProcessor {
  private state: DurableObjectState;
  private env: Env;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/process':
        await this.processJobs();
        return new Response('Processing started', { status: 200 });
        
      case '/status':
        const status = await this.getStatus();
        return new Response(JSON.stringify(status), {
          headers: { 'Content-Type': 'application/json' }
        });
        
      default:
        return new Response('Not found', { status: 404 });
    }
  }
  
  private async processJobs(): Promise<void> {
    // Set an alarm to process jobs every minute
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm == null) {
      await this.state.storage.setAlarm(Date.now() + 60000); // 1 minute
    }
  }
  
  async alarm(): Promise<void> {
    // Process queue when alarm triggers
    const queueService = new QueueService(this.env);
    await queueService.processQueue();
    
    // Set next alarm
    await this.state.storage.setAlarm(Date.now() + 60000);
  }
  
  private async getStatus(): Promise<any> {
    return {
      active: true,
      lastProcessed: await this.state.storage.get('lastProcessed'),
      jobsProcessed: await this.state.storage.get('jobsProcessed') || 0
    };
  }
}
