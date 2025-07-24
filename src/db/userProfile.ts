import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Database } from '../config/database';
import { userProfiles, userSkills, skills } from './schema';
import { logger } from '../utils/logger';
import { QueryOptimizationService } from '../services/queryOptimization';
import { CacheInvalidationService } from '../services/cacheInvalidation';
import { Env } from '../index';

// Zod schemas for validation
export const skillLevelEnum = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
export const learningStyleEnum = z.enum(['visual', 'auditory', 'kinesthetic']);

export const userSkillSchema = z.object({
  skillId: z.string().uuid(),
  level: skillLevelEnum,
  yearsExperience: z.number().min(0).max(50).optional(),
  lastUsed: z.string().datetime().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  certifications: z.array(z.string()).optional().default([]),
});

export const createUserProfileSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  experience: z.number().min(0).max(50).optional(),
  learningStyle: learningStyleEnum.optional(),
  timeCommitment: z.number().min(1).max(168).optional(), // hours per week
  budgetRange: z.string().max(50).optional(),
  skills: z.array(userSkillSchema).default([]),
});

export const updateUserProfileSchema = createUserProfileSchema.partial().omit({ userId: true });

export type CreateUserProfileInput = z.infer<typeof createUserProfileSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type UserSkillInput = z.infer<typeof userSkillSchema>;

// User Profile CRUD Operations
export class UserProfileService {
  private queryOptimizer?: QueryOptimizationService;
  private cacheInvalidation?: CacheInvalidationService;

  constructor(private db: Database, private env?: Env) {
    if (env) {
      this.queryOptimizer = new QueryOptimizationService(db, env);
      this.cacheInvalidation = new CacheInvalidationService(env);
    }
  }

  async createUserProfile(input: CreateUserProfileInput) {
    try {
      // Validate input
      const validatedInput = createUserProfileSchema.parse(input);
      
      const profileId = uuidv4();
      const now = new Date().toISOString();

      // Start transaction
      const result = await this.db.transaction(async (tx) => {
        // Create user profile
        const [profile] = await tx.insert(userProfiles).values({
          id: profileId,
          userId: validatedInput.userId,
          title: validatedInput.title,
          industry: validatedInput.industry,
          location: validatedInput.location,
          experience: validatedInput.experience,
          learningStyle: validatedInput.learningStyle,
          timeCommitment: validatedInput.timeCommitment,
          budgetRange: validatedInput.budgetRange,
          createdAt: now,
          updatedAt: now,
        }).returning();

        // Create user skills if provided
        if (validatedInput.skills && validatedInput.skills.length > 0) {
          const skillsToInsert = validatedInput.skills.map(skill => ({
            id: uuidv4(),
            userId: profileId,
            skillId: skill.skillId,
            level: skill.level,
            yearsExperience: skill.yearsExperience,
            lastUsed: skill.lastUsed,
            confidenceScore: skill.confidenceScore,
            certifications: JSON.stringify(skill.certifications || []),
            createdAt: now,
            updatedAt: now,
          }));

          await tx.insert(userSkills).values(skillsToInsert);
        }

        return profile;
      });

      logger.info(`User profile created successfully: ${profileId}`);
      return result;
    } catch (error) {
      logger.error('Error creating user profile:', error);
      throw error;
    }
  }

