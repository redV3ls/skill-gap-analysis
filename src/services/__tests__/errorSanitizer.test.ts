import { describe, it, expect, beforeEach, jest } from 'vitest';
import { ErrorSanitizer } from '../errorSanitizer';
import { Context } from 'hono';

describe('ErrorSanitizer', () => {
  let sanitizer: ErrorSanitizer;
  let mockContext: Partial<Context>;

  beforeEach(() => {
    sanitizer = new ErrorSanitizer('production');
    
    mockContext = {
      req: {
        header: vi.fn((name: string) => {
          const headers: Record<string, string> = {
            'CF-Ray': 'test-ray-id',
            'User-Agent': 'Mozilla/5.0 (Test Browser)',
            'Authorization': 'Bearer secret-token'
          };
          return headers[name];
        }),
        url: 'https://example.com/api/test?token=secret&page=1',
        method: 'POST'
      } as any
    };
  });

  describe('sanitizeError', () => {
    it('should sanitize basic error', () => {
      const error = new Error('Test error message');
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.id).toBeDefined();
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.message).toBe('Test error message');
      expect(result.timestamp).toBeDefined();
      expect(result.requestId).toBe('test-ray-id');
    });

    it('should sanitize error with custom code', () => {
      const error = new Error('Custom error') as any;
      error.code = 'CUSTOM_ERROR';
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.code).toBe('CUSTOM_ERROR');
    });

    it('should handle ZodError', () => {
      const error = new Error('Validation failed');
      error.name = 'ZodError';
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toBe('Invalid request data');
    });

    it('should truncate long error messages', () => {
      const longMessage = 'A'.repeat(600);
      const error = new Error(longMessage);
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.message.length).toBeLessThanOrEqual(503); // 500 + '...'
      expect(result.message.endsWith('...')).toBe(true);
    });

    it('should sanitize file paths in error messages', () => {
      const error = new Error('Error in /home/user/app/src/file.js at line 10');
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.message).toContain('[FILE_PATH]');
      expect(result.message).not.toContain('/home/user/app/src/file.js');
    });

    it('should sanitize database URLs in error messages', () => {
      const error = new Error('Connection failed to postgresql://user:pass@localhost:5432/db');
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.message).toContain('[DATABASE_URL]');
      expect(result.message).not.toContain('postgresql://user:pass@localhost:5432/db');
    });

    it('should sanitize tokens in error messages', () => {
      const error = new Error('Invalid token: abc123def456ghi789jkl012mno345pqr678');
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.message).toContain('[TOKEN]');
      expect(result.message).not.toContain('abc123def456ghi789jkl012mno345pqr678');
    });

    it('should sanitize IP addresses in error messages', () => {
      const error = new Error('Request from 192.168.1.100 failed');
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.message).toContain('[IP_ADDRESS]');
      expect(result.message).not.toContain('192.168.1.100');
    });
  });

  describe('sanitizeStackTrace', () => {
    it('should sanitize stack trace', () => {
      const stack = `Error: Test error
    at /home/user/app/src/file.js:10:5
    at /home/user/app/src/another.js:20:10
    at /home/user/app/node_modules/lib/index.js:30:15`;
      
      const result = sanitizer.sanitizeStackTrace(stack);

      expect(result).toContain('file.js:10:5');
      expect(result).toContain('another.js:20:10');
      expect(result).not.toContain('/home/user/app/src/');
    });

    it('should limit stack trace lines', () => {
      const stack = Array.from({ length: 20 }, (_, i) => 
        `    at /path/to/file${i}.js:${i}:5`
      ).join('\n');
      
      const result = sanitizer.sanitizeStackTrace(stack);
      const lines = result.split('\n');

      expect(lines.length).toBeLessThanOrEqual(10);
    });

    it('should sanitize sensitive data in stack trace', () => {
      const stack = `Error: Test error
    at /app/src/auth.js:10:5 password=secret123
    at /app/src/token.js:20:10 token=abc123def456`;
      
      const result = sanitizer.sanitizeStackTrace(stack);

      expect(result).toContain('password=[REDACTED]');
      expect(result).toContain('token=[REDACTED]');
      expect(result).not.toContain('secret123');
      expect(result).not.toContain('abc123def456');
    });
  });

  describe('redactSensitiveData', () => {
    it('should redact sensitive keys', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        token: 'abc123',
        apiKey: 'key123',
        normalField: 'value'
      };
      
      const result = sanitizer.redactSensitiveData(data);

      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.normalField).toBe('value');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          name: 'john',
          credentials: {
            password: 'secret123',
            apiKey: 'key123'
          }
        }
      };
      
      const result = sanitizer.redactSensitiveData(data);

      expect(result.user.name).toBe('john');
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.user.credentials.apiKey).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const data = {
        users: [
          { name: 'john', password: 'secret1' },
          { name: 'jane', password: 'secret2' }
        ]
      };
      
      const result = sanitizer.redactSensitiveData(data);

      expect(result.users[0].name).toBe('john');
      expect(result.users[0].password).toBe('[REDACTED]');
      expect(result.users[1].name).toBe('jane');
      expect(result.users[1].password).toBe('[REDACTED]');
    });
  });

  describe('sanitizeHeaders', () => {
    it('should redact sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
        'X-API-Key': 'key123',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      
      const result = sanitizer.sanitizeHeaders(headers);

      expect(result['Content-Type']).toBe('application/json');
      expect(result['Authorization']).toBe('[REDACTED]');
      expect(result['X-API-Key']).toBe('[REDACTED]');
      expect(result['User-Agent']).toContain('(...)'); // Partially redacted
    });
  });

  describe('sanitizeQueryParams', () => {
    it('should redact sensitive query parameters', () => {
      const params = {
        page: '1',
        limit: '10',
        token: 'secret123',
        api_key: 'key123',
        search: 'test'
      };
      
      const result = sanitizer.sanitizeQueryParams(params);

      expect(result.page).toBe('1');
      expect(result.limit).toBe('10');
      expect(result.token).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.search).toBe('test');
    });
  });

  describe('environment-specific behavior', () => {
    it('should include stack trace in development', () => {
      const devSanitizer = new ErrorSanitizer('development');
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      // In development, more details might be included in logging
      // This is tested through the logging behavior, not the client response
      expect(devSanitizer.getConfig().includeStackTrace).toBe(true);
    });

    it('should not include stack trace in production', () => {
      const prodSanitizer = new ErrorSanitizer('production');
      
      expect(prodSanitizer.getConfig().includeStackTrace).toBe(false);
    });

    it('should include validation details for ZodError', () => {
      const error = new Error('Validation failed') as any;
      error.name = 'ZodError';
      error.errors = [
        { path: ['field1'], message: 'Required', code: 'required' },
        { path: ['field2'], message: 'Invalid', code: 'invalid' }
      ];
      
      const result = sanitizer.sanitizeError(error, mockContext as Context);

      expect(result.details).toBeDefined();
      expect(result.details).toHaveLength(2);
      expect(result.details[0].field).toBe('field1');
      expect(result.details[0].message).toBe('Required');
    });
  });

  describe('configuration', () => {
    it('should allow configuration updates', () => {
      sanitizer.updateConfig({
        maxErrorMessageLength: 100,
        includeStackTrace: true
      });
      
      const config = sanitizer.getConfig();
      expect(config.maxErrorMessageLength).toBe(100);
      expect(config.includeStackTrace).toBe(true);
    });

    it('should return current configuration', () => {
      const config = sanitizer.getConfig();
      
      expect(config.environment).toBe('production');
      expect(config.sensitiveHeaders).toContain('authorization');
      expect(config.sensitiveQueryParams).toContain('token');
    });
  });
});