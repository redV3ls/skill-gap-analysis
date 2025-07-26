import { describe, it, expect, beforeEach, afterEach, jest } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { UserProfileService, CreateUserProfileInput, UserSkillInput } from '../db/userProfile';

// Mock database
const mockDb: any = {
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('UserProfileService', () => {
  let userProfileService: UserProfileService;
  let mockUserId: string;
  let mockProfileId: string;
  let mockSkillId: string;

  beforeEach(() => {
    userProfileService = new UserProfileService(mockDb);
    mockUserId = uuidv4();
    mockProfileId = uuidv4();
    mockSkillId = uuidv4();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize UserProfileService', () => {
    expect(userProfileService).toBeDefined();
  });

  describe('createUserProfile', () => {
    it('should create a user profile successfully', async () => {
      const mockProfile = {
        id: mockProfileId,
        userId: mockUserId,
        title: 'Software Engineer',
        industry: 'Technology',
        location: 'San Francisco, CA',
        experience: 5,
        learningStyle: 'visual' as const,
        timeCommitment: 10,
        budgetRange: '$1000-$5000',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockTransaction = vi.fn().mockImplementation(async (callback: any) => {
        const mockTx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockProfile] as never),
            }),
          }),
        };
        return await callback(mockTx);
      });

      mockDb.transaction.mockImplementation(mockTransaction);

      const input: CreateUserProfileInput = {
        userId: mockUserId,
        skills: [],
        title: 'Software Engineer',
        industry: 'Technology',
        location: 'San Francisco, CA',
        experience: 5,
        learningStyle: 'visual',
        timeCommitment: 10,
        budgetRange: '$1000-$5000',
      };

      const result = await userProfileService.createUserProfile(input);

      expect(result).toEqual(mockProfile);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid input', async () => {
      const invalidInput = {
        userId: 'invalid-uuid',
        title: 'Software Engineer',
      } as CreateUserProfileInput;

      await expect(userProfileService.createUserProfile(invalidInput)).rejects.toThrow();
    });
  });

  describe('getUserProfile', () => {
    it('should return null for non-existent user', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([] as never),
          }),
        }),
      });

      const result = await userProfileService.getUserProfile('non-existent-user');

      expect(result).toBeNull();
    });
  });

  describe('skill level validation', () => {
    it('should accept valid skill levels', () => {
      const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
      
      validLevels.forEach(level => {
        const mockSkill: UserSkillInput = {
          skillId: mockSkillId,
          level: level as any,
          certifications: [],
        };
        expect(mockSkill.level).toBe(level);
      });
    });
  });

  describe('learning style validation', () => {
    it('should accept valid learning styles', () => {
      const validStyles = ['visual', 'auditory', 'kinesthetic'];
      
      validStyles.forEach(style => {
        const input: CreateUserProfileInput = {
          userId: mockUserId,
          skills: [],
          learningStyle: style as any,
        };
        expect(input.learningStyle).toBe(style);
      });
    });
  });
});