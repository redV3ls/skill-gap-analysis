import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { validate, validateParams, validateQuery, commonSchemas } from '../middleware/inputValidation';
import { JobRequirementsService } from '../db/jobRequirements';
import { DatabaseManager } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, requireRole } from '../middleware/auth';

const jobs = new Hono<{ Bindings: Env }>();

// Apply authentication to all job routes
jobs.use('*', requireAuth);

// Validation schemas
const skillImportanceEnum = z.enum(['critical', 'important', 'nice-to-have']);
const skillLevelEnum = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

const jobSkillRequirementSchema = z.object({
  skillId: commonSchemas.uuid,
  skillName: z.string().min(1).max(100).optional(),
  importance: skillImportanceEnum,
  minimumLevel: skillLevelEnum,
  yearsRequired: z.number().min(0).max(50).optional()
});

const createJobSchema = z.object({
  title: z.string().min(1, 'Job title is required').max(200),
  company: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  requiredSkills: z.array(jobSkillRequirementSchema).min(1, 'At least one skill is required')
});

const updateJobSchema = createJobSchema.partial().omit({ requiredSkills: true }).extend({
  requiredSkills: z.array(jobSkillRequirementSchema).optional()
});

const jobSearchSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  skillNames: z.array(z.string()).optional(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
});

const jobParamsSchema = z.object({
  jobId: commonSchemas.uuid
});

const skillParamsSchema = z.object({
  jobId: commonSchemas.uuid,
  skillId: commonSchemas.uuid
});

/**
 * POST /jobs
 * Create a new job posting (admin only)
 */
jobs.post('/',
  requireRole('admin'),
  validate({
    body: createJobSchema
  }, { sanitize: true }),
  async (c) => {
    try {
      const jobData = c.get('validatedBody');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const job = await jobService.createJob(jobData);

      return c.json({
        success: true,
        data: job
      }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to create job', 500, 'JOB_CREATION_ERROR');
    }
  }
);

/**
 * GET /jobs/search
 * Search jobs with filters
 */
jobs.get('/search',
  validateQuery(jobSearchSchema),
  async (c) => {
    try {
      const searchParams = c.get('validatedQuery');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const jobs = await jobService.searchJobs(searchParams);

      return c.json({
        success: true,
        data: jobs,
        pagination: {
          limit: searchParams.limit,
          offset: searchParams.offset,
          total: jobs.length
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to search jobs', 500, 'JOB_SEARCH_ERROR');
    }
  }
);

/**
 * GET /jobs/:jobId
 * Get job details
 */
jobs.get('/:jobId',
  validateParams(jobParamsSchema),
  async (c) => {
    try {
      const { jobId } = c.get('validatedParams');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const job = await jobService.getJob(jobId);
      
      if (!job) {
        throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
      }

      return c.json({
        success: true,
        data: job
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to get job', 500, 'JOB_FETCH_ERROR');
    }
  }
);

/**
 * PUT /jobs/:jobId
 * Update job (admin only)
 */
jobs.put('/:jobId',
  requireRole('admin'),
  validate({
    params: jobParamsSchema,
    body: updateJobSchema
  }, { sanitize: true }),
  async (c) => {
    try {
      const { jobId } = c.get('validatedParams');
      const jobData = c.get('validatedBody');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const job = await jobService.updateJob(jobId, jobData);

      return c.json({
        success: true,
        data: job
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to update job', 500, 'JOB_UPDATE_ERROR');
    }
  }
);

/**
 * DELETE /jobs/:jobId
 * Delete job (admin only)
 */
jobs.delete('/:jobId',
  requireRole('admin'),
  validateParams(jobParamsSchema),
  async (c) => {
    try {
      const { jobId } = c.get('validatedParams');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      await jobService.deleteJob(jobId);

      return c.json({
        success: true,
        message: 'Job deleted successfully'
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to delete job', 500, 'JOB_DELETE_ERROR');
    }
  }
);

/**
 * GET /jobs/:jobId/skills
 * Get job skill requirements
 */
jobs.get('/:jobId/skills',
  validateParams(jobParamsSchema),
  async (c) => {
    try {
      const { jobId } = c.get('validatedParams');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const skills = await jobService.getJobSkills(jobId);

      return c.json({
        success: true,
        data: skills
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to get job skills', 500, 'JOB_SKILLS_FETCH_ERROR');
    }
  }
);

/**
 * POST /jobs/:jobId/skills
 * Add skill requirement to job (admin only)
 */
jobs.post('/:jobId/skills',
  requireRole('admin'),
  validate({
    params: jobParamsSchema,
    body: jobSkillRequirementSchema
  }, { sanitize: true }),
  async (c) => {
    try {
      const { jobId } = c.get('validatedParams');
      const skillData = c.get('validatedBody');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const skill = await jobService.addJobSkill(jobId, skillData);

      return c.json({
        success: true,
        data: skill
      }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to add job skill', 500, 'JOB_SKILL_ADD_ERROR');
    }
  }
);

/**
 * PUT /jobs/:jobId/skills/:skillId
 * Update job skill requirement (admin only)
 */
jobs.put('/:jobId/skills/:skillId',
  requireRole('admin'),
  validate({
    params: skillParamsSchema,
    body: jobSkillRequirementSchema.partial()
  }, { sanitize: true }),
  async (c) => {
    try {
      const { jobId, skillId } = c.get('validatedParams');
      const skillData = c.get('validatedBody');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const skill = await jobService.updateJobSkill(jobId, skillId, skillData);

      return c.json({
        success: true,
        data: skill
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to update job skill', 500, 'JOB_SKILL_UPDATE_ERROR');
    }
  }
);

/**
 * DELETE /jobs/:jobId/skills/:skillId
 * Remove skill requirement from job (admin only)
 */
jobs.delete('/:jobId/skills/:skillId',
  requireRole('admin'),
  validateParams(skillParamsSchema),
  async (c) => {
    try {
      const { jobId, skillId } = c.get('validatedParams');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      await jobService.removeJobSkill(jobId, skillId);

      return c.json({
        success: true,
        message: 'Job skill requirement removed successfully'
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to remove job skill', 500, 'JOB_SKILL_REMOVE_ERROR');
    }
  }
);

/**
 * GET /jobs/skills/:skillId
 * Get jobs that require a specific skill
 */
jobs.get('/skills/:skillId',
  validate({
    params: z.object({ skillId: commonSchemas.uuid }),
    query: z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0)
    })
  }),
  async (c) => {
    try {
      const { skillId } = c.get('validatedParams');
      const { limit, offset } = c.get('validatedQuery');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const jobService = new JobRequirementsService(db);

      const jobs = await jobService.getJobsBySkill(skillId, limit, offset);

      return c.json({
        success: true,
        data: jobs,
        pagination: {
          limit,
          offset,
          total: jobs.length
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to get jobs by skill', 500, 'JOBS_BY_SKILL_ERROR');
    }
  }
);

export default jobs;