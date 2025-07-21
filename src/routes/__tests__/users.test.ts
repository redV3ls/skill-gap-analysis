import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Hono } from 'hono';
import { Env } from '../../index';
import usersRoutes from '../users';
import { generateJWT } from '../../middleware/auth';

// Mock environment for testing
const mockEnv: Env = {
  DB: {
    prepare: jest.fn().mockReturnValue({
      bind: jest.fn().mockReturnValue({
        first: jest.fn(),
        all: jest.fn(),
        run: jest.fn()
      })
    })
  } as any,
  CACHE: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  } as any,
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-key-for-jwt-signing',
  CORS_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_WINDOW_MS: '900000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  LOG_LEVEL: 'info'
};

// Test app setup
const app = new Hono<{ Bindings: Env }>();

// Mock environment middleware
app.use('*', async (c, next) => {
  // Set mock environment
  (c as any).env = mockEnv;
  await next();
});

// Mock authentication middleware for testing
app.use('/users/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // Mock authenticated user
    (c as any).user = testUser;
  }
  await next();
});

app.route('/users', usersRoutes);

// Mock user for testing
const testUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  role: 'user'
};

describe('Users Routes', () => {
  let authToken: string;

  beforeEach(async () => {
    // Generate test JWT token
    authToken = await generateJWT(testUser, mockEnv.JWT_SECRET, 3600);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /users/profile', () => {
    it('should return user profile with skills', async () => {
      // Mock database responses
      const mockProfile = {
        id: 'profile-123',
        userId: testUser.id,
        title: 'Software Developer',
        industry: 'Technology',
        location: 'San Francisco, CA',
        experience: 5,
        learningStyle: 'visual',
        timeCommitment: 10,
        budgetRange: '$1000-5000',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockSkills = [
        {
          id: 'skill-1',
          skillName: 'JavaScript',
          skillCategory: 'Programming',
          level: 'advanced',
          yearsExperience: 3,
          lastUsed: '2024-01-01T00:00:00Z',
          confidenceScore: 0.9,
          certifications: '["JavaScript Certification"]',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
      ];

      // Mock database calls
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockProfile])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(mockSkills)
              })
            })
          })
        });

      (mockEnv.DB as any).select = mockSelect;

      const response = await app.request('/users/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('user');
      expect(result.profile.title).toBe('Software Developer');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].skill_name).toBe('JavaScript');
    });

    it('should return null profile if user has no profile', async () => {
      // Mock empty profile response
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]) // No profile
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            innerJoin: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue([]) // No skills
              })
            })
          })
        });

      (mockEnv.DB as any).select = mockSelect;

      const response = await app.request('/users/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.profile).toBeNull();
      expect(result.skills).toHaveLength(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.request('/users/profile', {
        method: 'GET'
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /users/profile', () => {
    const validProfileData = {
      title: 'Senior Software Developer',
      industry: 'Technology',
      location: 'New York, NY',
      experience: 7,
      learning_style: 'visual',
      time_commitment: 15,
      budget_range: '$5000-10000',
    };

    it('should create new user profile', async () => {
      const mockProfile = {
        id: 'profile-123',
        userId: testUser.id,
        ...validProfileData,
        learningStyle: validProfileData.learning_style,
        timeCommitment: validProfileData.time_commitment,
        budgetRange: validProfileData.budget_range,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // Mock database calls
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]) // No existing profile
          })
        })
      });

      const mockInsert = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockProfile])
        })
      });

      (mockEnv.DB as any).select = mockSelect;
      (mockEnv.DB as any).insert = mockInsert;

      const response = await app.request('/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validProfileData)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Profile created successfully');
      expect(result.profile.title).toBe(validProfileData.title);
    });

    it('should update existing user profile', async () => {
      const existingProfile = { id: 'profile-123', userId: testUser.id };
      const updatedProfile = {
        id: 'profile-123',
        userId: testUser.id,
        ...validProfileData,
        learningStyle: validProfileData.learning_style,
        timeCommitment: validProfileData.time_commitment,
        budgetRange: validProfileData.budget_range,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // Mock database calls
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([existingProfile])
          })
        })
      });

      const mockUpdate = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedProfile])
          })
        })
      });

      (mockEnv.DB as any).select = mockSelect;
      (mockEnv.DB as any).update = mockUpdate;

      const response = await app.request('/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validProfileData)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.message).toBe('Profile updated successfully');
    });

    it('should return 400 with invalid data', async () => {
      const invalidData = {
        title: '', // Empty title should be allowed but let's test with invalid learning_style
        learning_style: 'invalid-style',
      };

      const response = await app.request('/users/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(invalidData)
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /users/profile/skills', () => {
    const validSkillsData = {
      skills: [
        {
          skill_name: 'React',
          level: 'advanced',
          years_experience: 4,
          confidence_score: 0.9,
          certifications: ['React Certification']
        },
        {
          skill_name: 'Node.js',
          level: 'intermediate',
          years_experience: 2,
          confidence_score: 0.7
        }
      ]
    };

    it('should update user skills successfully', async () => {
      const mockProfile = { id: 'profile-123', userId: testUser.id };
      const mockSkill = { id: 'skill-1', name: 'React', category: 'Frontend' };
      const mockUserSkill = {
        id: 'user-skill-1',
        userId: 'profile-123',
        skillId: 'skill-1',
        level: 'advanced',
        yearsExperience: 4,
        lastUsed: '2024-01-01T00:00:00Z',
        confidenceScore: 0.9,
        certifications: '["React Certification"]',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // Mock database calls
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockProfile])
            })
          })
        })
        .mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockSkill])
            })
          })
        });

      const mockInsert = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockUserSkill])
        })
      });

      (mockEnv.DB as any).select = mockSelect;
      (mockEnv.DB as any).insert = mockInsert;

      const response = await app.request('/users/profile/skills', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validSkillsData)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Skills updated successfully');
      expect(result.updated_count).toBe(2);
    });

    it('should return 404 if user profile not found', async () => {
      // Mock empty profile response
      const mockSelect = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]) // No profile
          })
        })
      });

      (mockEnv.DB as any).select = mockSelect;

      const response = await app.request('/users/profile/skills', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validSkillsData)
      });

      expect(response.status).toBe(404);
    });

    it('should return 400 with invalid skills data', async () => {
      const invalidData = {
        skills: [
          {
            skill_name: '', // Empty skill name
            level: 'invalid-level', // Invalid level
          }
        ]
      };

      const response = await app.request('/users/profile/skills', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(invalidData)
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /users/profile/skills/history', () => {
    it('should return skill history', async () => {
      const mockProfile = { id: 'profile-123', userId: testUser.id };
      const mockSkillHistory = [
        {
          id: 'skill-1',
          skillName: 'JavaScript',
          skillCategory: 'Programming',
          level: 'advanced',
          yearsExperience: 3,
          lastUsed: '2024-01-01T00:00:00Z',
          confidenceScore: 0.9,
          certifications: '["JavaScript Certification"]',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
      ];

      // Mock database calls
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockProfile])
            })
          })
        });

      // Mock query builder chain
      const mockQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockSkillHistory)
      };

      mockSelect.mockReturnValueOnce(mockQuery);
      (mockEnv.DB as any).select = mockSelect;

      const response = await app.request('/users/profile/skills/history', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('history');
      expect(result).toHaveProperty('total_records');
      expect(result.history).toHaveLength(1);
      expect(result.history[0].skill_name).toBe('JavaScript');
    });

    it('should filter by skill name', async () => {
      const mockProfile = { id: 'profile-123', userId: testUser.id };

      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockProfile])
            })
          })
        });

      const mockQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      mockSelect.mockReturnValueOnce(mockQuery);
      (mockEnv.DB as any).select = mockSelect;

      const response = await app.request('/users/profile/skills/history?skill=JavaScript&limit=10', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.filters.skill_name).toBe('JavaScript');
      expect(result.filters.limit).toBe(10);
    });
  });

  describe('DELETE /users/profile/skills/:skillId', () => {
    it('should remove skill successfully', async () => {
      const skillId = 'skill-123';
      const mockProfile = { id: 'profile-123', userId: testUser.id };
      const mockUserSkill = { id: skillId, userId: 'profile-123' };

      // Mock database calls
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockProfile])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockUserSkill])
            })
          })
        });

      const mockDelete = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });

      (mockEnv.DB as any).select = mockSelect;
      (mockEnv.DB as any).delete = mockDelete;

      const response = await app.request(`/users/profile/skills/${skillId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.message).toBe('Skill removed successfully');
      expect(result.skill_id).toBe(skillId);
    });

    it('should return 404 if skill not found', async () => {
      const skillId = 'non-existent-skill';
      const mockProfile = { id: 'profile-123', userId: testUser.id };

      // Mock database calls
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockProfile])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]) // Skill not found
            })
          })
        });

      (mockEnv.DB as any).select = mockSelect;

      const response = await app.request(`/users/profile/skills/${skillId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(404);
    });
  });
});