import { describe, it, expect, beforeEach } from '@jest/globals';
import { ErrorTrackingService } from '../services/errorTracking';
import { ErrorRecoveryService } from '../services/errorRecovery';
import { PerformanceMetricsService } from '../services/performanceMetrics';

// Simple integration test to verify core functionality
describe('Error Handling and Monitoring Integration', () => {
  const mockEnv = {
    CACHE: {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ keys: [] }),
    },
    DB: {
      prepare: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue({ test: 1 }),
      }),
    },
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
  } as any;

  const mockContext = {
    req: {
      method: 'GET',
      url: 'https://api.example.com/test',
      header: jest.fn().mockReturnValue('test-value'),
    },
    res: { status: 200 },
    env: mockEnv,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize services without errors', () => {
    expect(() => new ErrorTrackingService(mockEnv)).not.toThrow();
    expect(() => new ErrorRecoveryService(mockEnv)).not.toThrow();
    expect(() => new PerformanceMetricsService(mockEnv)).not.toThrow();
  });

  it('should track errors and create alerts', async () => {
    const errorTracking = new ErrorTrackingService(mockEnv);
    const error = new Error('Test error');

    const errorId = await errorTracking.trackError(error, mockContext);

    expect(errorId).toBeDefined();
    expect(typeof errorId).toBe('string');
    expect(mockEnv.CACHE.put).toHaveBeenCalled();
  });

  it('should execute operations with circuit breaker', async () => {
    const recoveryService = new ErrorRecoveryService(mockEnv);
    const successfulOperation = jest.fn().mockResolvedValue('success');

    const result = await recoveryService.executeWithCircuitBreaker(
      'test-service',
      successfulOperation
    );

    expect(result).toBe('success');
    expect(successfulOperation).toHaveBeenCalledTimes(1);
  });

  it('should retry failed operations', async () => {
    const recoveryService = new ErrorRecoveryService(mockEnv);
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValue('success');

    const result = await recoveryService.executeWithRetry(operation, {
      maxAttempts: 3,
      baseDelay: 1, // Very short delay for testing
      maxDelay: 10,
      backoffMultiplier: 2,
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should get performance metrics', async () => {
    const performanceService = new PerformanceMetricsService(mockEnv);

    const metrics = await performanceService.getCurrentMetrics();

    expect(metrics).toHaveProperty('timestamp');
    expect(metrics).toHaveProperty('responseTime');
    expect(metrics).toHaveProperty('throughput');
    expect(metrics).toHaveProperty('errorRates');
    expect(metrics).toHaveProperty('endpoints');
  });

  it('should assess system health', async () => {
    const performanceService = new PerformanceMetricsService(mockEnv);

    const health = await performanceService.getSystemHealth();

    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('score');
    expect(health).toHaveProperty('indicators');
    expect(health).toHaveProperty('recommendations');
    expect(['healthy', 'degraded', 'critical']).toContain(health.status);
  });

  it('should record performance alerts', async () => {
    const performanceService = new PerformanceMetricsService(mockEnv);

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

  it('should integrate error tracking with circuit breaker', async () => {
    const errorTracking = new ErrorTrackingService(mockEnv);
    const recoveryService = new ErrorRecoveryService(mockEnv);

    // Track an error
    const error = new Error('Service failure');
    await errorTracking.trackError(error, mockContext);

    // Try to execute with circuit breaker
    const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));

    await expect(
      recoveryService.executeWithCircuitBreaker('failing-service', failingOperation)
    ).rejects.toThrow('Service down');

    // Both services should have interacted with cache
    expect(mockEnv.CACHE.put).toHaveBeenCalled();
  });
});