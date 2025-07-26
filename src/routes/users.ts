import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { validate, validateParams, validateQuery, commonSchemas } from '../middleware/inputValidation';
import { UserProfileService } from '../db/userProfile';
import { DatabaseManager } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const users = new Hono<{ Bindings: Env }>();

// Apply authentication to all user routes
users.use('*', requireAuth);

// Validation schemas
const skillLevelEnum = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
const learningStyleEnum = z.enum(['visual', 'auditory', 'kinesthetic']);

const userSkillSchema = z.object({
  skillId: commonSchemas.uuid,
  level: skillLevelEnum,
  yearsExperience: z.number().min(0).max(50).optional(),
  lastUsed: z.string().datetime().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  certifications: z.array(z.string().max(255)).optional().default([])
});

const createUserProfileSchema = z.object({
  title: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  experience: z.number().min(0).max(50).optional(),
  learningStyle: learningStyleEnum.optional(),
  timeCommitment: z.number().min(1).max(168).optional(),
  budgetRange: z.string().max(50).optional(),
  skills: z.array(userSkillSchema).default([])
});

const updateUserProfileSchema = createUserProfileSchema.partial();

const userParamsSchema = z.object({
  userId: commonSchemas.uuid
});

const skillParamsSchema = z.object({
  userId: commonSchemas.uuid,
  skillId: commonSchemas.uuid
});

/**
 * POST /users/profile
 * Create user profile
 */
users.post('/profile',
  validate({
    body: createUserProfileSchema
  }, { sanitize: true }),
  async (c) => {
    try {
      const user = c.get('user');
      const profileData = c.get('validatedBody');
      
      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      const profile = await profileService.createUserProfile({
        ...profileData,
        userId: user.id
      });

      return c.json({
        success: true,
        data: profile
      }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to create user profile', 500, 'PROFILE_CREATION_ERROR');
    }
  }
);

/**
 * GET /users/:userId/profile
 * Get user profile
 */
users.get('/:userId/profile',
  validateParams(userParamsSchema),
  async (c) => {
    try {
      const { userId } = c.get('validatedParams');
      const currentUser = c.get('user');

      // Users can only access their own profile unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      const profile = await profileService.getUserProfile(userId);
      
      if (!profile) {
        throw new AppError('User profile not found', 404, 'PROFILE_NOT_FOUND');
      }

      return c.json({
        success: true,
        data: profile
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to get user profile', 500, 'PROFILE_FETCH_ERROR');
    }
  }
);

/**
 * PUT /users/:userId/profile
 * Update user profile
 */
users.put('/:userId/profile',
  validate({
    params: userParamsSchema,
    body: updateUserProfileSchema
  }, { sanitize: true }),
  async (c) => {
    try {
      const { userId } = c.get('validatedParams');
      const profileData = c.get('validatedBody');
      const currentUser = c.get('user');

      // Users can only update their own profile unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      const profile = await profileService.updateUserProfile(userId, profileData);

      return c.json({
        success: true,
        data: profile
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to update user profile', 500, 'PROFILE_UPDATE_ERROR');
    }
  }
);

/**
 * DELETE /users/:userId/profile
 * Delete user profile
 */
users.delete('/:userId/profile',
  validateParams(userParamsSchema),
  async (c) => {
    try {
      const { userId } = c.get('validatedParams');
      const currentUser = c.get('user');

      // Users can only delete their own profile unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      await profileService.deleteUserProfile(userId);

      return c.json({
        success: true,
        message: 'User profile deleted successfully'
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to delete user profile', 500, 'PROFILE_DELETE_ERROR');
    }
  }
);

/**
 * POST /users/:userId/skills
 * Add skill to user profile
 */
users.post('/:userId/skills',
  validate({
    params: userParamsSchema,
    body: userSkillSchema
  }, { sanitize: true }),
  async (c) => {
    try {
      const { userId } = c.get('validatedParams');
      const skillData = c.get('validatedBody');
      const currentUser = c.get('user');

      // Users can only modify their own skills unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      const skill = await profileService.addUserSkill(userId, skillData);

      return c.json({
        success: true,
        data: skill
      }, 201);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to add user skill', 500, 'SKILL_ADD_ERROR');
    }
  }
);

/**
 * GET /users/:userId/skills
 * Get user skills
 */
users.get('/:userId/skills',
  validateParams(userParamsSchema),
  async (c) => {
    try {
      const { userId } = c.get('validatedParams');
      const currentUser = c.get('user');

      // Users can only access their own skills unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      const skills = await profileService.getUserSkills(userId);

      return c.json({
        success: true,
        data: skills
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to get user skills', 500, 'SKILLS_FETCH_ERROR');
    }
  }
);

/**
 * PUT /users/:userId/skills/:skillId
 * Update user skill
 */
users.put('/:userId/skills/:skillId',
  validate({
    params: skillParamsSchema,
    body: userSkillSchema.partial()
  }, { sanitize: true }),
  async (c) => {
    try {
      const { userId, skillId } = c.get('validatedParams');
      const skillData = c.get('validatedBody');
      const currentUser = c.get('user');

      // Users can only modify their own skills unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      const skill = await profileService.updateUserSkill(userId, skillId, skillData);

      return c.json({
        success: true,
        data: skill
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to update user skill', 500, 'SKILL_UPDATE_ERROR');
    }
  }
);

/**
 * DELETE /users/:userId/skills/:skillId
 * Remove skill from user profile
 */
users.delete('/:userId/skills/:skillId',
  validateParams(skillParamsSchema),
  async (c) => {
    try {
      const { userId, skillId } = c.get('validatedParams');
      const currentUser = c.get('user');

      // Users can only modify their own skills unless they're admin
      if (userId !== currentUser.id && currentUser.role !== 'admin') {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }

      const db = DatabaseManager.initialize(c.env.DB);
      const profileService = new UserProfileService(db, c.env);

      await profileService.removeUserSkill(userId, skillId);

      return c.json({
        success: true,
        message: 'User skill removed successfully'
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to remove user skill', 500, 'SKILL_REMOVE_ERROR');
    }
  }
);

export default users;