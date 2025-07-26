import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { Env } from '../../index';
import analyzeRoutes from '../analyze';
import { generateJWT } from '../../middleware/auth';

// Mock environment for testing
const mockEnv: Env = {
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn()
      })
    })
  } as any,
  CACHE: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
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
app.use('/analyze/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    // Mock authenticated user
    (c as any).user = testUser;
  }
  await next();
});

app.route('/analyze', analyzeRoutes);

// Mock user for testing
const testUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  role: 'user'
};

describe('Analyze Routes', () => {
  let authToken: string;

  beforeEach(async () => {
    // Generate test JWT token
    authToken = await generateJWT(testUser, mockEnv.JWT_SECRET, 3600);
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /analyze/gap', () => {
    const validGapAnalysisRequest = {
      user_skills: [
        {
          skill: 'JavaScript',
          level: 'intermediate',
          years_experience: 3,
          certifications: ['JavaScript Fundamentals']
        },
        {
          skill: 'React',
          level: 'beginner',
          years_experience: 1
        }
      ],
      target_job: {
        title: 'Senior Frontend Developer',
        description: 'We are looking for a senior frontend developer with expertise in React, TypeScript, Node.js, and modern web technologies. The ideal candidate should have experience with state management, testing frameworks, and CI/CD pipelines.',
        required_skills: ['React', 'TypeScript', 'Node.js', 'Jest', 'Git'],
        company: 'Tech Corp',
        location: 'San Francisco, CA'
      },
      analysis_options: {
        include_recommendations: true,
        include_learning_paths: true,
        geographic_region: 'US'
      }
    };

    it('should perform gap analysis successfully with valid input', async () => {
      // Mock database responses
      const mockAnalysisInsert = vi.fn().mockResolvedValue({ success: true });
      (mockEnv.DB.prepare as jest.Mock).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockAnalysisInsert
        })
      });

      const response = await app.request('/analyze/gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validGapAnalysisRequest)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('analysis_id');
      expect(result).toHaveProperty('overall_match');
      expect(result).toHaveProperty('skill_gaps');
      expect(result).toHaveProperty('strengths');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('metadata');
      
      expect(result.user_id).toBe(testUser.id);
      expect(result.target_job.title).toBe('Senior Frontend Developer');
      expect(typeof result.overall_match).toBe('number');
      expect(Array.isArray(result.skill_gaps)).toBe(true);
      expect(Array.isArray(result.strengths)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.request('/analyze/gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validGapAnalysisRequest)
      });

      expect(response.status).toBe(401);
    });

    it('should return 400 with invalid request data', async () => {
      const invalidRequest = {
        user_skills: [], // Empty skills array should fail validation
        target_job: {
          title: '', // Empty title should fail validation
          description: 'Short', // Too short description
          required_skills: []
        }
      };

      const response = await app.request('/analyze/gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(invalidRequest)
      });

      expect(response.status).toBe(400);
      
      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle missing required fields', async () => {
      const incompleteRequest = {
        user_skills: [
          {
            skill: 'JavaScript',
            level: 'intermediate'
          }
        ]
        // Missing target_job
      };

      const response = await app.request('/analyze/gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(incompleteRequest)
      });

      expect(response.status).toBe(400);
    });

    it('should validate skill levels', async () => {
      const invalidSkillLevel = {
        user_skills: [
          {
            skill: 'JavaScript',
            level: 'invalid-level', // Invalid skill level
            years_experience: 3
          }
        ],
        target_job: validGapAnalysisRequest.target_job
      };

      const response = await app.request('/analyze/gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(invalidSkillLevel)
      });

      expect(response.status).toBe(400);
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      (mockEnv.DB.prepare as jest.Mock).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockRejectedValue(new Error('Database connection failed'))
        })
      });

      const response = await app.request('/analyze/gap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validGapAnalysisRequest)
      });

      // Should still return analysis even if storage fails
      expect(response.status).toBe(200);
    });
  });

  describe('GET /analyze/gap/:analysisId', () => {
    const mockAnalysisId = 'analysis-123';
    const mockAnalysisData = {
      analysis_id: mockAnalysisId,
      user_id: testUser.id,
      overall_match: 75,
      skill_gaps: [],
      strengths: [],
      recommendations: { immediate: [], shortTerm: [], longTerm: [] }
    };

    it('should retrieve existing gap analysis', async () => {
      // Mock database response
      (mockEnv.DB.prepare as jest.Mock).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: mockAnalysisId,
            user_id: testUser.id,
            analysis_data: JSON.stringify(mockAnalysisData)
          })
        })
      });

      const response = await app.request(`/analyze/gap/${mockAnalysisId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.analysis_id).toBe(mockAnalysisId);
      expect(result.user_id).toBe(testUser.id);
      expect(result).toHaveProperty('retrieved_at');
    });

    it('should return 404 for non-existent analysis', async () => {
      // Mock database returning null
      (mockEnv.DB.prepare as jest.Mock).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      });

      const response = await app.request('/analyze/gap/non-existent-id', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.request(`/analyze/gap/${mockAnalysisId}`, {
        method: 'GET'
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /analyze/gap/history', () => {
    it('should return user analysis history', async () => {
      const mockHistoryData = {
        results: [
          {
            id: 'analysis-1',
            target_job_title: 'Frontend Developer',
            overall_match: 80,
            skill_gaps_count: 3,
            created_at: '2024-01-15T10:00:00Z'
          },
          {
            id: 'analysis-2',
            target_job_title: 'Full Stack Developer',
            overall_match: 65,
            skill_gaps_count: 5,
            created_at: '2024-01-10T10:00:00Z'
          }
        ]
      };

      const mockCountData = { count: 2 };

      // Mock database responses
      (mockEnv.DB.prepare as jest.Mock)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue(mockHistoryData)
          })
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockCountData)
          })
        });

      const response = await app.request('/analyze/gap/history', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('analyses');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.analyses)).toBe(true);
      expect(result.analyses).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should handle pagination parameters', async () => {
      const mockHistoryData = { results: [] };
      const mockCountData = { count: 0 };

      (mockEnv.DB.prepare as jest.Mock)
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue(mockHistoryData)
          })
        })
        .mockReturnValueOnce({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockCountData)
          })
        });

      const response = await app.request('/analyze/gap/history?page=2&limit=5', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(5);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.request('/analyze/gap/history', {
        method: 'GET'
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /analyze/team', () => {
    const validTeamAnalysisRequest = {
      team_members: [
        {
          id: 'member-1',
          name: 'John Doe',
          role: 'Frontend Developer',
          department: 'Engineering',
          skills: [
            {
              skill: 'JavaScript',
              level: 'advanced',
              years_experience: 4,
              certifications: ['JavaScript Certification']
            },
            {
              skill: 'React',
              level: 'intermediate',
              years_experience: 2
            }
          ]
        },
        {
          id: 'member-2',
          name: 'Jane Smith',
          role: 'Backend Developer',
          department: 'Engineering',
          skills: [
            {
              skill: 'Node.js',
              level: 'advanced',
              years_experience: 5
            },
            {
              skill: 'Python',
              level: 'intermediate',
              years_experience: 3
            }
          ]
        }
      ],
      project_requirements: {
        name: 'E-commerce Platform',
        description: 'Build a modern e-commerce platform using React, Node.js, and PostgreSQL',
        required_skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
        timeline: '6 months',
        priority: 'high'
      },
      analysis_options: {
        include_recommendations: true,
        include_learning_paths: true
      }
    };

    it('should perform team analysis successfully with valid input', async () => {
      // Mock database responses
      const mockAnalysisInsert = vi.fn().mockResolvedValue({ success: true });
      (mockEnv.DB.prepare as jest.Mock).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockAnalysisInsert
        })
      });

      const response = await app.request('/analyze/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(validTeamAnalysisRequest)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json();
      expect(result).toHaveProperty('analysis_id');
      expect(result).toHaveProperty('team_summary');
      expect(result).toHaveProperty('member_analyses');
      expect(result).toHaveProperty('team_gaps');
      expect(result).toHaveProperty('team_strengths');
      expect(result).toHaveProperty('recommendations');
      
      expect(result.user_id).toBe(testUser.id);
      expect(result.project.name).toBe('E-commerce Platform');
      expect(result.team_summary.total_members).toBe(2);
      expect(Array.isArray(result.member_analyses)).toBe(true);
      expect(result.member_analyses).toHaveLength(2);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.request('/analyze/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validTeamAnalysisRequest)
      });

      expect(response.status).toBe(401);
    });

    it('should return 400 with invalid request data', async () => {
      const invalidRequest = {
        team_members: [], // Empty team members should fail validation
        project_requirements: {
          name: '', // Empty name should fail validation
          required_skills: []
        }
      };

      const response = await app.request('/analyze/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(invalidRequest)
      });

      expect(response.status).toBe(400);
      
      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });
});