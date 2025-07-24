import { Database } from '../config/database';
import { logger } from '../utils/logger';
import { JobAnalysisService } from './jobAnalysis';
import { SkillExtractionService } from './skillExtraction';

export interface SkillTrend {
  skillName: string;
  category: string;
  demandScore: number; // 0.0 to 1.0
  growthRate: number; // percentage
  averageSalary?: number;
  jobCount: number;
  lastUpdated: string;
}

export interface IndustryTrend {
  industry: string;
  topSkills: string[];
  growthRate: number;
  avgSalary: number;
  totalJobs: number;
  emergingSkills: string[];
}

export interface RegionalTrend {
  region: string;
  country?: string;
  topSkills: SkillTrend[];
  demandSupplyGap: number;
  salaryIndex: number; // relative to global average
}

export interface EmergingSkill {
  skillName: string;
  category: string;
  emergenceScore: number;
  growthVelocity: number;
  relatedSkills: string[];
  adoptionRate: number;
  predictedDemandPeak: string;
}

export interface SkillForecast {
  skillName: string;
  currentDemand: number;
  forecast3Months: number;
  forecast6Months: number;
  forecast1Year: number;
  confidence: number;
  factors: string[];
}

export class TrendsAnalysisService {
  private jobAnalysisService: JobAnalysisService;
  private skillExtractionService: SkillExtractionService;

  constructor(private db: Database) {
    this.jobAnalysisService = new JobAnalysisService();
    this.skillExtractionService = new SkillExtractionService();
  }

  /**
   * Get industry trends with filters
   */
  async getIndustryTrends(
    industry?: string,
    region?: string,
    limit: number = 10
  ): Promise<IndustryTrend[]> {
    try {
      // For now, return mock data since we're using Drizzle ORM
      // In production, this would use proper Drizzle queries
      const mockTrends: IndustryTrend[] = [
        {
          industry: industry || 'Technology',
          topSkills: ['JavaScript', 'Python', 'React', 'AWS', 'Docker'],
          growthRate: 0.15,
          avgSalary: 125000,
          totalJobs: 15000,
          emergingSkills: ['AI Prompt Engineering', 'Rust', 'WebAssembly']
        },
        {
          industry: 'Finance',
          topSkills: ['Python', 'SQL', 'Java', 'Machine Learning', 'Excel'],
          growthRate: 0.12,
          avgSalary: 135000,
          totalJobs: 8000,
          emergingSkills: ['Blockchain', 'DeFi', 'Quantitative Analysis']
        }
      ];

      return mockTrends.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching industry trends:', error);
      throw new Error('Failed to fetch industry trends');
    }
  }

  /**
   * Get emerging skills based on growth patterns
   */
  async getEmergingSkills(
    category?: string,
    minGrowthRate: number = 0.2,
    limit: number = 20
  ): Promise<EmergingSkill[]> {
    try {
      // Mock emerging skills data
      const mockEmergingSkills: EmergingSkill[] = [
        {
          skillName: 'AI Prompt Engineering',
          category: 'AI & Machine Learning',
          emergenceScore: 0.95,
          growthVelocity: 0.85,
          relatedSkills: ['Machine Learning', 'NLP', 'ChatGPT', 'GPT-4'],
          adoptionRate: 0.78,
          predictedDemandPeak: '2025-12-31'
        },
        {
          skillName: 'Rust Programming',
          category: 'Programming',
          emergenceScore: 0.82,
          growthVelocity: 0.45,
          relatedSkills: ['C++', 'Systems Programming', 'WebAssembly'],
          adoptionRate: 0.67,
          predictedDemandPeak: '2026-06-30'
        },
        {
          skillName: 'Web3 Development',
          category: 'Blockchain',
          emergenceScore: 0.78,
          growthVelocity: 0.38,
          relatedSkills: ['Blockchain', 'Solidity', 'Smart Contracts'],
          adoptionRate: 0.62,
          predictedDemandPeak: '2025-09-30'
        }
      ];

      // Filter by category if specified
      let filteredSkills = mockEmergingSkills;
      if (category) {
        filteredSkills = mockEmergingSkills.filter(skill => skill.category === category);
      }

      // Filter by minimum growth rate
      filteredSkills = filteredSkills.filter(skill => skill.growthVelocity >= minGrowthRate);

      return filteredSkills.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching emerging skills:', error);
      throw new Error('Failed to fetch emerging skills');
    }
  }

