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
      let query = `
        SELECT 
          industry,
          skillName,
          AVG(demandScore) as avgDemand,
          AVG(growthRate) as avgGrowth,
          AVG(averageSalary) as avgSalary,
          SUM(jobOpenings) as totalJobs
        FROM industryTrends
        WHERE 1=1
      `;
      const params: any[] = [];

      if (industry) {
        query += ' AND industry = ?';
        params.push(industry);
      }

      if (region) {
        query += ' AND region = ?';
        params.push(region);
      }

      query += ' GROUP BY industry ORDER BY avgDemand DESC LIMIT ?';
      params.push(limit);

      const results = await this.db.prepare(query).bind(...params).all();

      // Process and format results
      return this.formatIndustryTrends(results.results || []);
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
      let query = `
        SELECT 
          s.skillName,
          s.category,
          es.emergenceScore,
          es.growthVelocity,
          es.relatedSkills,
          es.predictedPeakDemand,
          es.confidence
        FROM emergingSkills es
        JOIN skills s ON es.skillName = s.name
        WHERE es.growthVelocity >= ?
      `;
      const params: any[] = [minGrowthRate];

      if (category) {
        query += ' AND s.category = ?';
        params.push(category);
      }

      query += ' ORDER BY es.emergenceScore DESC LIMIT ?';
      params.push(limit);

      const results = await this.db.prepare(query).bind(...params).all();

      return (results.results || []).map(skill => ({
        skillName: skill.skillName,
        category: skill.category,
        emergenceScore: skill.emergenceScore,
        growthVelocity: skill.growthVelocity,
        relatedSkills: JSON.parse(skill.relatedSkills || '[]'),
        adoptionRate: this.calculateAdoptionRate(skill.emergenceScore, skill.growthVelocity),
        predictedDemandPeak: skill.predictedPeakDemand
      }));
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
      let query = `
        SELECT 
          region,
          country,
          city,
          skillName,
          demandScore,
          supplyScore,
          gapScore,
          avgSalary,
          salaryGrowth,
          jobGrowth
        FROM regionalSkillTrends
        WHERE 1=1
      `;
      const params: any[] = [];

      if (region) {
        query += ' AND region = ?';
        params.push(region);
      }

      query += ' ORDER BY demandScore DESC LIMIT ?';
      params.push(limit * 5); // Get more to group by region

      const results = await this.db.prepare(query).bind(...params).all();

      return this.groupByRegion(results.results || []);
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
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - timeWindow);

      const query = `
        SELECT 
          skillName,
          MIN(demandScore) as initialDemand,
          MAX(demandScore) as currentDemand,
          COUNT(*) as dataPoints
        FROM skillDemandHistory
        WHERE recordedAt BETWEEN ? AND ?
        GROUP BY skillName
        HAVING dataPoints >= 3
      `;

      const results = await this.db.prepare(query)
        .bind(startDate.toISOString(), endDate.toISOString())
        .all();

      const velocityMap = new Map<string, number>();

      for (const skill of results.results || []) {
        const velocity = this.calculateGrowthVelocity(
          skill.initialDemand,
          skill.currentDemand,
          timeWindow
        );
        velocityMap.set(skill.skillName, velocity);
      }

      return velocityMap;
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
    let query = `
      SELECT 
        recordedAt as date,
        demandScore as demand,
        jobCount
      FROM skillDemandHistory
      WHERE skillName = ?
    `;
    const params: any[] = [skillName];

    if (industry) {
      query += ' AND industry = ?';
      params.push(industry);
    }

    if (region) {
      query += ' AND region = ?';
      params.push(region);
    }

    query += ' ORDER BY recordedAt DESC LIMIT 24'; // Last 24 data points

    const results = await this.db.prepare(query).bind(...params).all();

    return (results.results || []).map(row => ({
      date: row.date,
      demand: row.demand,
      jobCount: row.jobCount
    }));
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
    for (const forecast of forecasts) {
      await this.db.prepare(`
        INSERT INTO marketForecasts (
          id, skillName, industry, region, forecastType,
          currentValue, forecast3Months, forecast6Months,
          forecast1Year, confidence, methodology, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        forecast.skillName,
        industry || null,
        region || null,
        'demand',
        forecast.currentDemand,
        forecast.forecast3Months,
        forecast.forecast6Months,
        forecast.forecast1Year,
        forecast.confidence,
        'Time series analysis with linear regression',
        new Date().toISOString()
      ).run();
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
    const result = await this.db.prepare(`
      SELECT recordedAt
      FROM skillDemandHistory
      WHERE skillName = ?
      ORDER BY demandScore DESC
      LIMIT 1
    `).bind(skillName).first() as any;

    return result?.recordedAt || new Date().toISOString();
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

