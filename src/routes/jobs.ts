import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { AuthenticatedContext, requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { QueueService, QueueMessage } from '../services/queue';
import { validateRequest } from '../schemas/validation';

const jobs = new Hono<{ Bindings: Env }>();

// Apply authentication to all job routes
jobs.use('*', requireAuth);

// Schema for async gap analysis request
const asyncGapAnalysisSchema = z.object({
  user_skills: z.array(z.object({
    skill: z.string(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    years_experience: z.number().optional(),
    certifications: z.array(z.string()).optional()
  })).min(1),
  target_job: z.object({
    title: z.string(),
    description: z.string(),
    company: z.string().optional(),
    location: z.string().optional(),
    required_skills: z.array(z.string()).optional()
  }),
  analysis_options: z.object({
    include_recommendations: z.boolean().optional(),
    include_learning_paths: z.boolean().optional(),
    geographic_region: z.string().optional()
  }).optional()
});

// Schema for async team analysis request
const asyncTeamAnalysisSchema = z.object({
  team_members: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    role: z.string().optional(),
    department: z.string().optional(),
    skills: z.array(z.object({
      skill: z.string(),
      level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
      years_experience: z.number().optional(),
      certifications: z.array(z.string()).optional()
    }))
  })).min(2),
  project_requirements: z.object({
    name: z.string(),
    description: z.string().optional(),
    required_skills: z.array(z.string()),
    timeline: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional()
  })
});

// Schema for bulk import request
const bulkImportSchema = z.object({
  type: z.enum(['skills', 'users', 'job_requirements']),
  format: z.enum(['csv', 'json']),
  data: z.string().optional(), // Base64 encoded file content
  url: z.string().url().optional(), // Or URL to fetch from
  options: z.object({
    skipDuplicates: z.boolean().optional(),
    updateExisting: z.boolean().optional(),
    validateData: z.boolean().optional()
  }).optional()
});

/**
 * POST /jobs/gap-analysis - Submit async gap analysis job
 */
jobs.post('/gap-analysis', validateRequest(asyncGapAnalysisSchema), async (c: AuthenticatedContext) => {
  try {
    const payload = c.get('validatedData') as z.infer<typeof asyncGapAnalysisSchema>;
    const queueService = new QueueService(c.env);
    
    const message: QueueMessage = {
      id: crypto.randomUUID(),
      type: 'gap_analysis',
      userId: c.user!.id,
      payload,
      timestamp: new Date().toISOString()
    };
    
    const jobId = await queueService.enqueueJob(message);
    
    return c.json({
      jobId,
      status: 'pending',
      message: 'Gap analysis job submitted successfully',
      estimatedTime: '2-5 minutes'
    }, 202); // 202 Accepted
    
  } catch (error) {
    console.error('Failed to submit gap analysis job:', error);
    throw new AppError('Failed to submit job', 500, 'JOB_SUBMISSION_FAILED');
  }
});

/**
 * POST /jobs/team-analysis - Submit async team analysis job
 */
jobs.post('/team-analysis', validateRequest(asyncTeamAnalysisSchema), async (c: AuthenticatedContext) => {
  try {
    const payload = c.get('validatedData') as z.infer<typeof asyncTeamAnalysisSchema>;
    const queueService = new QueueService(c.env);
    
    const message: QueueMessage = {
      id: crypto.randomUUID(),
      type: 'team_analysis',
      userId: c.user!.id,
      payload,
      timestamp: new Date().toISOString()
    };
    
    const jobId = await queueService.enqueueJob(message);
    
    const estimatedTime = payload.team_members.length * 30; // 30 seconds per member
    
    return c.json({
      jobId,
      status: 'pending',
      message: 'Team analysis job submitted successfully',
      estimatedTime: `${Math.ceil(estimatedTime / 60)} minutes`,
      teamSize: payload.team_members.length
    }, 202);
    
  } catch (error) {
    console.error('Failed to submit team analysis job:', error);
    throw new AppError('Failed to submit job', 500, 'JOB_SUBMISSION_FAILED');
  }
});

/**
 * POST /jobs/bulk-import - Submit bulk import job
 */
