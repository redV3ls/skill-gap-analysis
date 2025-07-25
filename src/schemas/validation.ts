import { z } from 'zod';
import { Context, Next } from 'hono';
import { Env } from '../index';
import { AppError } from '../middleware/errorHandler';

// Extend Hono's context to include validatedData
declare module 'hono' {
  interface ContextVariableMap {
    validatedData: any;
  }
}

// Common validation schemas
export const skillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

export const skillSchema = z.object({
  skill: z.string().min(1, 'Skill name is required').max(100, 'Skill name too long'),
  level: skillLevelSchema,
  years_experience: z.number().min(0).max(50).optional(),
  certifications: z.array(z.string()).optional().default([]),
});

export const userSkillsSchema = z.array(skillSchema).min(1, 'At least one skill is required');

export const jobRequirementSchema = z.object({
  title: z.string().min(1, 'Job title is required').max(200, 'Job title too long'),
  description: z.string().min(10, 'Job description too short').max(5000, 'Job description too long'),
  required_skills: z.array(z.string()).min(1, 'At least one required skill needed'),
  company: z.string().max(200, 'Company name too long').optional(),
  location: z.string().max(200, 'Location too long').optional(),
  salary_range: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    currency: z.string().length(3).optional(),
  }).optional(),
});

export const analysisOptionsSchema = z.object({
  include_recommendations: z.boolean().default(true),
  include_learning_paths: z.boolean().default(true),
  geographic_region: z.string().max(10, 'Region code too long').optional(),
  priority_skills: z.array(z.string()).optional(),
});

// Gap analysis request schema
export const gapAnalysisRequestSchema = z.object({
  user_skills: userSkillsSchema,
  target_job: jobRequirementSchema,
  analysis_options: analysisOptionsSchema.optional().default({}),
});

// Team analysis schemas
export const teamMemberSchema = z.object({
  id: z.string().min(1, 'Member ID is required'),
  name: z.string().min(1, 'Member name is required').max(200, 'Name too long').optional(),
  skills: userSkillsSchema,
  role: z.string().max(100, 'Role too long').optional(),
  department: z.string().max(100, 'Department too long').optional(),
  salary: z.number().min(0, 'Salary must be non-negative').optional(),
  hourly_rate: z.number().min(0, 'Hourly rate must be non-negative').optional(),
});

export const projectRequirementsSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Project name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  required_skills: z.array(z.string()).min(1, 'At least one required skill needed'),
  timeline: z.string().max(50, 'Timeline too long').optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  budget: z.number().min(0, 'Budget must be non-negative').optional(),
});

export const teamAnalysisRequestSchema = z.object({
  team_members: z.array(teamMemberSchema).min(1, 'At least one team member required'),
  project_requirements: projectRequirementsSchema,
  analysis_options: analysisOptionsSchema.optional().default({}),
});

// Authentication schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  organization: z.string().max(200, 'Organization name too long').optional(),
});

export const apiKeyRequestSchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  expires_at: z.string().datetime().optional(),
  permissions: z.array(z.enum(['read', 'write', 'admin'])).default(['read']),
});

// Extended context interface for validated requests
export interface ValidatedContext<T = any> extends Context<{ Bindings: Env }> {
  get(key: 'validatedData'): T;
}

// Validation middleware helper with proper typing
export const validateRequest = <T extends z.ZodSchema>(schema: T) => {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    try {
      const body = await c.req.json();
      const validatedData = schema.parse(body);
      
      // Attach validated data to context using Hono's set method
      c.set('validatedData', validatedData);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Create a detailed error response with validation details
        const validationDetails = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        // Create enhanced error with details
        const validationError = new AppError('Invalid request data', 400, 'VALIDATION_ERROR');
        
        // Attach validation details to the error
        (validationError as any).details = validationDetails;
        
        throw validationError;
      }
      
      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        throw new AppError('Invalid JSON format', 400, 'INVALID_JSON');
      }
      
      throw error;
    }
  };
};