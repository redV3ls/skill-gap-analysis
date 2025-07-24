import { Hono } from 'hono';
import { Env } from '../index';
import { AuthenticatedContext, requireAuth } from '../middleware/auth';
import { CacheService } from '../services/cache';
import { QueryOptimizer } from '../utils/queryOptimizer';
import { DatabaseManager } from '../services/databaseManager';
import { ErrorTrackingService } from '../services/errorTracking';
import { LoggingService } from '../services/logging';

const monitoring = new Hono<{ Bindings: Env }>();

// Apply authentication to monitoring routes
monitoring.use('*', requireAuth);

/**
 * GET /monitoring/cache/stats - Get cache statistics
 */
monitoring.get('/cache/stats', async (c: AuthenticatedContext) => {
  try {
    const cacheService = new CacheService(c.env.CACHE);
    const stats = await cacheService.getStats();
    
    return c.json({
      cache: {
        ...stats,
        status: 'operational',
        backend: 'Cloudflare KV'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return c.json({
      cache: {
        status: 'error',
        error: 'Failed to retrieve cache statistics'
      },
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * POST /monitoring/cache/clear - Clear cache by namespace
 */
monitoring.post('/cache/clear', async (c: AuthenticatedContext) => {
  try {
    const { namespace } = await c.req.json();
    
    if (!namespace) {
      return c.json({
        error: 'Namespace is required'
      }, 400);
    }
    
    const cacheService = new CacheService(c.env.CACHE);
    await cacheService.clearNamespace(namespace);
    
    return c.json({
      message: `Cache cleared for namespace: ${namespace}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return c.json({
      error: 'Failed to clear cache'
    }, 500);
  }
});

/**
 * GET /monitoring/performance - Get performance metrics
 */
monitoring.get('/performance', async (c: AuthenticatedContext) => {
  try {
    // Get request metrics from KV (if we're tracking them)
    const metricsKey = `metrics:${new Date().toISOString().split('T')[0]}`;
    const metrics = await c.env.CACHE.get(metricsKey, 'json') || {
      requests: 0,
      avgResponseTime: 0,
      errors: 0
    };
    
    return c.json({
      performance: {
        daily: metrics,
        uptime: process.uptime ? process.uptime() : 'N/A',
        memory: process.memoryUsage ? process.memoryUsage() : 'N/A'
      },
      cloudflare: {
        colo: c.req.header('CF-RAY')?.split('-')[1] || 'unknown',
        country: c.req.header('CF-IPCountry') || 'unknown'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    return c.json({
      error: 'Failed to retrieve performance metrics'
    }, 500);
  }
});

/**
 * GET /monitoring/database/metrics - Get database query metrics
 */
monitoring.get('/database/metrics', async (c: AuthenticatedContext) => {
  try {
    const cacheService = new CacheService(c.env.CACHE);
    const dbManager = new DatabaseManager(c.env.DB, cacheService);
    const metrics = dbManager.getMetrics();
    
    return c.json({
      database: {
        ...metrics,
        status: 'operational',
        backend: 'Cloudflare D1'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting database metrics:', error);
    return c.json({
      error: 'Failed to retrieve database metrics'
    }, 500);
  }
});

/**
 * GET /monitoring/database/indexes - Get database index recommendations
 */
monitoring.get('/database/indexes', async (c: AuthenticatedContext) => {
  try {
    const optimizer = new QueryOptimizer(c.env.DB);
    const tables = [
      'users',
      'skills',
      'gap_analyses',
      'team_analyses',
      'skill_demand_history',
      'emerging_skills',
      'regional_skill_trends',
      'market_forecasts'
    ];
    
    const recommendations: { [key: string]: string[] } = {};
    
    for (const table of tables) {
      try {
        const tableRecommendations = await optimizer.analyzeAndOptimize(table);
        if (tableRecommendations.length > 0) {
          recommendations[table] = tableRecommendations;
        }
      } catch (error) {
        console.error(`Error analyzing table ${table}:`, error);
      }
    }
    
    return c.json({
      recommendations,
      totalRecommendations: Object.values(recommendations).flat().length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting index recommendations:', error);
    return c.json({
      error: 'Failed to analyze database indexes'
    }, 500);
  }
});

/**
 * GET /monitoring/jobs/stats - Get async job statistics
 */
monitoring.get('/jobs/stats', async (c: AuthenticatedContext) => {
  try {
    const cacheService = new CacheService(c.env.CACHE);
    
    // Get scheduler stats
    const schedulerStats = await cacheService.get('scheduler:stats');
    
    // Get last scheduled run info
    const lastRun = await cacheService.get('scheduled_run:last');
    
    // Count jobs by status
    const { keys } = await c.env.CACHE.list({ prefix: 'job:' });
    const jobCounts = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    
    for (const key of keys) {
      const job = await c.env.CACHE.get(key.name, 'json') as any;
      if (job) {
        jobCounts.total++;
        jobCounts[job.status] = (jobCounts[job.status] || 0) + 1;
      }
    }
    
    return c.json({
      jobs: jobCounts,
      scheduler: schedulerStats || { status: 'no data' },
      lastScheduledRun: lastRun || { status: 'never run' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting job stats:', error);
    return c.json({
      error: 'Failed to retrieve job statistics'
    }, 500);
  }
});

/**
 * GET /monitoring/errors/stats - Get error statistics
 */
monitoring.get('/errors/stats', async (c: AuthenticatedContext) => {
  try {
    const errorTracking = new ErrorTrackingService(c.env);
    const stats = await errorTracking.getErrorStats();
    
    return c.json({
      errors: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting error stats:', error);
    return c.json({
      error: 'Failed to retrieve error statistics'
    }, 500);
  }
});

/**
 * GET /monitoring/errors/:errorId - Get specific error details
 */
monitoring.get('/errors/:errorId', async (c: AuthenticatedContext) => {
  try {
    const errorId = c.req.param('errorId');
    const errorTracking = new ErrorTrackingService(c.env);
    const error = await errorTracking.getError(errorId);
    
    if (!error) {
      return c.json({
        error: 'Error record not found'
      }, 404);
    }
    
    return c.json(error);
  } catch (error) {
    console.error('Error getting error details:', error);
    return c.json({
      error: 'Failed to retrieve error details'
    }, 500);
  }
});

/**
 * GET /monitoring/errors - Query errors with filters
 */
monitoring.get('/errors', async (c: AuthenticatedContext) => {
  try {
    const code = c.req.query('code');
    const level = c.req.query('level');
    const startTime = c.req.query('startTime');
    const endTime = c.req.query('endTime');
    const limit = parseInt(c.req.query('limit') || '100');
    
    const errorTracking = new ErrorTrackingService(c.env);
    const errors = await errorTracking.getErrors({
      code,
      level,
      startTime,
      endTime,
      limit,
    });
    
    return c.json({
      errors,
      count: errors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error querying errors:', error);
    return c.json({
      error: 'Failed to query errors'
    }, 500);
  }
});

/**
 * GET /monitoring/logs/stats - Get log statistics
 */
monitoring.get('/logs/stats', async (c: AuthenticatedContext) => {
  try {
    const hours = parseInt(c.req.query('hours') || '24');
    const logging = new LoggingService(c.env);
    const stats = await logging.getLogStats(hours);
    
    return c.json({
      logs: stats,
      period: `${hours} hours`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting log stats:', error);
    return c.json({
      error: 'Failed to retrieve log statistics'
    }, 500);
  }
});

/**
 * GET /monitoring/logs - Query logs with filters
 */
monitoring.get('/logs', async (c: AuthenticatedContext) => {
  try {
    const level = c.req.query('level') as any;
    const startTime = c.req.query('startTime');
    const endTime = c.req.query('endTime');
    const userId = c.req.query('userId');
    const path = c.req.query('path');
    const limit = parseInt(c.req.query('limit') || '100');
    
    const logging = new LoggingService(c.env);
    const logs = await logging.queryLogs({
      level,
      startTime,
      endTime,
      userId,
      path,
      limit,
    });
    
    return c.json({
      logs,
      count: logs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error querying logs:', error);
    return c.json({
      error: 'Failed to query logs'
    }, 500);
  }
});

/**
 * POST /monitoring/cleanup - Clean up old logs and errors
 */
monitoring.post('/cleanup', async (c: AuthenticatedContext) => {
  try {
    const { daysToKeep = 7 } = await c.req.json();
    
    const errorTracking = new ErrorTrackingService(c.env);
    const logging = new LoggingService(c.env);
    
    const [clearedErrors, clearedLogs] = await Promise.all([
      errorTracking.clearOldErrors(daysToKeep),
      logging.cleanupOldLogs(daysToKeep),
    ]);
    
    return c.json({
      message: 'Cleanup completed',
      clearedErrors,
      clearedLogs,
      daysKept: daysToKeep,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    return c.json({
      error: 'Failed to perform cleanup'
    }, 500);
  }
});

/**
 * GET /monitoring/dashboard - Get comprehensive performance dashboard
 */
monitoring.get('/dashboard', async (c: AuthenticatedContext) => {
  try {
    const timeRange = c.req.query('timeRange') as '1h' | '24h' | '7d' || '24h';
    
    const { PerformanceMetricsService } = await import('../services/performanceMetrics');
    const performanceService = new PerformanceMetricsService(c.env);
    
    const dashboard = await performanceService.getDashboardMetrics(timeRange);
    
    return c.json({
      dashboard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting dashboard metrics:', error);
    return c.json({
      error: 'Failed to retrieve dashboard metrics'
    }, 500);
  }
});

/**
 * GET /monitoring/alerts/summary - Get alert summary
 */
monitoring.get('/alerts/summary', async (c: AuthenticatedContext) => {
  try {
    const errorTracking = new ErrorTrackingService(c.env);
    const { ErrorRecoveryService } = await import('../services/errorRecovery');
    const recoveryService = new ErrorRecoveryService(c.env);
    
    const [errorAlerts, circuitBreakerSummary] = await Promise.all([
      errorTracking.getAlertSummary(),
      recoveryService.getCircuitBreakerSummary(),
    ]);
    
    return c.json({
      alerts: {
        errors: errorAlerts,
        circuitBreakers: circuitBreakerSummary,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting alert summary:', error);
    return c.json({
      error: 'Failed to retrieve alert summary'
    }, 500);
  }
});

/**
 * GET /monitoring/circuit-breakers - Get all circuit breaker statuses
 */
monitoring.get('/circuit-breakers', async (c: AuthenticatedContext) => {
  try {
    const { ErrorRecoveryService } = await import('../services/errorRecovery');
    const recoveryService = new ErrorRecoveryService(c.env);
    
    const circuitBreakers = await recoveryService.getAllCircuitBreakers();
    
    return c.json({
      circuitBreakers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting circuit breakers:', error);
    return c.json({
      error: 'Failed to retrieve circuit breaker status'
    }, 500);
  }
});

/**
 * POST /monitoring/circuit-breakers/:serviceKey/reset - Reset circuit breaker
 */
monitoring.post('/circuit-breakers/:serviceKey/reset', async (c: AuthenticatedContext) => {
  try {
    const serviceKey = c.req.param('serviceKey');
    
    const { ErrorRecoveryService } = await import('../services/errorRecovery');
    const recoveryService = new ErrorRecoveryService(c.env);
    
    await recoveryService.resetCircuitBreaker(serviceKey);
    
    return c.json({
      message: `Circuit breaker reset for ${serviceKey}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error resetting circuit breaker:', error);
    return c.json({
      error: 'Failed to reset circuit breaker'
    }, 500);
  }
});

/**
 * GET /monitoring/escalations - Get escalated alerts
 */
monitoring.get('/escalations', async (c: AuthenticatedContext) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    
    const errorTracking = new ErrorTrackingService(c.env);
    const escalations = await errorTracking.getEscalations(limit);
    
    return c.json({
      escalations,
      count: escalations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting escalations:', error);
    return c.json({
      error: 'Failed to retrieve escalations'
    }, 500);
  }
});

/**
 * GET /monitoring/health/indicators - Get system health indicators
 */
monitoring.get('/health/indicators', async (c: AuthenticatedContext) => {
  try {
    const errorTracking = new ErrorTrackingService(c.env);
    const { PerformanceMetricsService } = await import('../services/performanceMetrics');
    const performanceService = new PerformanceMetricsService(c.env);
    
    const [healthIndicators, systemHealth] = await Promise.all([
      errorTracking.getHealthIndicators(),
      performanceService.getSystemHealth(),
    ]);
    
    return c.json({
      health: {
        ...healthIndicators,
        performance: systemHealth,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting health indicators:', error);
    return c.json({
      error: 'Failed to retrieve health indicators'
    }, 500);
  }
});

/**
 * POST /monitoring/performance/check-thresholds - Manually trigger performance threshold check
 */
monitoring.post('/performance/check-thresholds', async (c: AuthenticatedContext) => {
  try {
    const { PerformanceMetricsService } = await import('../services/performanceMetrics');
    const performanceService = new PerformanceMetricsService(c.env);
    
    await performanceService.checkPerformanceThresholds();
    
    return c.json({
      message: 'Performance threshold check completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error checking performance thresholds:', error);
    return c.json({
      error: 'Failed to check performance thresholds'
    }, 500);
  }
});

/**
 * GET /monitoring/health/dependencies - Check health of all dependencies
 */
monitoring.get('/health/dependencies', async (c: AuthenticatedContext) => {
  const results: { [key: string]: { status: string; latency?: number; error?: string } } = {};
  
  // Check D1 Database
  try {
    const start = Date.now();
    await c.env.DB.prepare('SELECT 1').first();
    results.database = {
      status: 'healthy',
      latency: Date.now() - start
    };
  } catch (error) {
    results.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
  
  // Check KV Cache
  try {
    const start = Date.now();
    const testKey = `health_check_${Date.now()}`;
    await c.env.CACHE.put(testKey, 'ok', { expirationTtl: 60 });
    const result = await c.env.CACHE.get(testKey);
    await c.env.CACHE.delete(testKey);
    
    results.cache = {
      status: result === 'ok' ? 'healthy' : 'degraded',
      latency: Date.now() - start
    };
  } catch (error) {
    results.cache = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
  
  // Overall health
  const overallHealth = Object.values(results).every(r => r.status === 'healthy') 
    ? 'healthy' 
    : Object.values(results).some(r => r.status === 'unhealthy') 
    ? 'unhealthy' 
    : 'degraded';
  
  return c.json({
    status: overallHealth,
    dependencies: results,
    timestamp: new Date().toISOString()
  });
});

export default monitoring;