  async getUserProfile(userId: string) {
    try {
      // Use optimized query if available
      if (this.queryOptimizer) {
        return await this.queryOptimizer.getUserProfileOptimized(userId);
      }

      // Fallback to original implementation
      const profile = await this.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        return null;
      }

      // Get user skills with skill details
      const userSkillsData = await this.db
        .select({
          id: userSkills.id,
          skillId: userSkills.skillId,
          skillName: skills.name,
          skillCategory: skills.category,
          level: userSkills.level,
          yearsExperience: userSkills.yearsExperience,
          lastUsed: userSkills.lastUsed,
          confidenceScore: userSkills.confidenceScore,
          certifications: userSkills.certifications,
        })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(eq(userSkills.userId, profile[0].id));

      const profileWithSkills = {
        ...profile[0],
        skills: userSkillsData.map(skill => ({
          ...skill,
          certifications: skill.certifications ? JSON.parse(skill.certifications) : [],
        })),
      };

      return profileWithSkills;
    } catch (error) {
      logger.error('Error fetching user profile:', error);
      throw error;
    }
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput) {
    try {
      // Validate input
      const validatedInput = updateUserProfileSchema.parse(input);
      
      const now = new Date().toISOString();

      const result = await this.db.transaction(async (tx) => {
        // Update user profile
        const [updatedProfile] = await tx
          .update(userProfiles)
          .set({
            ...validatedInput,
            updatedAt: now,
          })
          .where(eq(userProfiles.userId, userId))
          .returning();

        if (!updatedProfile) {
          throw new Error('User profile not found');
        }

        // Update skills if provided
        if (validatedInput.skills) {
          // Delete existing skills
          await tx.delete(userSkills).where(eq(userSkills.userId, updatedProfile.id));

          // Insert new skills
          if (validatedInput.skills.length > 0) {
            const skillsToInsert = validatedInput.skills.map(skill => ({
              id: uuidv4(),
              userId: updatedProfile.id,
              skillId: skill.skillId,
              level: skill.level,
              yearsExperience: skill.yearsExperience,
              lastUsed: skill.lastUsed,
              confidenceScore: skill.confidenceScore,
              certifications: JSON.stringify(skill.certifications || []),
              createdAt: now,
              updatedAt: now,
            }));

            await tx.insert(userSkills).values(skillsToInsert);
          }
        }

        return updatedProfile;
      });

      // Invalidate related caches
      if (this.cacheInvalidation) {
        await this.cacheInvalidation.triggerDataChange('user_profile', 'update', userId);
      }

      logger.info(`User profile updated successfully: ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  async deleteUserProfile(userId: string) {
    try {
      const result = await this.db.transaction(async (tx) => {
        // Get profile ID first
        const profile = await tx
          .select({ id: userProfiles.id })
          .from(userProfiles)
          .where(eq(userProfiles.userId, userId))
          .limit(1);

        if (profile.length === 0) {
          throw new Error('User profile not found');
        }

        // Delete user skills (cascade will handle this, but being explicit)
        await tx.delete(userSkills).where(eq(userSkills.userId, profile[0].id));

        // Delete user profile
        const [deletedProfile] = await tx
          .delete(userProfiles)
          .where(eq(userProfiles.userId, userId))
          .returning();

        return deletedProfile;
      });

      logger.info(`User profile deleted successfully: ${userId}`);
      return result;
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      throw error;
    }
  }

  async addUserSkill(userId: string, skillInput: UserSkillInput) {
    try {
      // Validate input
      const validatedSkill = userSkillSchema.parse(skillInput);
      
      const now = new Date().toISOString();

      // Get user profile ID
      const profile = await this.db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        throw new Error('User profile not found');
      }

      // Check if skill already exists for user
      const existingSkill = await this.db
        .select()
        .from(userSkills)
        .where(
          and(
            eq(userSkills.userId, profile[0].id),
            eq(userSkills.skillId, validatedSkill.skillId)
          )
        )
        .limit(1);

      if (existingSkill.length > 0) {
        throw new Error('Skill already exists for this user');
      }

      const [newSkill] = await this.db.insert(userSkills).values({
        id: uuidv4(),
        userId: profile[0].id,
        skillId: validatedSkill.skillId,
        level: validatedSkill.level,
        yearsExperience: validatedSkill.yearsExperience,
        lastUsed: validatedSkill.lastUsed,
        confidenceScore: validatedSkill.confidenceScore,
        certifications: JSON.stringify(validatedSkill.certifications || []),
        createdAt: now,
        updatedAt: now,
      }).returning();

      logger.info(`Skill added to user profile: ${userId}`);
      return newSkill;
    } catch (error) {
      logger.error('Error adding user skill:', error);
      throw error;
    }
  }

  async updateUserSkill(userId: string, skillId: string, skillInput: Partial<UserSkillInput>) {
    try {
      const now = new Date().toISOString();

      // Get user profile ID
      const profile = await this.db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        throw new Error('User profile not found');
      }

      const updateData: any = {
        updatedAt: now,
      };

      if (skillInput.level) updateData.level = skillInput.level;
      if (skillInput.yearsExperience !== undefined) updateData.yearsExperience = skillInput.yearsExperience;
      if (skillInput.lastUsed) updateData.lastUsed = skillInput.lastUsed;
      if (skillInput.confidenceScore !== undefined) updateData.confidenceScore = skillInput.confidenceScore;
      if (skillInput.certifications) updateData.certifications = JSON.stringify(skillInput.certifications);

      const [updatedSkill] = await this.db
        .update(userSkills)
        .set(updateData)
        .where(
          and(
            eq(userSkills.userId, profile[0].id),
            eq(userSkills.skillId, skillId)
          )
        )
        .returning();

      if (!updatedSkill) {
        throw new Error('User skill not found');
      }

      logger.info(`User skill updated: ${userId} - ${skillId}`);
      return updatedSkill;
    } catch (error) {
      logger.error('Error updating user skill:', error);
      throw error;
    }
  }

  async removeUserSkill(userId: string, skillId: string) {
    try {
      // Get user profile ID
      const profile = await this.db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        throw new Error('User profile not found');
      }

      const [deletedSkill] = await this.db
        .delete(userSkills)
        .where(
          and(
            eq(userSkills.userId, profile[0].id),
            eq(userSkills.skillId, skillId)
          )
        )
        .returning();

      if (!deletedSkill) {
        throw new Error('User skill not found');
      }

      logger.info(`User skill removed: ${userId} - ${skillId}`);
      return deletedSkill;
    } catch (error) {
      logger.error('Error removing user skill:', error);
      throw error;
    }
  }

  async getUserSkills(userId: string) {
    try {
      // Get user profile ID
      const profile = await this.db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        throw new Error('User profile not found');
      }

      const userSkillsData = await this.db
        .select({
          id: userSkills.id,
          skillId: userSkills.skillId,
          skillName: skills.name,
          skillCategory: skills.category,
          level: userSkills.level,
          yearsExperience: userSkills.yearsExperience,
          lastUsed: userSkills.lastUsed,
          confidenceScore: userSkills.confidenceScore,
          certifications: userSkills.certifications,
        })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(eq(userSkills.userId, profile[0].id));

      return userSkillsData.map(skill => ({
        ...skill,
        certifications: skill.certifications ? JSON.parse(skill.certifications) : [],
      }));
    } catch (error) {
      logger.error('Error fetching user skills:', error);
      throw error;
    }
  }
}