jobs.post('/bulk-import', validateRequest(bulkImportSchema), async (c: AuthenticatedContext) => {
  try {
    const payload = c.get('validatedData') as z.infer<typeof bulkImportSchema>;
    const queueService = new QueueService(c.env);
    
    // Validate data source
    if (!payload.data && !payload.url) {
      throw new AppError('Either data or url must be provided', 400, 'INVALID_REQUEST');
    }
    
    const message: QueueMessage = {
      id: crypto.randomUUID(),
      type: 'bulk_import',
      userId: c.user!.id,
      payload,
      timestamp: new Date().toISOString()
    };
    
    const jobId = await queueService.enqueueJob(message);
    
    return c.json({
      jobId,
      status: 'pending',
      message: 'Bulk import job submitted successfully',
      type: payload.type,
      format: payload.format
    }, 202);
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Failed to submit bulk import job:', error);
    throw new AppError('Failed to submit job', 500, 'JOB_SUBMISSION_FAILED');
  }
});

/**
 * GET /jobs/:jobId - Get job status
 */
jobs.get('/:jobId', async (c: AuthenticatedContext) => {
  try {
    const jobId = c.req.param('jobId');
    const queueService = new QueueService(c.env);
    
    const status = await queueService.getJobStatus(jobId);
    
    if (!status) {
      throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    
    return c.json(status);
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Failed to get job status:', error);
    throw new AppError('Failed to retrieve job status', 500, 'JOB_STATUS_RETRIEVAL_FAILED');
  }
});

/**
 * DELETE /jobs/:jobId - Cancel a job
 */
jobs.delete('/:jobId', async (c: AuthenticatedContext) => {
  try {
    const jobId = c.req.param('jobId');
    const queueService = new QueueService(c.env);
    
    await queueService.cancelJob(jobId);
    
    return c.json({
      message: 'Job cancelled successfully',
      jobId
    });
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    if (error instanceof Error && error.message.includes('Cannot cancel')) {
      throw new AppError(error.message, 400, 'INVALID_OPERATION');
    }
    
    console.error('Failed to cancel job:', error);
    throw new AppError('Failed to cancel job', 500, 'JOB_CANCELLATION_FAILED');
  }
});

/**
 * GET /jobs - List user's jobs
 */
jobs.get('/', async (c: AuthenticatedContext) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const queueService = new QueueService(c.env);
    
    const jobs = await queueService.getUserJobs(c.user!.id, limit);
    
    return c.json({
      jobs,
      count: jobs.length
    });
    
  } catch (error) {
    console.error('Failed to list jobs:', error);
    throw new AppError('Failed to retrieve jobs', 500, 'JOB_LIST_RETRIEVAL_FAILED');
  }
});

/**
 * GET /jobs/:jobId/result - Get job result (redirect to actual result)
 */
jobs.get('/:jobId/result', async (c: AuthenticatedContext) => {
  try {
    const jobId = c.req.param('jobId');
    const queueService = new QueueService(c.env);
    
    const status = await queueService.getJobStatus(jobId);
    
    if (!status) {
      throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
    }
    
    if (status.status !== 'completed') {
      throw new AppError(
        `Job is ${status.status}. Results are only available for completed jobs.`,
        400,
        'JOB_NOT_COMPLETED'
      );
    }
    
    // Return the result directly
    return c.json({
      jobId,
      status: status.status,
      completedAt: status.completedAt,
      result: status.result
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Failed to get job result:', error);
    throw new AppError('Failed to retrieve job result', 500, 'JOB_RESULT_RETRIEVAL_FAILED');
  }
});

/**
 * POST /jobs/process - Trigger job processing (admin/worker endpoint)
 * This would typically be called by a scheduled worker or admin
 */
jobs.post('/process', async (c: AuthenticatedContext) => {
  try {
    // In production, you might want to restrict this to admin users
    // or internal workers only
    const queueService = new QueueService(c.env);
    await queueService.processQueue();
    
    return c.json({
      message: 'Queue processing triggered',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Failed to process queue:', error);
    throw new AppError('Failed to process queue', 500, 'QUEUE_PROCESSING_FAILED');
  }
});

export default jobs;