  /**
   * Get regional skill trends
   */
  async getRegionalTrends(
    region?: string,
    skillCategory?: string,
    limit: number = 10
  ): Promise<RegionalTrend[]> {
    try {
      // Mock regional trends data
      const mockRegionalTrends: RegionalTrend[] = [
        {
          region: region || 'North America',
          country: 'USA',
          topSkills: [
            {
              skillName: 'JavaScript',
              category: 'Programming',
              demandScore: 0.92,
              growthRate: 0.15,
              averageSalary: 125000,
              jobCount: 15000,
              lastUpdated: new Date().toISOString()
            },
            {
              skillName: 'Python',
              category: 'Programming',
              demandScore: 0.88,
              growthRate: 0.22,
              averageSalary: 130000,
              jobCount: 12000,
              lastUpdated: new Date().toISOString()
            }
          ],
          demandSupplyGap: 0.25,
          salaryIndex: 1.2
        },
        {
          region: 'Europe',
          country: 'Germany',
          topSkills: [
            {
              skillName: 'Java',
              category: 'Programming',
              demandScore: 0.85,
              growthRate: 0.08,
              averageSalary: 95000,
              jobCount: 8000,
              lastUpdated: new Date().toISOString()
            }
          ],
          demandSupplyGap: 0.18,
          salaryIndex: 0.95
        }
      ];

      return mockRegionalTrends.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching regional trends:', error);
      throw new Error('Failed to fetch regional trends');
    }
  }

  /**
   * Generate skill demand forecasts
   */
  async generateSkillForecasts(
    skillNames: string[],
    industry?: string,
    region?: string
  ): Promise<SkillForecast[]> {
    try {
      const forecasts: SkillForecast[] = [];

      for (const skillName of skillNames) {
        // Get historical data
        const historicalData = await this.getSkillHistory(skillName, industry, region);
        
        if (historicalData.length < 3) {
          // Not enough data for forecasting
          continue;
        }

        // Calculate forecast using simple time series analysis
        const forecast = this.calculateForecast(historicalData);
        forecast.skillName = skillName;
        
        forecasts.push(forecast);
      }

      // Store forecasts in database
      await this.storeForecastResults(forecasts, industry, region);

      return forecasts;
    } catch (error) {
      logger.error('Error generating skill forecasts:', error);
      throw new Error('Failed to generate skill forecasts');
    }
  }

  /**
   * Analyze skill demand growth velocity
   */
  async analyzeGrowthVelocity(
    timeWindow: number = 6 // months
  ): Promise<Map<string, number>> {
    try {
      // Mock growth velocity data
      const mockVelocityData = new Map<string, number>([
        ['AI Prompt Engineering', 0.85],
        ['Rust', 0.45],
        ['TypeScript', 0.28],
        ['Kubernetes', 0.35],
        ['React', 0.20],
        ['Python', 0.25],
        ['JavaScript', 0.15],
        ['Java', 0.08],
        ['PHP', -0.05],
        ['jQuery', -0.15]
      ]);

      return mockVelocityData;
    } catch (error) {
      logger.error('Error analyzing growth velocity:', error);
      throw new Error('Failed to analyze growth velocity');
    }
  }

  /**
   * Identify skills with declining demand
   */
  async identifyDecliningSkills(
    threshold: number = -0.1,
    timeWindow: number = 12 // months
  ): Promise<Array<{ skillName: string; declineRate: number; peakDate: string }>> {
    try {
      const velocityMap = await this.analyzeGrowthVelocity(timeWindow);
      const decliningSkills: Array<{ skillName: string; declineRate: number; peakDate: string }> = [];

      for (const [skillName, velocity] of velocityMap.entries()) {
        if (velocity < threshold) {
          const peakDate = await this.findPeakDemandDate(skillName);
          decliningSkills.push({
            skillName,
            declineRate: velocity,
            peakDate
          });
        }
      }

      return decliningSkills.sort((a, b) => a.declineRate - b.declineRate);
    } catch (error) {
      logger.error('Error identifying declining skills:', error);
      throw new Error('Failed to identify declining skills');
    }
  }

