import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { validateRequest } from '../../schemas/validation';
import { errorHandler } from '../../middleware/errorHandler';
import { Env } from '../../index';

// Test schemas
const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().min(0, 'Age must be positive'),
  email: z.string().email('Invalid email format'),
});

const simpleSchema = z.object({
  message: z.string(),
});

describe('Validation Middleware', () => {
  let app: Hono<{ Bindings: Env }>;

  beforeEach(() => {
    app = new Hono<{ Bindings: Env }>();
    // Add error handler middleware
    app.onError(errorHandler);
  });

  describe('validateRequest middleware', () => {
    it('should validate valid request data and attach to context', async () => {
      app.post('/test', validateRequest(testSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof testSchema>;
        return c.json({
          success: true,
          data: validatedData,
        });
      });

      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(validData);
    });

    it('should return validation error for invalid data', async () => {
      app.post('/test', validateRequest(testSchema), (c) => {
        return c.json({ success: true });
      });

      const invalidData = {
        name: '', // Invalid: empty string
        age: -5, // Invalid: negative number
        email: 'invalid-email', // Invalid: not an email
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error).toBeDefined();
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
      expect(responseData.error.message).toBe('Invalid request data');
      expect(responseData.details).toBeDefined();
      expect(Array.isArray(responseData.details)).toBe(true);
      expect(responseData.details.length).toBeGreaterThan(0);
    });

    it('should return validation error for missing required fields', async () => {
      app.post('/test', validateRequest(testSchema), (c) => {
        return c.json({ success: true });
      });

      const incompleteData = {
        name: 'John Doe',
        // Missing age and email
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incompleteData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('VALIDATION_ERROR');
      expect(responseData.details).toBeDefined();
      
      // Should have errors for missing age and email
      const fieldErrors = responseData.details.map((detail: any) => detail.field);
      expect(fieldErrors).toContain('age');
      expect(fieldErrors).toContain('email');
    });

    it('should handle malformed JSON', async () => {
      app.post('/test', validateRequest(simpleSchema), (c) => {
        return c.json({ success: true });
      });

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }',
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('INVALID_JSON');
      expect(responseData.error.message).toBe('Invalid JSON format');
    });

    it('should handle empty request body', async () => {
      app.post('/test', validateRequest(simpleSchema), (c) => {
        return c.json({ success: true });
      });

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.error.code).toBe('INVALID_JSON');
    });

    it('should provide detailed validation error messages', async () => {
      app.post('/test', validateRequest(testSchema), (c) => {
        return c.json({ success: true });
      });

      const invalidData = {
        name: '',
        age: -1,
        email: 'not-an-email',
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.details).toBeDefined();
      
      const details = responseData.details;
      expect(details.length).toBe(3);
      
      // Check that each error has the expected structure
      details.forEach((detail: any) => {
        expect(detail).toHaveProperty('field');
        expect(detail).toHaveProperty('message');
        expect(detail).toHaveProperty('code');
      });
      
      // Check specific error messages
      const nameError = details.find((d: any) => d.field === 'name');
      const ageError = details.find((d: any) => d.field === 'age');
      const emailError = details.find((d: any) => d.field === 'email');
      
      expect(nameError.message).toBe('Name is required');
      expect(ageError.message).toBe('Age must be positive');
      expect(emailError.message).toBe('Invalid email format');
    });

    it('should work with nested object validation', async () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string().min(1),
          profile: z.object({
            age: z.number().min(0),
            email: z.string().email(),
          }),
        }),
      });

      app.post('/test', validateRequest(nestedSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof nestedSchema>;
        return c.json({ success: true, data: validatedData });
      });

      const validNestedData = {
        user: {
          name: 'John Doe',
          profile: {
            age: 30,
            email: 'john@example.com',
          },
        },
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validNestedData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(validNestedData);
    });

    it('should handle nested validation errors with proper field paths', async () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string().min(1),
          profile: z.object({
            age: z.number().min(0),
            email: z.string().email(),
          }),
        }),
      });

      app.post('/test', validateRequest(nestedSchema), (c) => {
        return c.json({ success: true });
      });

      const invalidNestedData = {
        user: {
          name: '',
          profile: {
            age: -1,
            email: 'invalid',
          },
        },
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidNestedData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.details).toBeDefined();
      
      const fieldPaths = responseData.details.map((detail: any) => detail.field);
      expect(fieldPaths).toContain('user.name');
      expect(fieldPaths).toContain('user.profile.age');
      expect(fieldPaths).toContain('user.profile.email');
    });

    it('should work with array validation', async () => {
      const arraySchema = z.object({
        items: z.array(z.object({
          name: z.string().min(1),
          value: z.number(),
        })).min(1),
      });

      app.post('/test', validateRequest(arraySchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof arraySchema>;
        return c.json({ success: true, data: validatedData });
      });

      const validArrayData = {
        items: [
          { name: 'Item 1', value: 10 },
          { name: 'Item 2', value: 20 },
        ],
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validArrayData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(validArrayData);
    });

    it('should handle array validation errors with proper indices', async () => {
      const arraySchema = z.object({
        items: z.array(z.object({
          name: z.string().min(1),
          value: z.number(),
        })).min(1),
      });

      app.post('/test', validateRequest(arraySchema), (c) => {
        return c.json({ success: true });
      });

      const invalidArrayData = {
        items: [
          { name: 'Item 1', value: 10 },
          { name: '', value: 'not-a-number' }, // Invalid item
        ],
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidArrayData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(400);
      expect(responseData.details).toBeDefined();
      
      const fieldPaths = responseData.details.map((detail: any) => detail.field);
      expect(fieldPaths.some((path: string) => path.includes('items.1'))).toBe(true);
    });

    it('should preserve original error structure for non-validation errors', async () => {
      app.post('/test', validateRequest(simpleSchema), (c) => {
        throw new Error('Custom error');
      });

      const validData = { message: 'test' };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData),
      });

      // The error should be handled by the error handler and return a 500 response
      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(500);
      expect(responseData.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(responseData.error.message).toBe('An unexpected error occurred');
    });
  });

  describe('Context type safety', () => {
    it('should provide type-safe access to validated data', async () => {
      app.post('/test', validateRequest(testSchema), (c) => {
        const validatedData = c.get('validatedData') as z.infer<typeof testSchema>;
        
        // TypeScript should recognize these properties
        const name: string = validatedData.name;
        const age: number = validatedData.age;
        const email: string = validatedData.email;
        
        return c.json({
          name,
          age,
          email,
          nameLength: name.length, // Should work with string methods
          ageDoubled: age * 2, // Should work with number operations
        });
      });

      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const req = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validData),
      });

      const res = await app.request(req);
      const responseData = await res.json();

      expect(res.status).toBe(200);
      expect(responseData.name).toBe('John Doe');
      expect(responseData.age).toBe(30);
      expect(responseData.email).toBe('john@example.com');
      expect(responseData.nameLength).toBe(8);
      expect(responseData.ageDoubled).toBe(60);
    });
  });
});