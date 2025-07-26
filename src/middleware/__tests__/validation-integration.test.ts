import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { validateRequest } from '../../schemas/validation';
import { errorHandler } from '../../middleware/errorHandler';
import { Env } from '../../index';

// Test integration with actual route patterns
describe('Validation Middleware Integration', () => {
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
  });

  describe('Auth route validation patterns', () => {
    const loginSchema = z.object({
      email: z.string().email('Invalid email format'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const registerSchema = z.object({
      email: z.string().email('Invalid email format'),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
      name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
      organization: z.string().max(200, 'Organization name too long').optional(),
    });

    it('should validate login request correctly', async () => {
      app.post('/auth/login', validateRequest(loginSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof loginSchema>;
        return c.json({
          success: true,
          email: validatedData.email,
          passwordLength: validatedData.password.length,
        });
      });

      const validLoginData = {
        email: 'test@example.com',
        password: 'SecurePass123',
      };

      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validLoginData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.email).toBe('test@example.com');
      expect(responseData.passwordLength).toBe(13);
    });

    it('should reject invalid login data', async () => {
      app.post('/auth/login', validateRequest(loginSchema), (c) => {
        return c.json({ success: true });
      });

      const invalidLoginData = {
        email: 'invalid-email',
        password: 'short',
      };

      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidLoginData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
      expect(responseData.details).toBeDefined();
      expect(responseData.details.length).toBe(2);
      
      const fieldErrors = responseData.details.map((detail: any) => detail.field);
      expect(fieldErrors).toContain('email');
      expect(fieldErrors).toContain('password');
    });

    it('should validate register request correctly', async () => {
      app.post('/auth/register', validateRequest(registerSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof registerSchema>;
        return c.json({
          success: true,
          user: {
            email: validatedData.email,
            name: validatedData.name,
            organization: validatedData.organization,
          },
        });
      });

      const validRegisterData = {
        email: 'newuser@example.com',
        password: 'SecurePass123',
        name: 'John Doe',
        organization: 'Test Corp',
      };

      const req = new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.user.email).toBe('newuser@example.com');
      expect(responseData.user.name).toBe('John Doe');
      expect(responseData.user.organization).toBe('Test Corp');
    });

    it('should reject weak password in register', async () => {
      app.post('/auth/register', validateRequest(registerSchema), (c) => {
        return c.json({ success: true });
      });

      const weakPasswordData = {
        email: 'test@example.com',
        password: 'weakpass', // No uppercase or numbers
        name: 'John Doe',
      };

      const req = new Request('http://localhost/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weakPasswordData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
      expect(responseData.details).toBeDefined();
      
      const passwordError = responseData.details.find((detail: any) => detail.field === 'password');
      expect(passwordError).toBeDefined();
      expect(passwordError.message).toContain('Password must contain');
    });
  });

  describe('Gap analysis validation patterns', () => {
    const skillSchema = z.object({
      skill: z.string().min(1, 'Skill name is required').max(100, 'Skill name too long'),
      level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
      years_experience: z.number().min(0).max(50).optional(),
      certifications: z.array(z.string()).optional().default([]),
    });

    const gapAnalysisSchema = z.object({
      user_skills: z.array(skillSchema).min(1, 'At least one skill is required'),
      target_job: z.object({
        title: z.string().min(1, 'Job title is required'),
        description: z.string().min(10, 'Job description too short'),
        required_skills: z.array(z.string()).min(1, 'At least one required skill needed'),
      }),
      analysis_options: z.object({
        include_recommendations: z.boolean().default(true),
        include_learning_paths: z.boolean().default(true),
      }).optional().default({}),
    });

    it('should validate gap analysis request correctly', async () => {
      app.post('/analyze/gap', validateRequest(gapAnalysisSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof gapAnalysisSchema>;
        return c.json({
          success: true,
          skillsCount: validatedData.user_skills.length,
          jobTitle: validatedData.target_job.title,
          includeRecommendations: validatedData.analysis_options.include_recommendations,
        });
      });

      const validGapAnalysisData = {
        user_skills: [
          {
            skill: 'JavaScript',
            level: 'intermediate' as const,
            years_experience: 3,
            certifications: ['JS Fundamentals'],
          },
          {
            skill: 'React',
            level: 'advanced' as const,
            years_experience: 2,
          },
        ],
        target_job: {
          title: 'Senior Frontend Developer',
          description: 'Looking for an experienced frontend developer with strong React and TypeScript skills.',
          required_skills: ['React', 'TypeScript', 'Node.js'],
        },
        analysis_options: {
          include_recommendations: true,
          include_learning_paths: false,
        },
      };

      const req = new Request('http://localhost/analyze/gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validGapAnalysisData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.skillsCount).toBe(2);
      expect(responseData.jobTitle).toBe('Senior Frontend Developer');
      expect(responseData.includeRecommendations).toBe(true);
    });

    it('should reject invalid skill levels', async () => {
      app.post('/analyze/gap', validateRequest(gapAnalysisSchema), (c) => {
        return c.json({ success: true });
      });

      const invalidSkillData = {
        user_skills: [
          {
            skill: 'JavaScript',
            level: 'expert-level', // Invalid enum value
            years_experience: 3,
          },
        ],
        target_job: {
          title: 'Developer',
          description: 'A developer position requiring various skills.',
          required_skills: ['JavaScript'],
        },
      };

      const req = new Request('http://localhost/analyze/gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidSkillData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
      expect(responseData.details).toBeDefined();
      
      const levelError = responseData.details.find((detail: any) => detail.field === 'user_skills.0.level');
      expect(levelError).toBeDefined();
    });

    it('should require at least one skill', async () => {
      app.post('/analyze/gap', validateRequest(gapAnalysisSchema), (c) => {
        return c.json({ success: true });
      });

      const noSkillsData = {
        user_skills: [], // Empty array
        target_job: {
          title: 'Developer',
          description: 'A developer position requiring various skills.',
          required_skills: ['JavaScript'],
        },
      };

      const req = new Request('http://localhost/analyze/gap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noSkillsData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
      expect(responseData.details).toBeDefined();
      
      const skillsError = responseData.details.find((detail: any) => detail.field === 'user_skills');
      expect(skillsError).toBeDefined();
      expect(skillsError.message).toContain('At least one skill is required');
    });
  });

  describe('Type safety verification', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });

    it('should provide correct TypeScript types for validated data', async () => {
      app.post('/test-types', validateRequest(testSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof testSchema>;
        
        // These should compile without TypeScript errors
        const name: string = validatedData.name;
        const age: number = validatedData.age;
        const active: boolean = validatedData.active;
        
        // These operations should work with proper types
        const nameLength = name.length;
        const doubleAge = age * 2;
        const notActive = !active;
        
        return c.json({
          name,
          age,
          active,
          nameLength,
          doubleAge,
          notActive,
        });
      });

      const testData = {
        name: 'John',
        age: 30,
        active: true,
      };

      const req = new Request('http://localhost/test-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.name).toBe('John');
      expect(responseData.age).toBe(30);
      expect(responseData.active).toBe(true);
      expect(responseData.nameLength).toBe(4);
      expect(responseData.doubleAge).toBe(60);
      expect(responseData.notActive).toBe(false);
    });
  });
});