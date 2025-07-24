import { Database } from '../config/database';
import { logger } from '../utils/logger';
import { TrendsAnalysisService } from './trendsAnalysis';
import { JobApiCollector } from './jobApiCollector';
import * as schema from '../db/schema';
import { sql, lt } from 'drizzle-orm';

export interface TrendComputationConfig {
  updateFrequency: 'hourly' | 'daily' | 'weekly';
  enabledJobs: string[];
  dataRetentionDays: number;
  forecastHorizonMonths: number;
}

export interface ComputationJobResult {
  jobName: string;
  status: 'success' | 'error' | 'partial';
  recordsProcessed: number;
  recordsUpdated: number;
  executionTimeMs: number;
  errors?: string[];
  lastRun: string;
}

export class TrendComputationJobs {
  private trendsService: TrendsAnalysisService;
  private jobCollector: JobApiCollector;
  private isRunning: boolean = false;

  private readonly defaultConfig: TrendComputationConfig = {
    updateFrequency: 'daily',
    enabledJobs: [
      'updateSkillDemandTrends',
      'computeEmergingSkills',
      'updateRegionalTrends',
      'generateForecasts',
      'cleanupOldData'
    ],
    dataRetentionDays: 365,
    forecastHorizonMonths: 24
  };

  constructor(private db: Database) {
    this.trendsService = new TrendsAnalysisService(db);
    this.jobCollector = new JobApiCollector(db);
  }

