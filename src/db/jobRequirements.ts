import { eq, and, like, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Database } from '../config/database';
import { jobs, jobSkills, skills } from './schema';
import { logger } from '../utils/logger';

// Zod schemas for validation
export const skillImportanceEnum = z.enum(['critical', 'important', 'nice-to-have']);
export const skillLevelEnum = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

export const jobSkillRequirementSchema = z.object({
  skillId: z.string().uuid(),
  skillName: z.string().min(1).max(100).optional(), // For display purposes
  importance: skillImportanceEnum,
  minimumLevel: skillLevelEnum,
  yearsRequired: z.number().min(0).max(50).optional(),
});

export const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  currency: z.string().length(3).default('USD'),
  requiredSkills: z.array(jobSkillRequirementSchema).min(1),
});

export const updateJobSchema = createJobSchema.partial().omit({ requiredSkills: true }).extend({
  requiredSkills: z.array(jobSkillRequirementSchema).optional(),
});

export const jobSearchSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  skillNames: z.array(z.string()).optional(),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobSkillRequirement = z.infer<typeof jobSkillRequirementSchema>;
export type JobSearchInput = z.infer<typeof jobSearchSchema>;

// Job Requirements CRUD Operations
export class JobRequirementsService {
  constructor(private db: Database) {}

