import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { 
  skillLevelEnum, 
  learningStyleEnum, 
  userSkillSchema, 
  createUserProfileSchema 
} from '../db/userProfile';

describe('UserProfile Validation Schemas', () => {
  it('should validate skill levels correctly', () => {
    const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
    
    validLevels.forEach(level => {
      const result = skillLevelEnum.safeParse(level);
      expect(result.success).toBe(true);
    });

    const invalidLevel = skillLevelEnum.safeParse('master');
    expect(invalidLevel.success).toBe(false);
  });

  it('should validate learning styles correctly', () => {
    const validStyles = ['visual', 'auditory', 'kinesthetic'];
    
    validStyles.forEach(style => {
      const result = learningStyleEnum.safeParse(style);
      expect(result.success).toBe(true);
    });

    const invalidStyle = learningStyleEnum.safeParse('tactile');
    expect(invalidStyle.success).toBe(false);
  });

  it('should validate user skill schema', () => {
    const validSkill = {
      skillId: uuidv4(),
      level: 'intermediate' as const,
      yearsExperience: 3,
      confidenceScore: 0.8,
    };

    const result = userSkillSchema.safeParse(validSkill);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.certifications).toEqual([]);
    }
  });

  it('should validate user profile schema', () => {
    const validProfile = {
      userId: uuidv4(),
      title: 'Software Engineer',
      industry: 'Technology',
      experience: 5,
      learningStyle: 'visual' as const,
    };

    const result = createUserProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
    }
  });

  it('should reject invalid UUID in user profile', () => {
    const invalidProfile = {
      userId: 'invalid-uuid',
      title: 'Software Engineer',
    };

    const result = createUserProfileSchema.safeParse(invalidProfile);
    expect(result.success).toBe(false);
  });

  it('should reject invalid skill level', () => {
    const invalidSkill = {
      skillId: uuidv4(),
      level: 'master', // Invalid level
    };

    const result = userSkillSchema.safeParse(invalidSkill);
    expect(result.success).toBe(false);
  });
});