  /**
   * Run all enabled trend computation jobs
   */
  async runAllJobs(config: Partial<TrendComputationConfig> = {}): Promise<ComputationJobResult[]> {
    if (this.isRunning) {
      throw new Error('Trend computation jobs are already running');
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    this.isRunning = true;
    
    try {
      logger.info('Starting automated trend computation jobs...');
      const results: ComputationJobResult[] = [];
      
      for (const jobName of finalConfig.enabledJobs) {
        try {
          const result = await this.runSingleJob(jobName, finalConfig);
          results.push(result);
          
          // Add delay between jobs to prevent overwhelming the system
          await this.delay(2000);
        } catch (error) {
          logger.error(`Error running job ${jobName}:`, error);
          results.push({
            jobName,
            status: 'error',
            recordsProcessed: 0,
            recordsUpdated: 0,
            executionTimeMs: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            lastRun: new Date().toISOString()
          });
        }
      }
      
      // Log summary
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;
      
      logger.info(`Trend computation completed: ${successCount} successful, ${errorCount} failed`);
      
      return results;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run a single computation job
   */
  private async runSingleJob(jobName: string, config: TrendComputationConfig): Promise<ComputationJobResult> {
    const startTime = Date.now();
    logger.info(`Starting job: ${jobName}`);
    
    try {
      let result: ComputationJobResult;
      
      switch (jobName) {
        case 'updateSkillDemandTrends':
          result = await this.updateSkillDemandTrends();
          break;
        case 'computeEmergingSkills':
          result = await this.computeEmergingSkills();
          break;
        case 'updateRegionalTrends':
          result = await this.updateRegionalTrends();
          break;
        case 'generateForecasts':
          result = await this.generateForecasts(config.forecastHorizonMonths);
          break;
        case 'cleanupOldData':
          result = await this.cleanupOldData(config.dataRetentionDays);
          break;
        case 'collectExternalData':
          result = await this.collectExternalData();
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }
      
      result.executionTimeMs = Date.now() - startTime;
      result.lastRun = new Date().toISOString();
      
      logger.info(`Job ${jobName} completed successfully in ${result.executionTimeMs}ms`);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(`Job ${jobName} failed after ${executionTime}ms:`, error);
      
      return {
        jobName,
        status: 'error',
        recordsProcessed: 0,
        recordsUpdated: 0,
        executionTimeMs: executionTime,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Update skill demand trends from historical data
   */
  private async updateSkillDemandTrends(): Promise<ComputationJobResult> {
    let recordsProcessed = 0;
    let recordsUpdated = 0;
    
    try {
      // Get all unique skills from demand history (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // For now, use mock data since we're working with sample data
      const mockSkills = [
        'JavaScript', 'Python', 'React', 'TypeScript', 'Node.js',
        'Machine Learning', 'AWS', 'Docker', 'Kubernetes', 'SQL'
      ];
      
      recordsProcessed = mockSkills.length;
      
      for (const skillName of mockSkills) {
        // Calculate trend metrics for this skill
        const trendData = await this.calculateSkillTrend(skillName);
        
        if (trendData) {
          // Update or insert industry trends using Drizzle ORM
          const trendId = `trend-${skillName.replace(/\s+/g, '-')}-technology-global`;
          
          // Insert or update the trend record
          await this.db.insert(schema.industryTrends).values({
            id: trendId,
            skillName,
            industry: 'Technology',
            region: 'Global',
            demandScore: trendData.currentDemand,
            growthRate: trendData.growthRate,
            averageSalary: trendData.averageSalary,
            jobOpenings: trendData.jobCount,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }).onConflictDoUpdate({
            target: schema.industryTrends.id,
            set: {
              demandScore: trendData.currentDemand,
              growthRate: trendData.growthRate,
              averageSalary: trendData.averageSalary,
              jobOpenings: trendData.jobCount,
              updatedAt: new Date().toISOString()
            }
          });
          
          recordsUpdated++;
        }
      }
      
      return {
        jobName: 'updateSkillDemandTrends',
        status: 'success',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0, // Will be set by caller
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error updating skill demand trends:', error);
      return {
        jobName: 'updateSkillDemandTrends',
        status: 'error',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Compute and update emerging skills
   */
  private async computeEmergingSkills(): Promise<ComputationJobResult> {
    let recordsProcessed = 0;
    let recordsUpdated = 0;
    
    try {
      // Analyze growth velocity for all skills
      const velocityMap = await this.trendsService.analyzeGrowthVelocity(6);
      recordsProcessed = velocityMap.size;
      
      // Identify skills with high growth velocity as emerging
      const emergingThreshold = 0.3; // 30% growth velocity
      const emergingSkills: Array<{
        skillName: string;
        velocity: number;
        emergenceScore: number;
      }> = [];
      
      for (const [skillName, velocity] of velocityMap.entries()) {
        if (velocity > emergingThreshold) {
          const emergenceScore = Math.min(1, velocity * 2); // Scale to 0-1
          emergingSkills.push({ skillName, velocity, emergenceScore });
        }
      }
      
      // Update emerging skills table using Drizzle ORM
      for (const skill of emergingSkills) {
        const relatedSkills = await this.findRelatedSkills(skill.skillName);
        const industries = await this.findSkillIndustries(skill.skillName);
        const skillId = `emerging-${skill.skillName.replace(/\s+/g, '-')}`;
        
        await this.db.insert(schema.emergingSkills).values({
          id: skillId,
          skillName: skill.skillName,
          category: await this.getSkillCategory(skill.skillName),
          emergenceScore: skill.emergenceScore,
          growthVelocity: skill.velocity,
          firstDetected: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months ago
          relatedSkills: JSON.stringify(relatedSkills),
          industries: JSON.stringify(industries),
          predictedPeakDemand: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
          confidence: Math.min(0.9, skill.emergenceScore * 0.8 + 0.2), // Confidence based on emergence score
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).onConflictDoUpdate({
          target: schema.emergingSkills.id,
          set: {
            emergenceScore: skill.emergenceScore,
            growthVelocity: skill.velocity,
            confidence: Math.min(0.9, skill.emergenceScore * 0.8 + 0.2),
            updatedAt: new Date().toISOString()
          }
        });
        
        recordsUpdated++;
      }
      
      return {
        jobName: 'computeEmergingSkills',
        status: 'success',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error computing emerging skills:', error);
      return {
        jobName: 'computeEmergingSkills',
        status: 'error',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Update regional skill trends
   */
  private async updateRegionalTrends(): Promise<ComputationJobResult> {
    let recordsProcessed = 0;
    let recordsUpdated = 0;
    
    try {
      // Use mock regional data for now
      const mockRegions = [
        'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
        'London, UK', 'Berlin, Germany', 'Toronto, Canada', 'Remote'
      ];
      
      const mockSkills = [
        'JavaScript', 'Python', 'React', 'TypeScript', 'Node.js',
        'Machine Learning', 'AWS', 'Docker', 'Kubernetes', 'SQL'
      ];
      
      for (const region of mockRegions) {
        for (const skillName of mockSkills.slice(0, 5)) { // Top 5 skills per region
          recordsProcessed++;
          
          // Generate realistic regional trend data
          const baseDemand = 0.5 + Math.random() * 0.4; // 0.5-0.9
          const demandScore = Math.min(1, baseDemand);
          const supplyScore = demandScore * (0.6 + Math.random() * 0.3); // 60-90% of demand
          const gapScore = demandScore - supplyScore;
          const avgSalary = Math.floor(80000 + Math.random() * 100000); // $80k-$180k
          
          const trendId = `regional-${region.replace(/\s+/g, '-')}-${skillName.replace(/\s+/g, '-')}`;
          
          await this.db.insert(schema.regionalSkillTrends).values({
            id: trendId,
            region,
            country: this.extractCountry(region),
            city: this.extractCity(region),
            skillName,
            demandScore,
            supplyScore,
            gapScore,
            avgSalary,
            salaryGrowth: Math.random() * 0.1 + 0.05, // 5-15% salary growth
            jobGrowth: Math.random() * 0.15 + 0.05, // 5-20% job growth
            analysisDate: new Date().toISOString()
          }).onConflictDoUpdate({
            target: schema.regionalSkillTrends.id,
            set: {
              demandScore,
              supplyScore,
              gapScore,
              avgSalary,
              salaryGrowth: Math.random() * 0.1 + 0.05,
              jobGrowth: Math.random() * 0.15 + 0.05,
              analysisDate: new Date().toISOString()
            }
          });
          
          recordsUpdated++;
        }
      }
      
      return {
        jobName: 'updateRegionalTrends',
        status: 'success',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error updating regional trends:', error);
      return {
        jobName: 'updateRegionalTrends',
        status: 'error',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Generate market forecasts
   */
  private async generateForecasts(horizonMonths: number): Promise<ComputationJobResult> {
    let recordsProcessed = 0;
    let recordsUpdated = 0;
    
    try {
      // Use mock skills for forecasting
      const mockSkills = [
        'JavaScript', 'Python', 'React', 'TypeScript', 'Node.js',
        'Machine Learning', 'AWS', 'Docker', 'Kubernetes', 'SQL',
        'AI Prompt Engineering', 'Rust', 'Go', 'Vue.js', 'Angular'
      ];
      
      recordsProcessed = mockSkills.length;
      
      for (const skillName of mockSkills) {
        try {
          const forecasts = await this.trendsService.generateSkillForecasts([skillName]);
          
          if (forecasts.length > 0) {
            const forecast = forecasts[0];
            const forecastId = `forecast-${skillName.replace(/\s+/g, '-')}-${Date.now()}`;
            
            // Store forecast in market_forecasts table using Drizzle ORM
            await this.db.insert(schema.marketForecasts).values({
              id: forecastId,
              skillName,
              industry: 'Technology',
              region: 'Global',
              forecastType: 'demand',
              currentValue: forecast.currentDemand,
              forecast3Months: forecast.forecast3Months,
              forecast6Months: forecast.forecast6Months,
              forecast1Year: forecast.forecast1Year,
              forecast2Years: forecast.forecast1Year * 1.2, // Extrapolate 2-year forecast
              confidence: forecast.confidence,
              methodology: 'Automated trend analysis with time series forecasting',
              createdAt: new Date().toISOString()
            });
            
            recordsUpdated++;
          }
        } catch (error) {
          logger.warn(`Failed to generate forecast for ${skillName}:`, error);
        }
      }
      
      return {
        jobName: 'generateForecasts',
        status: 'success',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error generating forecasts:', error);
      return {
        jobName: 'generateForecasts',
        status: 'error',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Clean up old data beyond retention period
   */
  private async cleanupOldData(retentionDays: number): Promise<ComputationJobResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();
    
    let recordsProcessed = 0;
    let recordsUpdated = 0;
    
    try {
      // Clean up old skill demand history using Drizzle ORM
      const historyDeleted = await this.db
        .delete(schema.skillDemandHistory)
        .where(lt(schema.skillDemandHistory.recordedAt, cutoffIso));
      
      recordsUpdated += 0; // Drizzle doesn't return affected rows count easily
      
      // Clean up old market forecasts
      const forecastDeleted = await this.db
        .delete(schema.marketForecasts)
        .where(lt(schema.marketForecasts.createdAt, cutoffIso));
      
      recordsUpdated += 0; // Drizzle doesn't return affected rows count easily
      
      recordsProcessed = recordsUpdated;
      
      return {
        jobName: 'cleanupOldData',
        status: 'success',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error cleaning up old data:', error);
      return {
        jobName: 'cleanupOldData',
        status: 'error',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Validate and improve forecast accuracy
   */
  async validateAndImproveForecastAccuracy(): Promise<ComputationJobResult> {
    let recordsProcessed = 0;
    let recordsUpdated = 0;
    
    try {
      logger.info('Starting forecast accuracy validation and improvement...');
      
      // Get recent forecasts that can be validated
      const validationCandidates = await this.getValidationCandidates();
      recordsProcessed = validationCandidates.length;
      
      const validationResults: Array<{
        skillName: string;
        forecastHorizon: string;
        accuracy: number;
        error: number;
      }> = [];
      
      for (const candidate of validationCandidates) {
        const result = await this.validateSingleForecast(candidate);
        if (result) {
          validationResults.push(result);
          recordsUpdated++;
        }
      }
      
      // Analyze validation results and generate improvement recommendations
      const improvements = await this.generateAccuracyImprovements(validationResults);
      
      // Store validation results
      await this.storeValidationResults(validationResults);
      
      // Apply improvements to future forecasts
      await this.applyForecastImprovements(improvements);
      
      return {
        jobName: 'validateAndImproveForecastAccuracy',
        status: 'success',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error validating forecast accuracy:', error);
      return {
        jobName: 'validateAndImproveForecastAccuracy',
        status: 'error',
        recordsProcessed,
        recordsUpdated,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Get forecasts that can be validated against actual data
   */
  private async getValidationCandidates(): Promise<any[]> {
    // Get forecasts from 3-12 months ago that can now be validated
    const candidates: any[] = [];
    
    // Mock validation candidates since we're using sample data
    const mockSkills = ['JavaScript', 'Python', 'React', 'TypeScript', 'Machine Learning'];
    
    for (const skillName of mockSkills) {
      candidates.push({
        skillName,
        forecastDate: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString(), // 6 months ago
        predictedValue: 0.7 + Math.random() * 0.2, // 0.7-0.9
        forecastHorizon: '6_months'
      });
    }
    
    return candidates;
  }

  /**
   * Validate a single forecast against actual data
   */
  private async validateSingleForecast(candidate: any): Promise<{
    skillName: string;
    forecastHorizon: string;
    accuracy: number;
    error: number;
  } | null> {
    try {
      // Get actual demand value for the skill at the forecast target date
      const actualValue = await this.getActualDemandValue(candidate.skillName);
      
      if (actualValue === null) {
        return null;
      }
      
      const error = Math.abs(actualValue - candidate.predictedValue);
      const accuracy = Math.max(0, 1 - error);
      
      return {
        skillName: candidate.skillName,
        forecastHorizon: candidate.forecastHorizon,
        accuracy,
        error
      };
    } catch (error) {
      logger.warn(`Failed to validate forecast for ${candidate.skillName}:`, error);
      return null;
    }
  }

  /**
   * Get actual demand value for validation
   */
  private async getActualDemandValue(skillName: string): Promise<number | null> {
    // In production, this would query actual demand data
    // For now, generate realistic actual values with some variance from predictions
    const baseValue = 0.6 + Math.random() * 0.3; // 0.6-0.9
    const variance = (Math.random() - 0.5) * 0.2; // ±0.1 variance
    
    return Math.min(1, Math.max(0, baseValue + variance));
  }

  /**
   * Generate accuracy improvement recommendations
   */
  private async generateAccuracyImprovements(
    validationResults: Array<{
      skillName: string;
      forecastHorizon: string;
      accuracy: number;
      error: number;
    }>
  ): Promise<string[]> {
    const improvements: string[] = [];
    
    if (validationResults.length === 0) {
      return ['No validation data available for improvements'];
    }
    
    // Calculate overall accuracy
    const overallAccuracy = validationResults.reduce((sum, r) => sum + r.accuracy, 0) / validationResults.length;
    
    if (overallAccuracy < 0.7) {
      improvements.push('Overall forecast accuracy is below 70% - consider model retraining');
    }
    
    // Identify skills with poor accuracy
    const poorSkills = validationResults
      .filter(r => r.accuracy < 0.6)
      .map(r => r.skillName);
    
    if (poorSkills.length > 0) {
      improvements.push(`Poor accuracy for skills: ${poorSkills.join(', ')} - increase data collection frequency`);
    }
    
    // Check horizon-specific issues
    const horizonAccuracy = new Map<string, number[]>();
    for (const result of validationResults) {
      if (!horizonAccuracy.has(result.forecastHorizon)) {
        horizonAccuracy.set(result.forecastHorizon, []);
      }
      horizonAccuracy.get(result.forecastHorizon)!.push(result.accuracy);
    }
    
    for (const [horizon, accuracies] of horizonAccuracy.entries()) {
      const avgAccuracy = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
      if (avgAccuracy < 0.6) {
        improvements.push(`${horizon} forecasts need improvement - consider different time series models`);
      }
    }
    
    return improvements;
  }

  /**
   * Store validation results for future analysis
   */
  private async storeValidationResults(
    results: Array<{
      skillName: string;
      forecastHorizon: string;
      accuracy: number;
      error: number;
    }>
  ): Promise<void> {
    // In production, this would store in forecast_validations table
    logger.info(`Storing ${results.length} validation results`);
    
    for (const result of results) {
      logger.info(`${result.skillName} (${result.forecastHorizon}): ${(result.accuracy * 100).toFixed(1)}% accuracy`);
    }
  }

  /**
   * Apply improvements to future forecasting
   */
  private async applyForecastImprovements(improvements: string[]): Promise<void> {
    // In production, this would update forecasting parameters
    logger.info('Applying forecast improvements:');
    improvements.forEach(improvement => logger.info(`  - ${improvement}`));
  }

  /**
   * Collect fresh data from external APIs
   */
  private async collectExternalData(): Promise<ComputationJobResult> {
    try {
      const metrics = await this.jobCollector.collectJobData(['mock', 'sample'], {
        maxJobs: 100
      });
      
      return {
        jobName: 'collectExternalData',
        status: 'success',
        recordsProcessed: metrics.totalJobs,
        recordsUpdated: metrics.skillDemand.size,
        executionTimeMs: 0,
        lastRun: new Date().toISOString()
      };
    } catch (error) {
      return {
        jobName: 'collectExternalData',
        status: 'error',
        recordsProcessed: 0,
        recordsUpdated: 0,
        executionTimeMs: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        lastRun: new Date().toISOString()
      };
    }
  }

  /**
   * Helper methods
   */
  private async calculateSkillTrend(skillName: string): Promise<{
    currentDemand: number;
    growthRate: number;
    averageSalary: number;
    jobCount: number;
  } | null> {
    // For now, return mock data since we're using Drizzle ORM
    // In production, this would use proper Drizzle queries
    const mockTrendData = {
      currentDemand: 0.7 + Math.random() * 0.2, // 0.7-0.9
      growthRate: (Math.random() - 0.5) * 0.4, // -0.2 to 0.2
      averageSalary: Math.floor(80000 + Math.random() * 80000), // $80k-$160k
      jobCount: Math.floor(100 + Math.random() * 500) // 100-600 jobs
    };
    
    return mockTrendData;
  }

  private async findRelatedSkills(skillName: string): Promise<string[]> {
    // Mock related skills data since we're using sample data
    const relatedSkillsMap: Record<string, string[]> = {
      'JavaScript': ['TypeScript', 'React', 'Node.js', 'HTML', 'CSS'],
      'Python': ['Django', 'Flask', 'Pandas', 'NumPy', 'Machine Learning'],
      'React': ['JavaScript', 'TypeScript', 'Redux', 'Next.js', 'HTML'],
      'Machine Learning': ['Python', 'TensorFlow', 'PyTorch', 'Data Science', 'Statistics'],
      'AWS': ['Cloud Computing', 'Docker', 'Kubernetes', 'DevOps', 'Linux']
    };
    
    return relatedSkillsMap[skillName] || ['Programming', 'Software Development'];
  }

  private async findSkillIndustries(skillName: string): Promise<string[]> {
    // Mock industry data
    const skillIndustriesMap: Record<string, string[]> = {
      'JavaScript': ['Technology', 'E-commerce', 'Media'],
      'Python': ['Technology', 'Finance', 'Healthcare'],
      'Machine Learning': ['Technology', 'Healthcare', 'Finance'],
      'AWS': ['Technology', 'Finance', 'E-commerce'],
      'React': ['Technology', 'E-commerce', 'Media']
    };
    
    return skillIndustriesMap[skillName] || ['Technology'];
  }

  private async getSkillCategory(skillName: string): Promise<string> {
    const categoryMap: Record<string, string> = {
      'JavaScript': 'Programming',
      'TypeScript': 'Programming',
      'Python': 'Programming',
      'React': 'Programming',
      'Machine Learning': 'AI & Machine Learning',
      'AWS': 'Cloud & DevOps',
      'Docker': 'Cloud & DevOps',
      'SQL': 'Data Science'
    };
    
    return categoryMap[skillName] || 'General';
  }

  private extractCountry(location: string): string {
    if (location.includes('USA') || location.includes('US') || location.includes(', CA') || location.includes(', NY')) {
      return 'USA';
    }
    if (location.includes('UK') || location.includes('London')) {
      return 'UK';
    }
    if (location.includes('Germany') || location.includes('Berlin')) {
      return 'Germany';
    }
    return 'Unknown';
  }

  private extractCity(location: string): string {
    const parts = location.split(',');
    return parts[0].trim();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}