  async createJob(input: CreateJobInput) {
    try {
      // Validate input
      const validatedInput = createJobSchema.parse(input);
      
      const jobId = uuidv4();
      const now = new Date().toISOString();

      // Start transaction
      const result = await this.db.transaction(async (tx) => {
        // Create job
        const [job] = await tx.insert(jobs).values({
          id: jobId,
          title: validatedInput.title,
          company: validatedInput.company,
          industry: validatedInput.industry,
          location: validatedInput.location,
          description: validatedInput.description,
          salaryMin: validatedInput.salaryMin,
          salaryMax: validatedInput.salaryMax,
          currency: validatedInput.currency,
          createdAt: now,
          updatedAt: now,
        }).returning();

        // Create job skill requirements
        const skillsToInsert = validatedInput.requiredSkills.map(skill => ({
          id: uuidv4(),
          jobId: jobId,
          skillId: skill.skillId,
          importance: skill.importance,
          minimumLevel: skill.minimumLevel,
          yearsRequired: skill.yearsRequired,
          createdAt: now,
          updatedAt: now,
        }));

        await tx.insert(jobSkills).values(skillsToInsert);

        return job;
      });

      logger.info(`Job created successfully: ${jobId}`);
      return result;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  async getJob(jobId: string) {
    try {
      const job = await this.db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

      if (job.length === 0) {
        return null;
      }

      // Get job skill requirements with skill details
      const jobSkillsData = await this.db
        .select({
          id: jobSkills.id,
          skillId: jobSkills.skillId,
          skillName: skills.name,
          skillCategory: skills.category,
          importance: jobSkills.importance,
          minimumLevel: jobSkills.minimumLevel,
          yearsRequired: jobSkills.yearsRequired,
        })
        .from(jobSkills)
        .innerJoin(skills, eq(jobSkills.skillId, skills.id))
        .where(eq(jobSkills.jobId, jobId));

      const jobWithSkills = {
        ...job[0],
        requiredSkills: jobSkillsData,
      };

      return jobWithSkills;
    } catch (error) {
      logger.error('Error fetching job:', error);
      throw error;
    }
  }

  async updateJob(jobId: string, input: UpdateJobInput) {
    try {
      // Validate input
      const validatedInput = updateJobSchema.parse(input);
      
      const now = new Date().toISOString();

      const result = await this.db.transaction(async (tx) => {
        // Update job
        const [updatedJob] = await tx
          .update(jobs)
          .set({
            ...validatedInput,
            updatedAt: now,
          })
          .where(eq(jobs.id, jobId))
          .returning();

        if (!updatedJob) {
          throw new Error('Job not found');
        }

        // Update skills if provided
        if (validatedInput.requiredSkills) {
          // Delete existing job skills
          await tx.delete(jobSkills).where(eq(jobSkills.jobId, jobId));

          // Insert new skills
          if (validatedInput.requiredSkills.length > 0) {
            const skillsToInsert = validatedInput.requiredSkills.map(skill => ({
              id: uuidv4(),
              jobId: jobId,
              skillId: skill.skillId,
              importance: skill.importance,
              minimumLevel: skill.minimumLevel,
              yearsRequired: skill.yearsRequired,
              createdAt: now,
              updatedAt: now,
            }));

            await tx.insert(jobSkills).values(skillsToInsert);
          }
        }

        return updatedJob;
      });

      logger.info(`Job updated successfully: ${jobId}`);
      return result;
    } catch (error) {
      logger.error('Error updating job:', error);
      throw error;
    }
  }

  async deleteJob(jobId: string) {
    try {
      const result = await this.db.transaction(async (tx) => {
        // Delete job skills (cascade will handle this, but being explicit)
        await tx.delete(jobSkills).where(eq(jobSkills.jobId, jobId));

        // Delete job
        const [deletedJob] = await tx
          .delete(jobs)
          .where(eq(jobs.id, jobId))
          .returning();

        if (!deletedJob) {
          throw new Error('Job not found');
        }

        return deletedJob;
      });

      logger.info(`Job deleted successfully: ${jobId}`);
      return result;
    } catch (error) {
      logger.error('Error deleting job:', error);
      throw error;
    }
  }

  async searchJobs(searchInput: JobSearchInput) {
    try {
      // Validate input
      const validatedInput = jobSearchSchema.parse(searchInput);
      
      // Build base query
      let jobsResult;
      
      if (validatedInput.title || validatedInput.company || validatedInput.industry || validatedInput.location) {
        // Build conditions array
        const conditions = [];
        
        if (validatedInput.title) {
          conditions.push(like(jobs.title, `%${validatedInput.title}%`));
        }
        
        if (validatedInput.company) {
          conditions.push(like(jobs.company, `%${validatedInput.company}%`));
        }
        
        if (validatedInput.industry) {
          conditions.push(eq(jobs.industry, validatedInput.industry));
        }
        
        if (validatedInput.location) {
          conditions.push(like(jobs.location, `%${validatedInput.location}%`));
        }

        // Execute query with conditions
        jobsResult = await this.db
          .select()
          .from(jobs)
          .where(and(...conditions))
          .orderBy(desc(jobs.createdAt))
          .limit(validatedInput.limit)
          .offset(validatedInput.offset);
      } else {
        // No filters, get all jobs
        jobsResult = await this.db
          .select()
          .from(jobs)
          .orderBy(desc(jobs.createdAt))
          .limit(validatedInput.limit)
          .offset(validatedInput.offset);
      }

      // If skill filtering is requested, filter by skills
      if (validatedInput.skillNames && validatedInput.skillNames.length > 0) {
        const jobsWithSkills = [];
        
        for (const job of jobsResult) {
          const jobSkillsData = await this.db
            .select({
              skillName: skills.name,
            })
            .from(jobSkills)
            .innerJoin(skills, eq(jobSkills.skillId, skills.id))
            .where(eq(jobSkills.jobId, job.id));

          const jobSkillNames = jobSkillsData.map(skill => skill.skillName.toLowerCase());
          const hasMatchingSkill = validatedInput.skillNames.some(skillName => 
            jobSkillNames.includes(skillName.toLowerCase())
          );

          if (hasMatchingSkill) {
            jobsWithSkills.push(job);
          }
        }
        
        return jobsWithSkills;
      }

      return jobsResult;
    } catch (error) {
      logger.error('Error searching jobs:', error);
      throw error;
    }
  }

  async addJobSkill(jobId: string, skillRequirement: JobSkillRequirement) {
    try {
      // Validate input
      const validatedSkill = jobSkillRequirementSchema.parse(skillRequirement);
      
      const now = new Date().toISOString();

      // Check if job exists
      const job = await this.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

      if (job.length === 0) {
        throw new Error('Job not found');
      }

      // Check if skill already exists for job
      const existingSkill = await this.db
        .select()
        .from(jobSkills)
        .where(
          and(
            eq(jobSkills.jobId, jobId),
            eq(jobSkills.skillId, validatedSkill.skillId)
          )
        )
        .limit(1);

      if (existingSkill.length > 0) {
        throw new Error('Skill requirement already exists for this job');
      }

      const [newSkill] = await this.db.insert(jobSkills).values({
        id: uuidv4(),
        jobId: jobId,
        skillId: validatedSkill.skillId,
        importance: validatedSkill.importance,
        minimumLevel: validatedSkill.minimumLevel,
        yearsRequired: validatedSkill.yearsRequired,
        createdAt: now,
        updatedAt: now,
      }).returning();

      logger.info(`Skill requirement added to job: ${jobId}`);
      return newSkill;
    } catch (error) {
      logger.error('Error adding job skill requirement:', error);
      throw error;
    }
  }

  async updateJobSkill(jobId: string, skillId: string, skillRequirement: Partial<JobSkillRequirement>) {
    try {
      const now = new Date().toISOString();

      const updateData: any = {
        updatedAt: now,
      };

      if (skillRequirement.importance) updateData.importance = skillRequirement.importance;
      if (skillRequirement.minimumLevel) updateData.minimumLevel = skillRequirement.minimumLevel;
      if (skillRequirement.yearsRequired !== undefined) updateData.yearsRequired = skillRequirement.yearsRequired;

      const [updatedSkill] = await this.db
        .update(jobSkills)
        .set(updateData)
        .where(
          and(
            eq(jobSkills.jobId, jobId),
            eq(jobSkills.skillId, skillId)
          )
        )
        .returning();

      if (!updatedSkill) {
        throw new Error('Job skill requirement not found');
      }

      logger.info(`Job skill requirement updated: ${jobId} - ${skillId}`);
      return updatedSkill;
    } catch (error) {
      logger.error('Error updating job skill requirement:', error);
      throw error;
    }
  }

  async removeJobSkill(jobId: string, skillId: string) {
    try {
      const [deletedSkill] = await this.db
        .delete(jobSkills)
        .where(
          and(
            eq(jobSkills.jobId, jobId),
            eq(jobSkills.skillId, skillId)
          )
        )
        .returning();

      if (!deletedSkill) {
        throw new Error('Job skill requirement not found');
      }

      logger.info(`Job skill requirement removed: ${jobId} - ${skillId}`);
      return deletedSkill;
    } catch (error) {
      logger.error('Error removing job skill requirement:', error);
      throw error;
    }
  }

  async getJobSkills(jobId: string) {
    try {
      // Check if job exists
      const job = await this.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

      if (job.length === 0) {
        throw new Error('Job not found');
      }

      const jobSkillsData = await this.db
        .select({
          id: jobSkills.id,
          skillId: jobSkills.skillId,
          skillName: skills.name,
          skillCategory: skills.category,
          importance: jobSkills.importance,
          minimumLevel: jobSkills.minimumLevel,
          yearsRequired: jobSkills.yearsRequired,
        })
        .from(jobSkills)
        .innerJoin(skills, eq(jobSkills.skillId, skills.id))
        .where(eq(jobSkills.jobId, jobId));

      return jobSkillsData;
    } catch (error) {
      logger.error('Error fetching job skills:', error);
      throw error;
    }
  }

  async getJobsBySkill(skillId: string, limit: number = 20, offset: number = 0) {
    try {
      const jobsData = await this.db
        .select({
          id: jobs.id,
          title: jobs.title,
          company: jobs.company,
          industry: jobs.industry,
          location: jobs.location,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          currency: jobs.currency,
          importance: jobSkills.importance,
          minimumLevel: jobSkills.minimumLevel,
          yearsRequired: jobSkills.yearsRequired,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .innerJoin(jobSkills, eq(jobs.id, jobSkills.jobId))
        .where(eq(jobSkills.skillId, skillId))
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset);

      return jobsData;
    } catch (error) {
      logger.error('Error fetching jobs by skill:', error);
      throw error;
    }
  }

  async getSkillDemandAnalytics(skillId?: string, industry?: string, location?: string) {
    try {
      // Build conditions
      const conditions = [];
      
      if (skillId) {
        conditions.push(eq(jobSkills.skillId, skillId));
      }
      
      if (industry) {
        conditions.push(eq(jobs.industry, industry));
      }
      
      if (location) {
        conditions.push(like(jobs.location, `%${location}%`));
      }

      // Execute query with basic aggregation
      let analytics;
      
      if (conditions.length > 0) {
        analytics = await this.db
          .select({
            skillId: jobSkills.skillId,
            skillName: skills.name,
            skillCategory: skills.category,
          })
          .from(jobSkills)
          .innerJoin(skills, eq(jobSkills.skillId, skills.id))
          .innerJoin(jobs, eq(jobSkills.jobId, jobs.id))
          .where(and(...conditions))
          .groupBy(jobSkills.skillId, skills.name, skills.category);
      } else {
        analytics = await this.db
          .select({
            skillId: jobSkills.skillId,
            skillName: skills.name,
            skillCategory: skills.category,
          })
          .from(jobSkills)
          .innerJoin(skills, eq(jobSkills.skillId, skills.id))
          .innerJoin(jobs, eq(jobSkills.jobId, jobs.id))
          .groupBy(jobSkills.skillId, skills.name, skills.category);
      }

      return analytics;
    } catch (error) {
      logger.error('Error fetching skill demand analytics:', error);
      throw error;
    }
  }
}