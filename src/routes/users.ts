import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { AuthenticatedContext, requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createDatabase } from '../config/database';
import { users, userProfiles, userSkills, skills } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';

const usersRouter = new Hono<{ Bindings: Env }>();

// Note: Authentication is already applied globally in index.ts for /api/v1/* routes
// We just need to ensure the user context is available

// Validation schemas
const userProfileSchema = z.object({
  title: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  experience: z.number().min(0).max(50).optional(),
  learning_style: z.enum(['visual', 'auditory', 'kinesthetic']).optional(),
  time_commitment: z.number().min(1).max(168).optional(), // hours per week
  budget_range: z.string().max(50).optional(),
});

const userSkillSchema = z.object({
  skill_name: z.string().min(1).max(100),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  years_experience: z.number().min(0).max(50).optional(),
  last_used: z.string().datetime().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  certifications: z.array(z.string()).optional(),
});

const updateSkillsSchema = z.object({
  skills: z.array(userSkillSchema).min(1),
});

/**
 * GET /users/profile - Get current user's profile
 */
usersRouter.get('/profile', async (c: AuthenticatedContext) => {
  try {
    // Validate environment
    if (!c.env?.DB) {
      logger.error('Database connection not available');
      throw new AppError('Database connection not available', 500, 'DATABASE_UNAVAILABLE');
    }

    if (!c.user?.id) {
      logger.error('User not authenticated');
      throw new AppError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
    }

    const database = createDatabase(c.env.DB);
    const userId = c.user.id;

    logger.info(`Getting profile for user: ${userId}`);

    // Get user profile
    const profile = await database
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    logger.info(`Found ${profile.length} profile(s) for user: ${userId}`);

    // Get user skills with skill details
    const userSkillsData = await database
      .select({
        id: userSkills.id,
        skillName: skills.name,
        skillCategory: skills.category,
        level: userSkills.level,
        yearsExperience: userSkills.yearsExperience,
        lastUsed: userSkills.lastUsed,
        confidenceScore: userSkills.confidenceScore,
        certifications: userSkills.certifications,
        createdAt: userSkills.createdAt,
        updatedAt: userSkills.updatedAt,
      })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(eq(userSkills.userId, profile[0]?.id || ''))
      .orderBy(skills.name);

    logger.info(`Found ${userSkillsData.length} skills for user: ${userId}`);

    const profileData = profile[0];
    
    return c.json({
      profile: profileData ? {
        id: profileData.id,
        title: profileData.title,
        industry: profileData.industry,
        location: profileData.location,
        experience: profileData.experience,
        learning_style: profileData.learningStyle,
        time_commitment: profileData.timeCommitment,
        budget_range: profileData.budgetRange,
        created_at: profileData.createdAt,
        updated_at: profileData.updatedAt,
      } : null,
      skills: userSkillsData.map(skill => ({
        id: skill.id,
        skill_name: skill.skillName,
        category: skill.skillCategory,
        level: skill.level,
        years_experience: skill.yearsExperience,
        last_used: skill.lastUsed,
        confidence_score: skill.confidenceScore,
        certifications: skill.certifications ? JSON.parse(skill.certifications) : [],
        created_at: skill.createdAt,
        updated_at: skill.updatedAt,
      })),
      user: {
        id: c.user.id,
        email: c.user.email,
      },
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to retrieve user profile', 500, 'PROFILE_RETRIEVAL_FAILED');
  }
});

/**
 * POST /users/profile - Create or update user profile
 */
usersRouter.post('/profile', async (c: AuthenticatedContext) => {
  try {
    // Validate environment
    if (!c.env?.DB) {
      logger.error('Database connection not available');
      throw new AppError('Database connection not available', 500, 'DATABASE_UNAVAILABLE');
    }

    if (!c.user?.id) {
      logger.error('User not authenticated');
      throw new AppError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
    }

    const body = await c.req.json();
    const validatedData = userProfileSchema.parse(body);
    const database = createDatabase(c.env.DB);
    const userId = c.user.id;

    logger.info(`Creating/updating profile for user: ${userId}`);

    // Check if profile exists
    const existingProfile = await database
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    logger.info(`Found ${existingProfile.length} existing profile(s) for user: ${userId}`);

    const profileData = {
      userId,
      title: validatedData.title,
      industry: validatedData.industry,
      location: validatedData.location,
      experience: validatedData.experience,
      learningStyle: validatedData.learning_style,
      timeCommitment: validatedData.time_commitment,
      budgetRange: validatedData.budget_range,
      updatedAt: new Date().toISOString(),
    };

    let profile;
    if (existingProfile.length > 0) {
      // Update existing profile
      logger.info(`Updating existing profile for user: ${userId}`);
      profile = await database
        .update(userProfiles)
        .set(profileData)
        .where(eq(userProfiles.userId, userId))
        .returning();
    } else {
      // Create new profile
      logger.info(`Creating new profile for user: ${userId}`);
      profile = await database
        .insert(userProfiles)
        .values({
          id: crypto.randomUUID(),
          ...profileData,
          createdAt: new Date().toISOString(),
        })
        .returning();
    }

    logger.info(`Profile operation successful for user: ${userId}`);

    return c.json({
      profile: {
        id: profile[0].id,
        title: profile[0].title,
        industry: profile[0].industry,
        location: profile[0].location,
        experience: profile[0].experience,
        learning_style: profile[0].learningStyle,
        time_commitment: profile[0].timeCommitment,
        budget_range: profile[0].budgetRange,
        created_at: profile[0].createdAt,
        updated_at: profile[0].updatedAt,
      },
      message: existingProfile.length > 0 ? 'Profile updated successfully' : 'Profile created successfully',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Validation error:', error.errors);
      throw new AppError('Invalid profile data', 400, 'VALIDATION_ERROR');
    }
    
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Update profile error:', error);
    throw new AppError('Failed to update user profile', 500, 'PROFILE_UPDATE_FAILED');
  }
});

/**
 * PUT /users/profile/skills - Update user skills
 */
usersRouter.put('/profile/skills', async (c: AuthenticatedContext) => {
  try {
    // Validate environment
    if (!c.env?.DB) {
      logger.error('Database connection not available');
      throw new AppError('Database connection not available', 500, 'DATABASE_UNAVAILABLE');
    }

    if (!c.user?.id) {
      logger.error('User not authenticated');
      throw new AppError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
    }

    const body = await c.req.json();
    const validatedData = updateSkillsSchema.parse(body);
    const database = createDatabase(c.env.DB);
    const userId = c.user.id;

    logger.info(`Updating skills for user: ${userId}`);

    // Get user profile
    const profile = await database
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      logger.error(`User profile not found for user: ${userId}`);
      throw new AppError('User profile not found. Please create a profile first.', 404, 'PROFILE_NOT_FOUND');
    }

    const profileId = profile[0].id;
    logger.info(`Found profile ${profileId} for user: ${userId}`);

    // Process each skill
    const updatedSkills = [];
    
    for (const skillData of validatedData.skills) {
      logger.info(`Processing skill: ${skillData.skill_name}`);
      
      // Find or create skill in skills table
      let skill = await database
        .select()
        .from(skills)
        .where(eq(skills.name, skillData.skill_name))
        .limit(1);

      if (skill.length === 0) {
        // Create new skill
        logger.info(`Creating new skill: ${skillData.skill_name}`);
        skill = await database
          .insert(skills)
          .values({
            id: crypto.randomUUID(),
            name: skillData.skill_name,
            category: 'General', // Default category
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .returning();
      }

      const skillId = skill[0].id;

      // Check if user already has this skill
      const existingUserSkill = await database
        .select()
        .from(userSkills)
        .where(and(
          eq(userSkills.userId, profileId),
          eq(userSkills.skillId, skillId)
        ))
        .limit(1);

      const userSkillData = {
        userId: profileId,
        skillId,
        level: skillData.level,
        yearsExperience: skillData.years_experience,
        lastUsed: skillData.last_used || new Date().toISOString(),
        confidenceScore: skillData.confidence_score || 0.8,
        certifications: JSON.stringify(skillData.certifications || []),
        updatedAt: new Date().toISOString(),
      };

      let userSkill;
      if (existingUserSkill.length > 0) {
        // Update existing skill
        logger.info(`Updating existing user skill: ${skillData.skill_name}`);
        userSkill = await database
          .update(userSkills)
          .set(userSkillData)
          .where(eq(userSkills.id, existingUserSkill[0].id))
          .returning();
      } else {
        // Create new user skill
        logger.info(`Creating new user skill: ${skillData.skill_name}`);
        userSkill = await database
          .insert(userSkills)
          .values({
            id: crypto.randomUUID(),
            ...userSkillData,
            createdAt: new Date().toISOString(),
          })
          .returning();
      }

      updatedSkills.push({
        id: userSkill[0].id,
        skill_name: skillData.skill_name,
        level: userSkill[0].level,
        years_experience: userSkill[0].yearsExperience,
        last_used: userSkill[0].lastUsed,
        confidence_score: userSkill[0].confidenceScore,
        certifications: JSON.parse(userSkill[0].certifications || '[]'),
        created_at: userSkill[0].createdAt,
        updated_at: userSkill[0].updatedAt,
      });
    }

    logger.info(`Successfully updated ${updatedSkills.length} skills for user: ${userId}`);

    return c.json({
      skills: updatedSkills,
      message: 'Skills updated successfully',
      updated_count: updatedSkills.length,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Skills validation error:', error.errors);
      throw new AppError('Invalid skills data', 400, 'VALIDATION_ERROR');
    }
    
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Update skills error:', error);
    throw new AppError('Failed to update user skills', 500, 'SKILLS_UPDATE_FAILED');
  }
});

/**
 * GET /users/profile/skills/history - Get user's skill progression history
 */
usersRouter.get('/profile/skills/history', async (c: AuthenticatedContext) => {
  try {
    // Validate environment
    if (!c.env?.DB) {
      logger.error('Database connection not available');
      throw new AppError('Database connection not available', 500, 'DATABASE_UNAVAILABLE');
    }

    if (!c.user?.id) {
      logger.error('User not authenticated');
      throw new AppError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
    }

    const database = createDatabase(c.env.DB);
    const userId = c.user.id;
    
    const skillName = c.req.query('skill');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

    logger.info(`Getting skill history for user: ${userId}, skill: ${skillName || 'all'}, limit: ${limit}`);

    // Get user profile
    const profile = await database
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      logger.error(`User profile not found for user: ${userId}`);
      throw new AppError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Build query for skill history
    let query = database
      .select({
        id: userSkills.id,
        skillName: skills.name,
        skillCategory: skills.category,
        level: userSkills.level,
        yearsExperience: userSkills.yearsExperience,
        lastUsed: userSkills.lastUsed,
        confidenceScore: userSkills.confidenceScore,
        certifications: userSkills.certifications,
        createdAt: userSkills.createdAt,
        updatedAt: userSkills.updatedAt,
      })
      .from(userSkills)
      .innerJoin(skills, eq(userSkills.skillId, skills.id))
      .where(eq(userSkills.userId, profile[0].id))
      .orderBy(userSkills.updatedAt)
      .limit(limit);

    // Filter by skill name if provided
    if (skillName) {
      // Create a new query with additional filter
      query = database
        .select({
          id: userSkills.id,
          skillName: skills.name,
          skillCategory: skills.category,
          level: userSkills.level,
          yearsExperience: userSkills.yearsExperience,
          lastUsed: userSkills.lastUsed,
          confidenceScore: userSkills.confidenceScore,
          certifications: userSkills.certifications,
          createdAt: userSkills.createdAt,
          updatedAt: userSkills.updatedAt,
        })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(and(
          eq(userSkills.userId, profile[0].id),
          eq(skills.name, skillName)
        ))
        .orderBy(userSkills.updatedAt)
        .limit(limit);
    }

    const skillHistory = await query;

    logger.info(`Found ${skillHistory.length} skill history records for user: ${userId}`);

    return c.json({
      history: skillHistory.map(skill => ({
        id: skill.id,
        skill_name: skill.skillName,
        category: skill.skillCategory,
        level: skill.level,
        years_experience: skill.yearsExperience,
        last_used: skill.lastUsed,
        confidence_score: skill.confidenceScore,
        certifications: skill.certifications ? JSON.parse(skill.certifications) : [],
        created_at: skill.createdAt,
        updated_at: skill.updatedAt,
      })),
      total_records: skillHistory.length,
      filters: {
        skill_name: skillName || null,
        limit,
      },
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Get skill history error:', error);
    throw new AppError('Failed to retrieve skill history', 500, 'SKILL_HISTORY_RETRIEVAL_FAILED');
  }
});

/**
 * DELETE /users/profile/skills/:skillId - Remove a skill from user profile
 */
usersRouter.delete('/profile/skills/:skillId', async (c: AuthenticatedContext) => {
  try {
    // Validate environment
    if (!c.env?.DB) {
      logger.error('Database connection not available');
      throw new AppError('Database connection not available', 500, 'DATABASE_UNAVAILABLE');
    }

    if (!c.user?.id) {
      logger.error('User not authenticated');
      throw new AppError('User not authenticated', 401, 'USER_NOT_AUTHENTICATED');
    }

    const skillId = c.req.param('skillId');
    const database = createDatabase(c.env.DB);
    const userId = c.user.id;

    logger.info(`Deleting skill ${skillId} for user: ${userId}`);

    // Get user profile
    const profile = await database
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      logger.error(`User profile not found for user: ${userId}`);
      throw new AppError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Check if skill exists for this user
    const userSkill = await database
      .select()
      .from(userSkills)
      .where(and(
        eq(userSkills.id, skillId),
        eq(userSkills.userId, profile[0].id)
      ))
      .limit(1);

    if (userSkill.length === 0) {
      logger.error(`Skill ${skillId} not found for user: ${userId}`);
      throw new AppError('Skill not found in user profile', 404, 'SKILL_NOT_FOUND');
    }

    // Delete the skill
    await database
      .delete(userSkills)
      .where(eq(userSkills.id, skillId));

    logger.info(`Successfully deleted skill ${skillId} for user: ${userId}`);

    return c.json({
      message: 'Skill removed successfully',
      skill_id: skillId,
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Delete skill error:', error);
    throw new AppError('Failed to remove skill', 500, 'SKILL_DELETION_FAILED');
  }
});

export default usersRouter;