  /**
   * Get skill history data for forecasting
   */
  private async getSkillHistory(
    skillName: string,
    industry?: string,
    region?: string
  ): Promise<Array<{ date: string; demand: number; jobCount: number }>> {
    // Mock historical data for forecasting
    const mockHistory: Array<{ date: string; demand: number; jobCount: number }> = [];
    const baseDate = new Date();
    
    // Generate 12 months of mock historical data
    for (let i = 12; i >= 0; i--) {
      const date = new Date(baseDate);
      date.setMonth(date.getMonth() - i);
      
      // Generate realistic demand progression based on skill
      let baseDemand = 0.5;
      let trend = 0.02; // 2% monthly growth
      
      if (skillName === 'AI Prompt Engineering') {
        baseDemand = 0.3;
        trend = 0.08; // 8% monthly growth
      } else if (skillName === 'Rust') {
        baseDemand = 0.4;
        trend = 0.04;
      } else if (skillName === 'JavaScript') {
        baseDemand = 0.8;
        trend = 0.01;
      }
      
      const demand = Math.min(1, baseDemand + (trend * (12 - i)) + (Math.random() - 0.5) * 0.05);
      const jobCount = Math.floor(demand * 1000 * (1 + Math.random() * 0.2));
      
      mockHistory.push({
        date: date.toISOString(),
        demand,
        jobCount
      });
    }
    
    return mockHistory;
  }

  /**
   * Calculate forecast using simple moving average and trend
   */
  private calculateForecast(historicalData: Array<{ date: string; demand: number; jobCount: number }>): SkillForecast {
    const demands = historicalData.map(d => d.demand);
    const currentDemand = demands[0]; // Most recent
    
    // Calculate trend
    const trend = this.calculateTrend(demands);
    
    // Simple forecast
    const forecast3Months = Math.min(1, Math.max(0, currentDemand + (trend * 3)));
    const forecast6Months = Math.min(1, Math.max(0, currentDemand + (trend * 6)));
    const forecast1Year = Math.min(1, Math.max(0, currentDemand + (trend * 12)));
    
    // Calculate confidence based on data consistency
    const confidence = this.calculateForecastConfidence(demands);
    
    // Identify factors affecting the forecast
    const factors = this.identifyForecastFactors(historicalData);

    return {
      skillName: '', // Will be set by caller
      currentDemand,
      forecast3Months,
      forecast6Months,
      forecast1Year,
      confidence,
      factors
    };
  }

  /**
   * Calculate trend from historical data
   */
  private calculateTrend(demands: number[]): number {
    if (demands.length < 2) return 0;
    
    // Simple linear regression
    const n = demands.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = demands.reverse(); // Oldest to newest
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return slope / n; // Trend per time period
  }

  /**
   * Calculate forecast confidence
   */
  private calculateForecastConfidence(demands: number[]): number {
    if (demands.length < 3) return 0.3;
    
    // Calculate variance
    const mean = demands.reduce((a, b) => a + b, 0) / demands.length;
    const variance = demands.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / demands.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower variance = higher confidence
    const confidence = Math.max(0.3, Math.min(0.9, 1 - (stdDev / mean)));
    
    return confidence;
  }

  /**
   * Identify factors affecting forecast
   */
  private identifyForecastFactors(historicalData: Array<{ date: string; demand: number; jobCount: number }>): string[] {
    const factors: string[] = [];
    
    // Check for seasonal patterns
    if (this.hasSeasonalPattern(historicalData)) {
      factors.push('Seasonal demand fluctuations');
    }
    
    // Check for rapid growth
    const growthRate = this.calculateGrowthRate(historicalData);
    if (growthRate > 0.2) {
      factors.push('Rapid market adoption');
    } else if (growthRate < -0.1) {
      factors.push('Declining market interest');
    }
    
    // Check job market correlation
    if (this.hasJobMarketCorrelation(historicalData)) {
      factors.push('Strong job market correlation');
    }
    
    return factors;
  }

  /**
   * Store forecast results in database
   */
  private async storeForecastResults(
    forecasts: SkillForecast[],
    industry?: string,
    region?: string
  ): Promise<void> {
    // In a real implementation, this would store forecasts in the database
    // For now, we'll just log that forecasts were generated
    logger.info(`Generated ${forecasts.length} forecasts for industry: ${industry || 'All'}, region: ${region || 'Global'}`);
    
    for (const forecast of forecasts) {
      logger.info(`Forecast for ${forecast.skillName}: Current ${forecast.currentDemand.toFixed(2)}, 1Y ${forecast.forecast1Year.toFixed(2)} (confidence: ${(forecast.confidence * 100).toFixed(1)}%)`);
    }
  }

