import { Env } from '../index';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringWindow: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  successCount: number;
  totalRequests: number;
}

export class ErrorRecoveryService {
  private env: Env;
  private circuitBreakers: Map<string, CircuitBreakerStatus> = new Map();

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    serviceKey: string,
    operation: () => Promise<T>,
    config: CircuitBreakerConfig = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringWindow: 300000, // 5 minutes
    }
  ): Promise<T> {
    const status = await this.getCircuitBreakerStatus(serviceKey);
    
    // Check if circuit is open
    if (status.state === 'OPEN') {
      if (Date.now() < (status.nextAttemptTime || 0)) {
        throw new Error(`Circuit breaker is OPEN for ${serviceKey}. Next attempt at ${new Date(status.nextAttemptTime!).toISOString()}`);
      } else {
        // Move to half-open state
        await this.updateCircuitBreakerState(serviceKey, 'HALF_OPEN');
      }
    }

    try {
      const result = await operation();
      
      // Success - reset or improve circuit state
      if (status.state === 'HALF_OPEN') {
        await this.updateCircuitBreakerState(serviceKey, 'CLOSED');
        await this.recordSuccess(serviceKey);
      } else {
        await this.recordSuccess(serviceKey);
      }
      
      return result;
    } catch (error) {
      await this.recordFailure(serviceKey, config);
      throw error;
    }
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    }
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );

        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Execute with both circuit breaker and retry
   */
  async executeWithFullProtection<T>(
    serviceKey: string,
    operation: () => Promise<T>,
    circuitConfig?: CircuitBreakerConfig,
    retryConfig?: RetryConfig
  ): Promise<T> {
    return this.executeWithCircuitBreaker(
      serviceKey,
      () => this.executeWithRetry(operation, retryConfig),
      circuitConfig
    );
  }

  /**
   * Get circuit breaker status
   */
  async getCircuitBreakerStatus(serviceKey: string): Promise<CircuitBreakerStatus> {
    try {
      const cached = await this.env.CACHE.get(`circuit:${serviceKey}`, 'json');
      if (cached) {
        // Ensure we parse the cached data properly
        const status = typeof cached === 'string' ? JSON.parse(cached) : cached;
        this.circuitBreakers.set(serviceKey, status);
        return status;
      }
    } catch (error) {
      console.error('Failed to get circuit breaker status from cache:', error);
    }

    // Return default status
    const defaultStatus: CircuitBreakerStatus = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
    };
    
    this.circuitBreakers.set(serviceKey, defaultStatus);
    return defaultStatus;
  }

  /**
   * Update circuit breaker state
   */
  private async updateCircuitBreakerState(serviceKey: string, state: CircuitState): Promise<void> {
    const status = this.circuitBreakers.get(serviceKey);
    if (!status) return;

    status.state = state;
    
    if (state === 'OPEN') {
      status.nextAttemptTime = Date.now() + 60000; // 1 minute recovery timeout
    } else if (state === 'CLOSED') {
      status.failureCount = 0;
      status.nextAttemptTime = undefined;
    }

    this.circuitBreakers.set(serviceKey, status);
    
    try {
      await this.env.CACHE.put(
        `circuit:${serviceKey}`,
        JSON.stringify(status),
        { expirationTtl: 3600 } // 1 hour
      );
    } catch (error) {
      console.error('Failed to update circuit breaker state in cache:', error);
    }
  }

  /**
   * Record successful operation
   */
  private async recordSuccess(serviceKey: string): Promise<void> {
    let status = this.circuitBreakers.get(serviceKey);
    if (!status) {
      status = await this.getCircuitBreakerStatus(serviceKey);
    }

    // Create a new status object to avoid mutation issues
    const updatedStatus: CircuitBreakerStatus = {
      ...status,
      successCount: status.successCount + 1,
      totalRequests: status.totalRequests + 1,
    };
    
    // Reset failure count on success
    if (updatedStatus.state === 'CLOSED') {
      updatedStatus.failureCount = 0;
    }

    this.circuitBreakers.set(serviceKey, updatedStatus);
    
    try {
      await this.env.CACHE.put(
        `circuit:${serviceKey}`,
        JSON.stringify(updatedStatus),
        { expirationTtl: 3600 }
      );
    } catch (error) {
      console.error('Failed to record success in cache:', error);
    }
  }

  /**
   * Record failed operation
   */
  private async recordFailure(serviceKey: string, config: CircuitBreakerConfig): Promise<void> {
    let status = this.circuitBreakers.get(serviceKey);
    if (!status) {
      // Get status from cache or create new one
      status = await this.getCircuitBreakerStatus(serviceKey);
    }

    // Create a new status object to avoid mutation issues
    const updatedStatus: CircuitBreakerStatus = {
      ...status,
      failureCount: status.failureCount + 1,
      totalRequests: status.totalRequests + 1,
      lastFailureTime: Date.now(),
    };

    // Check if we should open the circuit
    if (updatedStatus.failureCount >= config.failureThreshold) {
      updatedStatus.state = 'OPEN';
      updatedStatus.nextAttemptTime = Date.now() + config.recoveryTimeout;
      
      this.circuitBreakers.set(serviceKey, updatedStatus);
      
      try {
        await this.env.CACHE.put(
          `circuit:${serviceKey}`,
          JSON.stringify(updatedStatus),
          { expirationTtl: 3600 }
        );
      } catch (error) {
        console.error('Failed to update circuit breaker state in cache:', error);
      }
      
      // Log circuit breaker activation
      console.error(`🔴 Circuit breaker OPENED for ${serviceKey} after ${updatedStatus.failureCount} failures`);
      
      // Store alert
      await this.storeCircuitBreakerAlert(serviceKey, updatedStatus);
    } else {
      this.circuitBreakers.set(serviceKey, updatedStatus);
      
      try {
        await this.env.CACHE.put(
          `circuit:${serviceKey}`,
          JSON.stringify(updatedStatus),
          { expirationTtl: 3600 }
        );
      } catch (error) {
        console.error('Failed to record failure in cache:', error);
      }
    }
  }

  /**
   * Store circuit breaker alert
   */
  private async storeCircuitBreakerAlert(serviceKey: string, status: CircuitBreakerStatus): Promise<void> {
    const alert = {
      type: 'CIRCUIT_BREAKER_OPEN',
      serviceKey,
      timestamp: new Date().toISOString(),
      failureCount: status.failureCount,
      totalRequests: status.totalRequests,
      failureRate: status.failureCount / status.totalRequests,
      nextAttemptTime: status.nextAttemptTime,
    };

    try {
      const alertKey = `circuit_alert:${serviceKey}:${Date.now()}`;
      await this.env.CACHE.put(
        alertKey,
        JSON.stringify(alert),
        { expirationTtl: 86400 } // 24 hours
      );

      // Update circuit breaker summary
      await this.updateCircuitBreakerSummary(alert);
    } catch (error) {
      console.error('Failed to store circuit breaker alert:', error);
    }
  }

  /**
   * Update circuit breaker summary
   */
  private async updateCircuitBreakerSummary(alert: any): Promise<void> {
    try {
      const summaryKey = 'circuit_breakers:summary';
      const cachedSummary = await this.env.CACHE.get(summaryKey, 'json');
      
      let summary: any;
      if (cachedSummary) {
        summary = typeof cachedSummary === 'string' ? JSON.parse(cachedSummary) : cachedSummary;
      } else {
        summary = {
          totalBreakers: 0,
          openBreakers: [],
          recentAlerts: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Ensure openBreakers is an array
      if (!Array.isArray(summary.openBreakers)) {
        summary.openBreakers = [];
      }

      // Add to open breakers if not already there
      if (!summary.openBreakers.includes(alert.serviceKey)) {
        summary.openBreakers.push(alert.serviceKey);
      }

      summary.totalBreakers = summary.openBreakers.length;
      
      // Ensure recentAlerts is an array
      if (!Array.isArray(summary.recentAlerts)) {
        summary.recentAlerts = [];
      }
      
      summary.recentAlerts.unshift(alert);
      summary.recentAlerts = summary.recentAlerts.slice(0, 20); // Keep last 20
      summary.lastUpdated = new Date().toISOString();

      await this.env.CACHE.put(
        summaryKey,
        JSON.stringify(summary),
        { expirationTtl: 86400 } // 24 hours
      );
    } catch (error) {
      console.error('Failed to update circuit breaker summary:', error);
    }
  }

  /**
   * Get all circuit breaker statuses
   */
  async getAllCircuitBreakers(): Promise<{ [key: string]: CircuitBreakerStatus }> {
    try {
      const { keys } = await this.env.CACHE.list({ prefix: 'circuit:' });
      const statuses: { [key: string]: CircuitBreakerStatus } = {};

      for (const key of keys) {
        const serviceKey = key.name.replace('circuit:', '');
        const status = await this.env.CACHE.get(key.name, 'json') as CircuitBreakerStatus;
        if (status) {
          statuses[serviceKey] = status;
        }
      }

      return statuses;
    } catch (error) {
      console.error('Failed to get all circuit breakers:', error);
      return {};
    }
  }

  /**
   * Get circuit breaker summary
   */
  async getCircuitBreakerSummary(): Promise<any> {
    try {
      const summary = await this.env.CACHE.get('circuit_breakers:summary', 'json');
      return summary || {
        totalBreakers: 0,
        openBreakers: [],
        recentAlerts: [],
        lastUpdated: null,
      };
    } catch (error) {
      console.error('Failed to get circuit breaker summary:', error);
      return {
        totalBreakers: 0,
        openBreakers: [],
        recentAlerts: [],
        lastUpdated: null,
      };
    }
  }

  /**
   * Manually reset circuit breaker
   */
  async resetCircuitBreaker(serviceKey: string): Promise<void> {
    try {
      const status: CircuitBreakerStatus = {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        totalRequests: 0,
      };

      this.circuitBreakers.set(serviceKey, status);
      
      await this.env.CACHE.put(
        `circuit:${serviceKey}`,
        JSON.stringify(status),
        { expirationTtl: 3600 }
      );

      console.log(`Circuit breaker manually reset for ${serviceKey}`);
    } catch (error) {
      console.error('Failed to reset circuit breaker:', error);
      throw error;
    }
  }

  /**
   * Health check with automatic recovery
   */
  async performHealthCheck(serviceKey: string, healthCheckFn: () => Promise<boolean>): Promise<boolean> {
    try {
      const isHealthy = await this.executeWithCircuitBreaker(
        `health_${serviceKey}`,
        healthCheckFn,
        {
          failureThreshold: 3,
          recoveryTimeout: 30000, // 30 seconds for health checks
          monitoringWindow: 120000, // 2 minutes
        }
      );

      if (isHealthy) {
        // Service is healthy, ensure circuit is closed
        await this.updateCircuitBreakerState(`health_${serviceKey}`, 'CLOSED');
      }

      return isHealthy;
    } catch (error) {
      console.error(`Health check failed for ${serviceKey}:`, error);
      return false;
    }
  }

  /**
   * Utility function for sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}