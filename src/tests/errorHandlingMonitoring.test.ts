import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ErrorTrackingService } from '../services/errorTracking';
import { ErrorRecoveryService } from '../services/errorRecovery';
import { PerformanceMetricsService } from '../services/performanceMetrics';
import { LoggingService } from '../services/logging';

// Mock environment
const mockEnv = {
  CACHE: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
  },
  DB: {
    prepare: jest.fn().mockReturnValue({
      first: jest.fn(),
    }),
  },
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
} as any;

// Mock context
const mockContext = {
  req: {
    method: 'GET',
    url: 'https://api.example.com/test',
    header: jest.fn(),
  },
  res: {
    status: 200,
  },
  env: mockEnv,
} as any;

describe('Enhanced Error Handling and Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ErrorTrackingService', () => {
    let errorTracking: ErrorTrackingService;

    beforeEach(() => {
      errorTracking = new ErrorTrackingService(mockEnv);
    });

    it('should track errors with enhanced alerting', async () => {
      const error = new Error('Test error');
      mockContext.req.header.mockImplementation((name: string) => {
        const headers: { [key: string]: string } = {
          'CF-Ray': '12345-SFO',
          'CF-Connecting-IP': '192.168.1.1',
          'CF-IPCountry': 'US',
          'User-Agent': 'Test Agent',
        };
        return headers[name];
      });

      mockEnv.CACHE.get.mockResolvedValue(null);
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      const errorId = await errorTracking.trackError(error, mockContext);

      expect(errorId).toBeDefined();
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^error:/),
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) })
      );
    });

    it('should detect error patterns and escalate', async () => {
      const error = new Error('Repeated error');
      (error as any).code = 'DATABASE_ERROR';
      (error as any).statusCode = 500;

      // Mock high error frequency - first call returns existing stats, subsequent calls return updated stats
      let callCount = 0;
      mockEnv.CACHE.get.mockImplementation((key: string) => {
        if (key === 'error:stats:current') {
          callCount++;
          if (callCount === 1) {
            // First call - return high frequency stats to trigger escalation
            return Promise.resolve({
              totalErrors: 100,
              errorsByCode: { 'DATABASE_ERROR': 15 },
              errorsByPath: { '/test': 20 },
              errorsByHour: { [new Date().toISOString().slice(0, 13)]: 60 },
              recentErrors: [],
            });
          } else {
            // Subsequent calls - return updated stats
            return Promise.resolve({
              totalErrors: 101,
              errorsByCode: { 'DATABASE_ERROR': 16 },
              errorsByPath: { '/test': 21 },
              errorsByHour: { [new Date().toISOString().slice(0, 13)]: 61 },
              recentErrors: [],
            });
          }
        }
        return Promise.resolve(null);
      });

      mockEnv.CACHE.put.mockResolvedValue(undefined);

      const errorId = await errorTracking.trackError(error, mockContext);

      expect(errorId).toBeDefined();
      // Should create escalation
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^escalation:/),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should get health indicators', async () => {
      mockEnv.CACHE.get.mockImplementation((key: string) => {
        if (key === 'error:stats:current') {
          return Promise.resolve(JSON.stringify({
            errorsByHour: { [new Date().toISOString().slice(0, 13)]: 5 },
            recentErrors: [
              { statusCode: 500, timestamp: new Date().toISOString() },
              { statusCode: 404, timestamp: new Date().toISOString() },
            ],
          }));
        }
        if (key === 'escalations:counter') {
          return Promise.resolve(JSON.stringify({ count: 2 }));
        }
        return Promise.resolve(null);
      });

      const indicators = await errorTracking.getHealthIndicators();

      expect(indicators).toHaveProperty('errorRate');
      expect(indicators).toHaveProperty('criticalErrors');
      expect(indicators).toHaveProperty('escalations');
      expect(indicators).toHaveProperty('status');
      expect(['healthy', 'degraded', 'critical']).toContain(indicators.status);
    });
  });

  describe('ErrorRecoveryService', () => {
    let recoveryService: ErrorRecoveryService;

    beforeEach(() => {
      recoveryService = new ErrorRecoveryService(mockEnv);
    });

    it('should execute with circuit breaker protection', async () => {
      mockEnv.CACHE.get.mockResolvedValue(null);
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      const operation = jest.fn().mockResolvedValue('success');

      const result = await recoveryService.executeWithCircuitBreaker(
        'test-service',
        operation
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit breaker after failures', async () => {
      mockEnv.CACHE.get.mockResolvedValue(JSON.stringify({
        state: 'CLOSED',
        failureCount: 4,
        successCount: 0,
        totalRequests: 4,
      }));
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      const operation = jest.fn().mockRejectedValue(new Error('Service failure'));

      await expect(
        recoveryService.executeWithCircuitBreaker('test-service', operation)
      ).rejects.toThrow('Service failure');

      // Should update circuit breaker state to OPEN
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        'circuit:test-service',
        expect.stringContaining('"state":"OPEN"'),
        expect.any(Object)
      );
    });

    it('should execute with retry logic', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      const result = await recoveryService.executeWithRetry(operation, {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should perform health checks', async () => {
      mockEnv.CACHE.get.mockResolvedValue(null);
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      const healthCheck = jest.fn().mockResolvedValue(true);

      const isHealthy = await recoveryService.performHealthCheck(
        'test-service',
        healthCheck
      );

      expect(isHealthy).toBe(true);
      expect(healthCheck).toHaveBeenCalledTimes(1);
    });
  });

  describe('PerformanceMetricsService', () => {
    let performanceService: PerformanceMetricsService;

    beforeEach(() => {
      performanceService = new PerformanceMetricsService(mockEnv);
    });

    it('should get current performance metrics', async () => {
      const mockMetrics = {
        totalRequests: 100,
        totalDuration: 50000,
        statusCodes: { '200': 80, '404': 15, '500': 5 },
        endpoints: {
          '/api/test': { count: 50, totalDuration: 25000, errors: 2 },
        },
        responseTimes: [100, 200, 300, 500, 1000],
      };

      mockEnv.CACHE.get.mockResolvedValue(JSON.stringify(mockMetrics));

      const metrics = await performanceService.getCurrentMetrics();

      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('throughput');
      expect(metrics).toHaveProperty('errorRates');
      expect(metrics).toHaveProperty('endpoints');
      expect(metrics.responseTime.avg).toBe(500); // 50000 / 100
      expect(metrics.errorRates.total).toBe(0.2); // 20 errors out of 100 requests
    });

    it('should assess system health', async () => {
      mockEnv.CACHE.get.mockResolvedValue(JSON.stringify({
        totalRequests: 100,
        totalDuration: 100000, // High response time
        statusCodes: { '200': 90, '500': 10 }, // High error rate
        responseTimes: [2000, 3000, 4000], // Slow responses
      }));

      const health = await performanceService.getSystemHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('score');
      expect(health).toHaveProperty('indicators');
      expect(health).toHaveProperty('recommendations');
      expect(['healthy', 'degraded', 'critical']).toContain(health.status);
    });

    it('should record performance alerts', async () => {
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      await performanceService.recordPerformanceAlert('HIGH_RESPONSE_TIME', {
        avgResponseTime: 3000,
        threshold: 2000,
      });

      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^perf_alert:/),
        expect.stringContaining('HIGH_RESPONSE_TIME'),
        expect.any(Object)
      );
    });

    it('should check performance thresholds', async () => {
      mockEnv.CACHE.get.mockResolvedValue(JSON.stringify({
        totalRequests: 100,
        totalDuration: 300000, // 3 seconds average
        statusCodes: { '200': 90, '500': 10 }, // 10% error rate
        responseTimes: [3000, 3000, 3000],
      }));
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      await performanceService.checkPerformanceThresholds();

      // Should create alerts for high response time and error rate
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^perf_alert:/),
        expect.stringContaining('HIGH_RESPONSE_TIME'),
        expect.any(Object)
      );
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^perf_alert:/),
        expect.stringContaining('HIGH_ERROR_RATE'),
        expect.any(Object)
      );
    });
  });

  describe('LoggingService', () => {
    let loggingService: LoggingService;

    beforeEach(() => {
      loggingService = new LoggingService(mockEnv);
    });

    it('should log messages with proper levels', async () => {
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      await loggingService.info('Test info message', { key: 'value' });
      await loggingService.error('Test error message', new Error('Test error'));

      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^log:/),
        expect.stringContaining('"level":"info"'),
        expect.any(Object)
      );
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^log:/),
        expect.stringContaining('"level":"error"'),
        expect.any(Object)
      );
    });

    it('should log HTTP requests', async () => {
      mockEnv.CACHE.put.mockResolvedValue(undefined);
      mockContext.req.header.mockImplementation((name: string) => {
        const headers: { [key: string]: string } = {
          'CF-Ray': '12345-SFO',
          'CF-Connecting-IP': '192.168.1.1',
          'User-Agent': 'Test Agent',
        };
        return headers[name];
      });

      await loggingService.logRequest(mockContext, 500, 200);

      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^log:/),
        expect.stringContaining('"duration":500'),
        expect.any(Object)
      );
    });

    it('should query logs with filters', async () => {
      const mockLogs = [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Test error',
          metadata: { userId: 'user1', path: '/api/test' },
          user: { id: 'user1' },
          request: { path: '/api/test' },
          environment: 'test',
        },
        {
          id: '2',
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Test info',
          metadata: { userId: 'user2', path: '/api/other' },
          user: { id: 'user2' },
          request: { path: '/api/other' },
          environment: 'test',
        },
      ];

      mockEnv.CACHE.list.mockResolvedValue({
        keys: [{ name: 'log:1' }, { name: 'log:2' }],
      });
      mockEnv.CACHE.get.mockImplementation((key: string) => {
        if (key === 'log:1') return Promise.resolve(mockLogs[0]);
        if (key === 'log:2') return Promise.resolve(mockLogs[1]);
        return Promise.resolve(null);
      });

      const logs = await loggingService.queryLogs({
        level: 'error',
        userId: 'user1',
        limit: 10,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].metadata?.userId).toBe('user1');
    });

    it('should get log statistics', async () => {
      const mockLogs = [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Test error',
          request: { path: '/api/test', duration: 1000 },
          environment: 'test',
        },
        {
          id: '2',
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Test info',
          request: { path: '/api/test', duration: 500 },
          environment: 'test',
        },
      ];

      mockEnv.CACHE.list.mockResolvedValue({
        keys: [{ name: 'log:1' }, { name: 'log:2' }],
      });
      mockEnv.CACHE.get.mockImplementation((key: string) => {
        if (key === 'log:1') return Promise.resolve(mockLogs[0]);
        if (key === 'log:2') return Promise.resolve(mockLogs[1]);
        return Promise.resolve(null);
      });

      const stats = await loggingService.getLogStats(24);

      expect(stats).toHaveProperty('totalLogs');
      expect(stats).toHaveProperty('logsByLevel');
      expect(stats).toHaveProperty('topPaths');
      expect(stats).toHaveProperty('averageResponseTime');
      expect(stats.totalLogs).toBe(2);
      expect(stats.averageResponseTime).toBe(750); // (1000 + 500) / 2
    });
  });

  describe('Integration Tests', () => {
    it('should handle error tracking with circuit breaker', async () => {
      const errorTracking = new ErrorTrackingService(mockEnv);
      const recoveryService = new ErrorRecoveryService(mockEnv);

      mockEnv.CACHE.get.mockResolvedValue(null);
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      // Simulate a failing operation that should trigger circuit breaker
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));

      // Track the error
      const error = new Error('Service down');
      await errorTracking.trackError(error, mockContext);

      // Try to execute with circuit breaker
      await expect(
        recoveryService.executeWithCircuitBreaker('failing-service', failingOperation)
      ).rejects.toThrow('Service down');

      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^error:/),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should integrate performance monitoring with alerting', async () => {
      const performanceService = new PerformanceMetricsService(mockEnv);
      const errorTracking = new ErrorTrackingService(mockEnv);

      // Mock poor performance metrics
      mockEnv.CACHE.get.mockResolvedValue(JSON.stringify({
        totalRequests: 100,
        totalDuration: 500000, // 5 seconds average
        statusCodes: { '200': 80, '500': 20 }, // 20% error rate
        responseTimes: [5000, 5000, 5000],
      }));
      mockEnv.CACHE.put.mockResolvedValue(undefined);

      // Check thresholds (should create alerts)
      await performanceService.checkPerformanceThresholds();

      // Get health indicators
      const health = await performanceService.getSystemHealth();
      const errorHealth = await errorTracking.getHealthIndicators();

      expect(health.status).toBe('critical');
      expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
        expect.stringMatching(/^perf_alert:/),
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});