  /**
   * Helper methods
   */
  private formatIndustryTrends(rawData: any[]): IndustryTrend[] {
    const industryMap = new Map<string, any>();

    for (const row of rawData) {
      if (!industryMap.has(row.industry)) {
        industryMap.set(row.industry, {
          industry: row.industry,
          topSkills: [],
          growthRate: 0,
          avgSalary: 0,
          totalJobs: 0,
          emergingSkills: []
        });
      }

      const trend = industryMap.get(row.industry);
      trend.topSkills.push(row.skillName);
      trend.growthRate = Math.max(trend.growthRate, row.avgGrowth);
      trend.avgSalary = row.avgSalary || 0;
      trend.totalJobs += row.totalJobs || 0;
    }

    return Array.from(industryMap.values());
  }

  private groupByRegion(data: any[]): RegionalTrend[] {
    const regionMap = new Map<string, RegionalTrend>();

    for (const row of data) {
      if (!regionMap.has(row.region)) {
        regionMap.set(row.region, {
          region: row.region,
          country: row.country,
          topSkills: [],
          demandSupplyGap: 0,
          salaryIndex: 1.0
        });
      }

      const trend = regionMap.get(row.region)!;
      trend.topSkills.push({
        skillName: row.skillName,
        category: 'General', // Would need to join with skills table
        demandScore: row.demandScore,
        growthRate: row.jobGrowth || 0,
        averageSalary: row.avgSalary,
        jobCount: 0, // Would need additional data
        lastUpdated: new Date().toISOString()
      });

      trend.demandSupplyGap = Math.max(trend.demandSupplyGap, row.gapScore);
    }

    return Array.from(regionMap.values());
  }

  private calculateAdoptionRate(emergenceScore: number, growthVelocity: number): number {
    return Math.min(1, emergenceScore * 0.6 + growthVelocity * 0.4);
  }

  private calculateGrowthVelocity(initialDemand: number, currentDemand: number, months: number): number {
    if (initialDemand === 0) return currentDemand > 0 ? 1 : 0;
    return ((currentDemand - initialDemand) / initialDemand) / months;
  }

  private async findPeakDemandDate(skillName: string): Promise<string> {
    // Mock peak demand date - typically 3-6 months ago for established skills
    const peakDate = new Date();
    peakDate.setMonth(peakDate.getMonth() - Math.floor(Math.random() * 6 + 1));
    return peakDate.toISOString();
  }

  private hasSeasonalPattern(data: Array<{ date: string; demand: number }>): boolean {
    // Simple check for seasonal pattern (would need more sophisticated analysis)
    if (data.length < 12) return false;
    
    const monthlyAverages = new Map<number, number[]>();
    
    for (const point of data) {
      const month = new Date(point.date).getMonth();
      if (!monthlyAverages.has(month)) {
        monthlyAverages.set(month, []);
      }
      monthlyAverages.get(month)!.push(point.demand);
    }
    
    // Check if certain months consistently have higher/lower demand
    const avgByMonth = Array.from(monthlyAverages.entries()).map(([month, demands]) => ({
      month,
      avg: demands.reduce((a, b) => a + b, 0) / demands.length
    }));
    
    const overallAvg = data.reduce((sum, d) => sum + d.demand, 0) / data.length;
    const variance = avgByMonth.reduce((sum, m) => sum + Math.pow(m.avg - overallAvg, 2), 0) / avgByMonth.length;
    
    return variance > 0.01; // Threshold for seasonal variation
  }

  private calculateGrowthRate(data: Array<{ demand: number }>): number {
    if (data.length < 2) return 0;
    
    const initial = data[data.length - 1].demand;
    const current = data[0].demand;
    
    if (initial === 0) return current > 0 ? 1 : 0;
    return (current - initial) / initial;
  }

  private hasJobMarketCorrelation(data: Array<{ demand: number; jobCount: number }>): boolean {
    if (data.length < 3) return false;
    
    // Simple correlation check
    const demands = data.map(d => d.demand);
    const jobCounts = data.map(d => d.jobCount);
    
    const correlation = this.calculateCorrelation(demands, jobCounts);
    
    return Math.abs(correlation) > 0.7;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length || n === 0) return 0;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

