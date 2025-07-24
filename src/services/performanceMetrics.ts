import { Env } from '../index';

export interface PerformanceMetrics {
  timestamp: string;
  responseTime: {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  errorRates: {
    total: number;
    rate4xx: number;
    rate5xx: number;
    rateByEndpoint: { [endpoint: string]: number };
  };
  resources: {
    memoryUsage?: number;
    cpuUsage?: number;
    activeConnections: number;
  };
  endpoints: {
    [endpoint: string]: {
      requestCount: number;
      avgResponseTime: number;
      errorRate: number;
      slowestRequests: Array<{
        timestamp: string;
        duration: number;
        statusCode: number;
      }>;
    };
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  score: number; // 0-100
  indicators: {
    responseTime: { status: string; value: number; threshold: number };
    errorRate: { status: string; value: number; threshold: number };
    throughput: { status: string; value: number; threshold: number };
    availability: { status: string; value: number; threshold: number };
  };
  recommendations: string[];
}

export class PerformanceMetricsService {
  private env: Env;
  private readonly METRICS_TTL = 86400 * 7; // 7 days
  private readonly REALTIME_TTL = 300; // 5 minutes

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Get comprehensive performance dashboard data
   */
  async getDashboardMetrics(timeRange: '1h' | '24h' | '7d' = '24h'): Promise<{
    current: PerformanceMetrics;
    historical: PerformanceMetrics[];
    health: SystemHealth;
    alerts: any[];
    trends: {
      responseTime: Array<{ timestamp: string; value: number }>;
      throughput: Array<{ timestamp: string; value: number }>;
      errorRate: Array<{ timestamp: string; value: number }>;
    };
  }> {
    const [current, historical, health, alerts] = await Promise.all([
      this.getCurrentMetrics(),
      this.getHistoricalMetrics(timeRange),
      this.getSystemHealth(),
      this.getPerformanceAlerts(),
    ]);

    const trends = this.calculateTrends(historical);

    return {
      current,
      historical,
      health,
      alerts,
      trends,
    };
  }

  /**
   * Get current performance metrics
   */
  async getCurrentMetrics(): Promise<PerformanceMetrics> {
    try {
      const currentHour = new Date().toISOString().slice(0, 13);
      const metricsKey = `metrics:${currentHour}`;
      
      const rawMetrics = await this.env.CACHE.get(metricsKey, 'json') as any || {
        totalRequests: 0,
        totalDuration: 0,
        statusCodes: {},
        endpoints: {},
        slowRequests: [],
        responseTimes: [],
      };

      // Calculate response time percentiles
      const responseTimes = rawMetrics.responseTimes || [];
      const sortedTimes = responseTimes.sort((a: number, b: number) => a - b);
      
      const responseTime = {
        avg: rawMetrics.totalRequests > 0 ? rawMetrics.totalDuration / rawMetrics.totalRequests : 0,
        p50: this.getPercentile(sortedTimes, 50),
        p95: this.getPercentile(sortedTimes, 95),
        p99: this.getPercentile(sortedTimes, 99),
        min: sortedTimes[0] || 0,
        max: sortedTimes[sortedTimes.length - 1] || 0,
      };

      // Calculate throughput
      const throughput = {
        requestsPerSecond: rawMetrics.totalRequests / 3600, // Assuming hourly data
        requestsPerMinute: rawMetrics.totalRequests / 60,
        requestsPerHour: rawMetrics.totalRequests,
      };

      // Calculate error rates
      const total4xx = Object.entries(rawMetrics.statusCodes)
        .filter(([code]) => code.startsWith('4'))
        .reduce((sum, [, count]) => sum + (count as number), 0);
      
      const total5xx = Object.entries(rawMetrics.statusCodes)
        .filter(([code]) => code.startsWith('5'))
        .reduce((sum, [, count]) => sum + (count as number), 0);

      const errorRates = {
        total: (total4xx + total5xx) / Math.max(rawMetrics.totalRequests, 1),
        rate4xx: total4xx / Math.max(rawMetrics.totalRequests, 1),
        rate5xx: total5xx / Math.max(rawMetrics.totalRequests, 1),
        rateByEndpoint: this.calculateEndpointErrorRates(rawMetrics.endpoints),
      };

      // Process endpoint metrics
      const endpoints = this.processEndpointMetrics(rawMetrics.endpoints);

      return {
        timestamp: new Date().toISOString(),
        responseTime,
        throughput,
        errorRates,
        resources: {
          activeConnections: rawMetrics.totalRequests, // Approximation
        },
        endpoints,
      };
    } catch (error) {
      console.error('Failed to get current metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Get historical metrics
   */
  async getHistoricalMetrics(timeRange: '1h' | '24h' | '7d'): Promise<PerformanceMetrics[]> {
    const metrics: PerformanceMetrics[] = [];
    const now = new Date();
    let hours: number;

    switch (timeRange) {
      case '1h':
        hours = 1;
        break;
      case '24h':
        hours = 24;
        break;
      case '7d':
        hours = 24 * 7;
        break;
    }

    try {
      for (let i = 0; i < hours; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hourKey = timestamp.toISOString().slice(0, 13);
        const metricsKey = `metrics:${hourKey}`;
        
        const rawMetrics = await this.env.CACHE.get(metricsKey, 'json') as any;
        if (rawMetrics) {
          // Convert raw metrics to PerformanceMetrics format
          const processedMetrics = await this.processRawMetrics(rawMetrics, timestamp.toISOString());
          metrics.push(processedMetrics);
        }
      }

      return metrics.reverse(); // Chronological order
    } catch (error) {
      console.error('Failed to get historical metrics:', error);
      return [];
    }
  }

  /**
   * Get system health assessment
   */
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const current = await this.getCurrentMetrics();
      const indicators = {
        responseTime: this.assessResponseTime(current.responseTime.avg),
        errorRate: this.assessErrorRate(current.errorRates.total),
        throughput: this.assessThroughput(current.throughput.requestsPerSecond),
        availability: await this.assessAvailability(),
      };

      // Calculate overall health score
      const scores = Object.values(indicators).map(i => this.getIndicatorScore(i.status));
      const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;

      // Determine overall status
      let status: SystemHealth['status'] = 'healthy';
      if (score < 50) status = 'critical';
      else if (score < 80) status = 'degraded';

      // Generate recommendations
      const recommendations = this.generateRecommendations(indicators);

      return {
        status,
        score,
        indicators,
        recommendations,
      };
    } catch (error) {
      console.error('Failed to assess system health:', error);
      return {
        status: 'critical',
        score: 0,
        indicators: {
          responseTime: { status: 'unknown', value: 0, threshold: 1000 },
          errorRate: { status: 'unknown', value: 0, threshold: 0.05 },
          throughput: { status: 'unknown', value: 0, threshold: 10 },
          availability: { status: 'unknown', value: 0, threshold: 0.99 },
        },
        recommendations: ['System health assessment failed - check monitoring service'],
      };
    }
  }

  /**
   * Get performance alerts
   */
  async getPerformanceAlerts(): Promise<any[]> {
    try {
      const alerts = [];
      const { keys } = await this.env.CACHE.list({ prefix: 'perf_alert:' });

      for (const key of keys) {
        const alert = await this.env.CACHE.get(key.name, 'json');
        if (alert) {
          alerts.push(alert);
        }
      }

      return alerts.sort((a: any, b: any) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Failed to get performance alerts:', error);
      return [];
    }
  }

  /**
   * Record performance alert
   */
  async recordPerformanceAlert(
    type: 'HIGH_RESPONSE_TIME' | 'HIGH_ERROR_RATE' | 'LOW_THROUGHPUT' | 'SERVICE_DEGRADATION',
    details: any
  ): Promise<void> {
    const alert = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      details,
      severity: this.getAlertSeverity(type, details),
    };

    try {
      const alertKey = `perf_alert:${alert.id}`;
      await this.env.CACHE.put(
        alertKey,
        JSON.stringify(alert),
        { expirationTtl: 86400 * 3 } // 3 days
      );

      console.warn(`Performance Alert [${type}]:`, details);
    } catch (error) {
      console.error('Failed to record performance alert:', error);
    }
  }

  /**
   * Monitor and alert on performance thresholds
   */
  async checkPerformanceThresholds(): Promise<void> {
    const current = await this.getCurrentMetrics();

    // Check response time threshold
    if (current.responseTime.avg > 2000) { // 2 seconds
      await this.recordPerformanceAlert('HIGH_RESPONSE_TIME', {
        avgResponseTime: current.responseTime.avg,
        p95ResponseTime: current.responseTime.p95,
        threshold: 2000,
      });
    }

    // Check error rate threshold
    if (current.errorRates.total > 0.05) { // 5%
      await this.recordPerformanceAlert('HIGH_ERROR_RATE', {
        errorRate: current.errorRates.total,
        rate4xx: current.errorRates.rate4xx,
        rate5xx: current.errorRates.rate5xx,
        threshold: 0.05,
      });
    }

    // Check throughput threshold
    if (current.throughput.requestsPerSecond < 1) { // Very low throughput
      await this.recordPerformanceAlert('LOW_THROUGHPUT', {
        requestsPerSecond: current.throughput.requestsPerSecond,
        requestsPerHour: current.throughput.requestsPerHour,
        threshold: 1,
      });
    }
  }

  /**
   * Private helper methods
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  private calculateEndpointErrorRates(endpoints: any): { [endpoint: string]: number } {
    const rates: { [endpoint: string]: number } = {};
    
    for (const [endpoint, data] of Object.entries(endpoints as any)) {
      const errorCount = (data as any).errors || 0;
      const totalCount = (data as any).count || 1;
      rates[endpoint] = errorCount / totalCount;
    }
    
    return rates;
  }

  private processEndpointMetrics(rawEndpoints: any): PerformanceMetrics['endpoints'] {
    const processed: PerformanceMetrics['endpoints'] = {};
    
    for (const [endpoint, data] of Object.entries(rawEndpoints as any)) {
      const endpointData = data as any;
      processed[endpoint] = {
        requestCount: endpointData.count || 0,
        avgResponseTime: endpointData.avgDuration || 0,
        errorRate: (endpointData.errors || 0) / Math.max(endpointData.count || 1, 1),
        slowestRequests: endpointData.slowRequests || [],
      };
    }
    
    return processed;
  }

  private async processRawMetrics(rawMetrics: any, timestamp: string): Promise<PerformanceMetrics> {
    // Similar to getCurrentMetrics but for historical data
    const responseTimes = rawMetrics.responseTimes || [];
    const sortedTimes = responseTimes.sort((a: number, b: number) => a - b);
    
    return {
      timestamp,
      responseTime: {
        avg: rawMetrics.totalRequests > 0 ? rawMetrics.totalDuration / rawMetrics.totalRequests : 0,
        p50: this.getPercentile(sortedTimes, 50),
        p95: this.getPercentile(sortedTimes, 95),
        p99: this.getPercentile(sortedTimes, 99),
        min: sortedTimes[0] || 0,
        max: sortedTimes[sortedTimes.length - 1] || 0,
      },
      throughput: {
        requestsPerSecond: rawMetrics.totalRequests / 3600,
        requestsPerMinute: rawMetrics.totalRequests / 60,
        requestsPerHour: rawMetrics.totalRequests,
      },
      errorRates: {
        total: 0, // Calculate from status codes
        rate4xx: 0,
        rate5xx: 0,
        rateByEndpoint: {},
      },
      resources: {
        activeConnections: rawMetrics.totalRequests,
      },
      endpoints: this.processEndpointMetrics(rawMetrics.endpoints || {}),
    };
  }

  private calculateTrends(historical: PerformanceMetrics[]): any {
    return {
      responseTime: historical.map(m => ({
        timestamp: m.timestamp,
        value: m.responseTime.avg,
      })),
      throughput: historical.map(m => ({
        timestamp: m.timestamp,
        value: m.throughput.requestsPerSecond,
      })),
      errorRate: historical.map(m => ({
        timestamp: m.timestamp,
        value: m.errorRates.total,
      })),
    };
  }

  private assessResponseTime(avgResponseTime: number): any {
    const threshold = 1000; // 1 second
    let status = 'healthy';
    
    if (avgResponseTime > threshold * 2) status = 'critical';
    else if (avgResponseTime > threshold) status = 'degraded';
    
    return { status, value: avgResponseTime, threshold };
  }

  private assessErrorRate(errorRate: number): any {
    const threshold = 0.05; // 5%
    let status = 'healthy';
    
    if (errorRate > threshold * 2) status = 'critical';
    else if (errorRate > threshold) status = 'degraded';
    
    return { status, value: errorRate, threshold };
  }

  private assessThroughput(requestsPerSecond: number): any {
    const threshold = 10; // 10 RPS minimum
    let status = 'healthy';
    
    if (requestsPerSecond < threshold / 2) status = 'critical';
    else if (requestsPerSecond < threshold) status = 'degraded';
    
    return { status, value: requestsPerSecond, threshold };
  }

  private async assessAvailability(): Promise<any> {
    // Calculate uptime based on successful requests
    const threshold = 0.99; // 99% availability
    // This would be calculated from actual uptime data
    const availability = 0.995; // Placeholder
    
    let status = 'healthy';
    if (availability < threshold * 0.95) status = 'critical';
    else if (availability < threshold) status = 'degraded';
    
    return { status, value: availability, threshold };
  }

  private getIndicatorScore(status: string): number {
    switch (status) {
      case 'healthy': return 100;
      case 'degraded': return 60;
      case 'critical': return 20;
      default: return 0;
    }
  }

  private generateRecommendations(indicators: any): string[] {
    const recommendations: string[] = [];
    
    if (indicators.responseTime.status !== 'healthy') {
      recommendations.push('Consider optimizing database queries and adding caching');
    }
    
    if (indicators.errorRate.status !== 'healthy') {
      recommendations.push('Review error logs and implement better error handling');
    }
    
    if (indicators.throughput.status !== 'healthy') {
      recommendations.push('Scale up resources or optimize request processing');
    }
    
    if (indicators.availability.status !== 'healthy') {
      recommendations.push('Investigate service outages and implement redundancy');
    }
    
    return recommendations;
  }

  private getAlertSeverity(type: string, details: any): 'low' | 'medium' | 'high' | 'critical' {
    switch (type) {
      case 'HIGH_RESPONSE_TIME':
        return details.avgResponseTime > 5000 ? 'critical' : 'high';
      case 'HIGH_ERROR_RATE':
        return details.errorRate > 0.1 ? 'critical' : 'high';
      case 'LOW_THROUGHPUT':
        return details.requestsPerSecond < 0.1 ? 'critical' : 'medium';
      default:
        return 'medium';
    }
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      timestamp: new Date().toISOString(),
      responseTime: { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 },
      throughput: { requestsPerSecond: 0, requestsPerMinute: 0, requestsPerHour: 0 },
      errorRates: { total: 0, rate4xx: 0, rate5xx: 0, rateByEndpoint: {} },
      resources: { activeConnections: 0 },
      endpoints: {},
    };
  }
}