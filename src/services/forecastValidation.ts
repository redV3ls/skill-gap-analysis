import { Database } from '../config/database';
import { logger } from '../utils/logger';

export interface ForecastAccuracyMetrics {
  skillName: string;
  forecastDate: string;
  actualValue: number;
  predictedValue: number;
  absoluteError: number;
  percentageError: number;
  forecastHorizon: string; // '3_months', '6_months', '1_year', '2_years'
}

export interface ValidationReport {
  overallAccuracy: number;
  skillAccuracies: Map<string, number>;
  horizonAccuracies: Map<string, number>;
  totalForecasts: number;
  validatedForecasts: number;
  averageAbsoluteError: number;
  averagePercentageError: number;
  bestPerformingSkills: string[];
  worstPerformingSkills: string[];
  recommendedImprovements: string[];
  validationDate: string;
}

export interface ForecastQualityScore {
  accuracy: number; // 0-1, higher is better
  reliability: number; // 0-1, consistency over time
  coverage: number; // 0-1, how many skills have forecasts
  timeliness: number; // 0-1, how recent are the forecasts
  overallScore: number; // weighted average
}

export class ForecastValidationService {
  constructor(private db: Database) {}

  /**
   * Validate forecast accuracy against actual observed data
   */
  async validateForecastAccuracy(
    validationPeriodMonths: number = 6
  ): Promise<ValidationReport> {
    try {
      logger.info('Starting forecast accuracy validation...');
      
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - validationPeriodMonths);
      
      // Get forecasts that should have materialized by now
      const forecastsToValidate = await this.getForecastsForValidation(cutoffDate);
      
      if (forecastsToValidate.length === 0) {
        logger.warn('No forecasts found for validation');
        return this.createEmptyReport();
      }
      
      // Validate each forecast
      const accuracyMetrics: ForecastAccuracyMetrics[] = [];
      
      for (const forecast of forecastsToValidate) {
        const metrics = await this.validateSingleForecast(forecast);
        if (metrics) {
          accuracyMetrics.push(metrics);
        }
      }
      
      // Generate comprehensive report
      const report = await this.generateValidationReport(accuracyMetrics);
      
      // Store validation results
      await this.storeValidationResults(accuracyMetrics);
      
      logger.info(`Validation completed: ${accuracyMetrics.length} forecasts validated`);
      return report;
    } catch (error) {
      logger.error('Error validating forecast accuracy:', error);
      throw new Error('Failed to validate forecast accuracy');
    }
  }

  /**
   * Calculate forecast quality score for the system
   */
  async calculateForecastQualityScore(): Promise<ForecastQualityScore> {
    try {
      // Calculate accuracy from recent validations
      const accuracy = await this.calculateOverallAccuracy();
      
      // Calculate reliability (consistency over time)
      const reliability = await this.calculateReliability();
      
      // Calculate coverage (how many skills have forecasts)
      const coverage = await this.calculateCoverage();
      
      // Calculate timeliness (how recent are forecasts)
      const timeliness = await this.calculateTimeliness();
      
      // Weighted overall score
      const weights = { accuracy: 0.4, reliability: 0.3, coverage: 0.2, timeliness: 0.1 };
      const overallScore = 
        accuracy * weights.accuracy +
        reliability * weights.reliability +
        coverage * weights.coverage +
        timeliness * weights.timeliness;
      
      return {
        accuracy,
        reliability,
        coverage,
        timeliness,
        overallScore
      };
    } catch (error) {
      logger.error('Error calculating forecast quality score:', error);
      throw new Error('Failed to calculate forecast quality score');
    }
  }

  /**
   * Get recommendations for improving forecast accuracy
   */
  async getForecastImprovementRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      const qualityScore = await this.calculateForecastQualityScore();
      
      // Accuracy recommendations
      if (qualityScore.accuracy < 0.7) {
        recommendations.push('Improve forecasting algorithms - consider ensemble methods');
        recommendations.push('Increase historical data collection frequency');
        recommendations.push('Add more external data sources for better predictions');
      }
      
      // Reliability recommendations
      if (qualityScore.reliability < 0.6) {
        recommendations.push('Implement model validation and cross-validation');
        recommendations.push('Add confidence intervals to forecasts');
        recommendations.push('Monitor and adjust for seasonal patterns');
      }
      
      // Coverage recommendations
      if (qualityScore.coverage < 0.8) {
        recommendations.push('Expand forecasting to more skills and regions');
        recommendations.push('Implement automated skill discovery from job postings');
        recommendations.push('Add forecasts for emerging skill categories');
      }
      
      // Timeliness recommendations
      if (qualityScore.timeliness < 0.8) {
        recommendations.push('Increase forecast update frequency');
        recommendations.push('Implement real-time data ingestion');
        recommendations.push('Set up automated forecast refresh schedules');
      }
      
      // Skill-specific recommendations
      const poorPerformingSkills = await this.identifyPoorPerformingSkills();
      if (poorPerformingSkills.length > 0) {
        recommendations.push(`Focus on improving forecasts for: ${poorPerformingSkills.slice(0, 3).join(', ')}`);
      }
      
      return recommendations;
    } catch (error) {
      logger.error('Error generating recommendations:', error);
      return ['Unable to generate recommendations - check system logs'];
    }
  }

  /**
   * Monitor forecast drift over time
   */
  async monitorForecastDrift(
    skillName: string,
    timeWindowMonths: number = 12
  ): Promise<{
    skillName: string;
    driftScore: number; // 0-1, higher means more drift
    trendDirection: 'improving' | 'degrading' | 'stable';
    recentAccuracy: number;
    historicalAccuracy: number;
    recommendations: string[];
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - timeWindowMonths);
      
      // Mock validation results for testing
      const recentResults = this.generateMockValidationResults(skillName, 10, true);
      const historicalResults = this.generateMockValidationResults(skillName, 20, false);
      
      const recent = recentResults || [];
      const historical = historicalResults || [];
      
      if (recent.length === 0 && historical.length === 0) {
        return {
          skillName,
          driftScore: 0,
          trendDirection: 'stable',
          recentAccuracy: 0,
          historicalAccuracy: 0,
          recommendations: ['Insufficient data for drift analysis']
        };
      }
      
      const recentAccuracy = this.calculateAccuracyFromErrors(recent);
      const historicalAccuracy = this.calculateAccuracyFromErrors(historical);
      
      // Calculate drift score
      const accuracyDiff = Math.abs(recentAccuracy - historicalAccuracy);
      const driftScore = Math.min(1, accuracyDiff * 2); // Scale to 0-1
      
      // Determine trend direction
      let trendDirection: 'improving' | 'degrading' | 'stable';
      if (recentAccuracy > historicalAccuracy + 0.05) {
        trendDirection = 'improving';
      } else if (recentAccuracy < historicalAccuracy - 0.05) {
        trendDirection = 'degrading';
      } else {
        trendDirection = 'stable';
      }
      
      // Generate recommendations
      const recommendations: string[] = [];
      if (driftScore > 0.3) {
        recommendations.push('High forecast drift detected - review model parameters');
      }
      if (trendDirection === 'degrading') {
        recommendations.push('Forecast accuracy is declining - consider model retraining');
      }
      if (recentAccuracy < 0.6) {
        recommendations.push('Low accuracy - increase data collection or try different algorithms');
      }
      
      return {
        skillName,
        driftScore,
        trendDirection,
        recentAccuracy,
        historicalAccuracy,
        recommendations
      };
    } catch (error) {
      logger.error(`Error monitoring drift for ${skillName}:`, error);
      throw new Error(`Failed to monitor forecast drift for ${skillName}`);
    }
  }

  /**
   * Private helper methods
   */
  private async getForecastsForValidation(cutoffDate: Date): Promise<any[]> {
    // Mock forecasts for validation
    const mockForecasts = [
      {
        skillName: 'JavaScript',
        industry: 'Technology',
        region: 'Global',
        currentValue: 0.85,
        forecast3Months: 0.87,
        forecast6Months: 0.89,
        forecast1Year: 0.92,
        forecast2Years: 0.95,
        confidence: 0.8,
        createdAt: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        skillName: 'Python',
        industry: 'Technology',
        region: 'Global',
        currentValue: 0.82,
        forecast3Months: 0.84,
        forecast6Months: 0.87,
        forecast1Year: 0.91,
        forecast2Years: 0.94,
        confidence: 0.85,
        createdAt: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    return mockForecasts;
  }

  private async validateSingleForecast(forecast: any): Promise<ForecastAccuracyMetrics | null> {
    try {
      const forecastDate = new Date(forecast.createdAt);
      const skillName = forecast.skillName;
      
      // Determine which forecast horizon to validate based on time elapsed
      const monthsElapsed = this.getMonthsElapsed(forecastDate);
      let predictedValue: number;
      let forecastHorizon: string;
      
      if (monthsElapsed >= 24 && forecast.forecast2Years) {
        predictedValue = forecast.forecast2Years;
        forecastHorizon = '2_years';
      } else if (monthsElapsed >= 12 && forecast.forecast1Year) {
        predictedValue = forecast.forecast1Year;
        forecastHorizon = '1_year';
      } else if (monthsElapsed >= 6 && forecast.forecast6Months) {
        predictedValue = forecast.forecast6Months;
        forecastHorizon = '6_months';
      } else if (monthsElapsed >= 3 && forecast.forecast3Months) {
        predictedValue = forecast.forecast3Months;
        forecastHorizon = '3_months';
      } else {
        return null; // Not enough time has passed
      }
      
      // Get actual value from recent demand history
      const actualValue = await this.getActualValue(skillName, forecastDate, monthsElapsed);
      
      if (actualValue === null) {
        return null; // No actual data available
      }
      
      // Calculate errors
      const absoluteError = Math.abs(actualValue - predictedValue);
      const percentageError = actualValue !== 0 ? (absoluteError / actualValue) * 100 : 0;
      
      return {
        skillName,
        forecastDate: forecast.createdAt,
        actualValue,
        predictedValue,
        absoluteError,
        percentageError,
        forecastHorizon
      };
    } catch (error) {
      logger.warn('Error validating single forecast:', error);
      return null;
    }
  }

  private async getActualValue(
    skillName: string,
    forecastDate: Date,
    monthsElapsed: number
  ): Promise<number | null> {
    const targetDate = new Date(forecastDate);
    targetDate.setMonth(targetDate.getMonth() + monthsElapsed);
    
    // Get demand score around the target date (±1 week)
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 7);
    
    // Mock actual demand value for validation
    const baseValue = 0.7 + Math.random() * 0.2; // 0.7-0.9
    const variance = (Math.random() - 0.5) * 0.1; // ±0.05 variance
    
    return Math.min(1, Math.max(0, baseValue + variance));
  }

  private async generateValidationReport(
    metrics: ForecastAccuracyMetrics[]
  ): Promise<ValidationReport> {
    if (metrics.length === 0) {
      return this.createEmptyReport();
    }
    
    // Calculate overall accuracy (1 - average percentage error)
    const avgPercentageError = metrics.reduce((sum, m) => sum + m.percentageError, 0) / metrics.length;
    const overallAccuracy = Math.max(0, 1 - (avgPercentageError / 100));
    
    // Calculate skill-specific accuracies
    const skillAccuracies = new Map<string, number>();
    const skillGroups = this.groupBy(metrics, m => m.skillName);
    
    for (const [skillName, skillMetrics] of skillGroups.entries()) {
      const skillAvgError = skillMetrics.reduce((sum, m) => sum + m.percentageError, 0) / skillMetrics.length;
      skillAccuracies.set(skillName, Math.max(0, 1 - (skillAvgError / 100)));
    }
    
    // Calculate horizon-specific accuracies
    const horizonAccuracies = new Map<string, number>();
    const horizonGroups = this.groupBy(metrics, m => m.forecastHorizon);
    
    for (const [horizon, horizonMetrics] of horizonGroups.entries()) {
      const horizonAvgError = horizonMetrics.reduce((sum, m) => sum + m.percentageError, 0) / horizonMetrics.length;
      horizonAccuracies.set(horizon, Math.max(0, 1 - (horizonAvgError / 100)));
    }
    
    // Identify best and worst performing skills
    const sortedSkills = Array.from(skillAccuracies.entries()).sort((a, b) => b[1] - a[1]);
    const bestPerformingSkills = sortedSkills.slice(0, 5).map(([skill]) => skill);
    const worstPerformingSkills = sortedSkills.slice(-5).map(([skill]) => skill);
    
    // Generate recommendations
    const recommendedImprovements = await this.generateImprovementRecommendations(
      overallAccuracy,
      skillAccuracies,
      horizonAccuracies
    );
    
    return {
      overallAccuracy,
      skillAccuracies,
      horizonAccuracies,
      totalForecasts: metrics.length,
      validatedForecasts: metrics.length,
      averageAbsoluteError: metrics.reduce((sum, m) => sum + m.absoluteError, 0) / metrics.length,
      averagePercentageError: avgPercentageError,
      bestPerformingSkills,
      worstPerformingSkills,
      recommendedImprovements,
      validationDate: new Date().toISOString()
    };
  }

  private async storeValidationResults(metrics: ForecastAccuracyMetrics[]): Promise<void> {
    // Mock storage - in production this would store in database
    logger.info(`Storing ${metrics.length} validation results`);
    for (const metric of metrics) {
      logger.info(`${metric.skillName}: ${(metric.percentageError).toFixed(1)}% error`);
    }
  }

  private createEmptyReport(): ValidationReport {
    return {
      overallAccuracy: 0,
      skillAccuracies: new Map(),
      horizonAccuracies: new Map(),
      totalForecasts: 0,
      validatedForecasts: 0,
      averageAbsoluteError: 0,
      averagePercentageError: 0,
      bestPerformingSkills: [],
      worstPerformingSkills: [],
      recommendedImprovements: ['No forecasts available for validation'],
      validationDate: new Date().toISOString()
    };
  }

  private async generateImprovementRecommendations(
    overallAccuracy: number,
    skillAccuracies: Map<string, number>,
    horizonAccuracies: Map<string, number>
  ): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (overallAccuracy < 0.6) {
      recommendations.push('Overall forecast accuracy is low - consider improving data quality and model algorithms');
    }
    
    // Check horizon-specific issues
    for (const [horizon, accuracy] of horizonAccuracies.entries()) {
      if (accuracy < 0.5) {
        recommendations.push(`${horizon} forecasts are particularly inaccurate - review time series models`);
      }
    }
    
    // Check for skills with consistently poor performance
    const poorSkills = Array.from(skillAccuracies.entries())
      .filter(([_, accuracy]) => accuracy < 0.4)
      .map(([skill]) => skill);
    
    if (poorSkills.length > 0) {
      recommendations.push(`Consider specialized models for: ${poorSkills.slice(0, 3).join(', ')}`);
    }
    
    return recommendations;
  }

  private async calculateOverallAccuracy(): Promise<number> {
    // Mock overall accuracy calculation
    return 0.75 + Math.random() * 0.2; // 75-95% accuracy
  }

  private async calculateReliability(): Promise<number> {
    // Mock reliability calculation
    return 0.65 + Math.random() * 0.25; // 65-90% reliability
  }

  private async calculateCoverage(): Promise<number> {
    // Mock coverage calculation
    return 0.6 + Math.random() * 0.3; // 60-90% coverage
  }

  private async calculateTimeliness(): Promise<number> {
    // Mock timeliness calculation
    return 0.7 + Math.random() * 0.25; // 70-95% timeliness
  }

  private async identifyPoorPerformingSkills(): Promise<string[]> {
    // Mock poor performing skills
    const poorSkills = ['Legacy Framework X', 'Outdated Tool Y'];
    return poorSkills;
  }

  private calculateAccuracyFromErrors(errors: any[]): number {
    if (errors.length === 0) return 0;
    
    const avgError = errors.reduce((sum, e) => sum + e.percentageError, 0) / errors.length;
    return Math.max(0, 1 - (avgError / 100));
  }

  private getMonthsElapsed(date: Date): number {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); // Average days per month
    return Math.floor(diffMonths);
  }

  private groupBy<T, K>(array: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();
    
    for (const item of array) {
      const key = keyFn(item);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }
    
    return groups;
  }

  private generateMockValidationResults(skillName: string, count: number, isRecent: boolean): any[] {
    const results = [];
    
    for (let i = 0; i < count; i++) {
      const baseError = isRecent ? 15 + Math.random() * 10 : 20 + Math.random() * 15; // Recent: 15-25%, Historical: 20-35%
      results.push({
        absoluteError: baseError / 100,
        percentageError: baseError,
        forecastDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
    
    return results;
  }
}