import { describe, it, expect } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { 
  skillImportanceEnum, 
  skillLevelEnum, 
  jobSkillRequirementSchema, 
  createJobSchema,
  jobSearchSchema
} from '../db/jobRequirements';

describe('Job Requirements Validation Schemas', () => {
  it('should validate skill importance levels correctly', () => {
    const validImportance = ['critical', 'important', 'nice-to-have'];
    
    validImportance.forEach(importance => {
      const result = skillImportanceEnum.safeParse(importance);
      expect(result.success).toBe(true);
    });

    const invalidImportance = skillImportanceEnum.safeParse('optional');
    expect(invalidImportance.success).toBe(false);
  });

  it('should validate skill levels correctly', () => {
    const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
    
    validLevels.forEach(level => {
      const result = skillLevelEnum.safeParse(level);
      expect(result.success).toBe(true);
    });

    const invalidLevel = skillLevelEnum.safeParse('master');
    expect(invalidLevel.success).toBe(false);
  });

  it('should validate job skill requirement schema', () => {
    const validSkillRequirement = {
      skillId: uuidv4(),
      importance: 'critical' as const,
      minimumLevel: 'intermediate' as const,
      yearsRequired: 3,
    };

    const result = jobSkillRequirementSchema.safeParse(validSkillRequirement);
    expect(result.success).toBe(true);
  });

  it('should validate create job schema', () => {
    const validJob = {
      title: 'Senior Software Engineer',
      company: 'Tech Corp',
      industry: 'Technology',
      location: 'San Francisco, CA',
      description: 'We are looking for a senior software engineer...',
      salaryMin: 120000,
      salaryMax: 180000,
      currency: 'USD',
      requiredSkills: [
        {
          skillId: uuidv4(),
          importance: 'critical' as const,
          minimumLevel: 'advanced' as const,
          yearsRequired: 5,
        },
        {
          skillId: uuidv4(),
          importance: 'important' as const,
          minimumLevel: 'intermediate' as const,
          yearsRequired: 3,
        }
      ],
    };

    const result = createJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
      expect(result.data.requiredSkills).toHaveLength(2);
    }
  });

  it('should require at least one skill for job creation', () => {
    const invalidJob = {
      title: 'Software Engineer',
      company: 'Tech Corp',
      requiredSkills: [], // Empty skills array
    };

    const result = createJobSchema.safeParse(invalidJob);
    expect(result.success).toBe(false);
  });

  it('should validate job search schema with defaults', () => {
    const searchInput = {
      title: 'Software Engineer',
      location: 'San Francisco',
    };

    const result = jobSearchSchema.safeParse(searchInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it('should validate job search schema with custom limits', () => {
    const searchInput = {
      title: 'Software Engineer',
      limit: 50,
      offset: 10,
    };

    const result = jobSearchSchema.safeParse(searchInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  it('should reject invalid search limits', () => {
    const invalidSearch = {
      title: 'Software Engineer',
      limit: 150, // Too high
    };

    const result = jobSearchSchema.safeParse(invalidSearch);
    expect(result.success).toBe(false);
  });

  it('should validate salary ranges', () => {
    const validJob = {
      title: 'Software Engineer',
      salaryMin: 80000,
      salaryMax: 120000,
      requiredSkills: [
        {
          skillId: uuidv4(),
          importance: 'critical' as const,
          minimumLevel: 'intermediate' as const,
        }
      ],
    };

    const result = createJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it('should reject negative salaries', () => {
    const invalidJob = {
      title: 'Software Engineer',
      salaryMin: -1000, // Negative salary
      requiredSkills: [
        {
          skillId: uuidv4(),
          importance: 'critical' as const,
          minimumLevel: 'intermediate' as const,
        }
      ],
    };

    const result = createJobSchema.safeParse(invalidJob);
    expect(result.success).toBe(false);
  });

  it('should validate currency codes', () => {
    const validJob = {
      title: 'Software Engineer',
      currency: 'EUR',
      requiredSkills: [
        {
          skillId: uuidv4(),
          importance: 'critical' as const,
          minimumLevel: 'intermediate' as const,
        }
      ],
    };

    const result = createJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('EUR');
    }
  });

  it('should reject invalid currency codes', () => {
    const invalidJob = {
      title: 'Software Engineer',
      currency: 'DOLLAR', // Invalid currency code
      requiredSkills: [
        {
          skillId: uuidv4(),
          importance: 'critical' as const,
          minimumLevel: 'intermediate' as const,
        }
      ],
    };

    const result = createJobSchema.safeParse(invalidJob);
    expect(result.success).toBe(false);
  });
});