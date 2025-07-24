import { Database } from '../config/database';
import { logger } from '../utils/logger';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

export interface SampleDataConfig {
  skillCount: number;
  industryCount: number;
  regionCount: number;
  historicalMonths: number;
  emergingSkillsCount: number;
}

export class SampleDataPopulator {
  private readonly defaultConfig: SampleDataConfig = {
    skillCount: 100,
    industryCount: 15,
    regionCount: 20,
    historicalMonths: 24,
    emergingSkillsCount: 30
  };

  constructor(private db: Database) {}

  /**
   * Populate database with comprehensive sample trend data
   */
  async populateAllSampleData(config: Partial<SampleDataConfig> = {}): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    try {
      logger.info('Starting comprehensive sample data population...');
      
      // Clear existing sample data
      await this.clearExistingSampleData();
      
      // Populate in order of dependencies
      await this.populateSkillDemandHistory(finalConfig);
      await this.populateEmergingSkills(finalConfig);
      await this.populateRegionalTrends(finalConfig);
      await this.populateMarketForecasts(finalConfig);
      await this.populateIndustryTrends(finalConfig);
      
      logger.info('Sample data population completed successfully');
    } catch (error) {
      logger.error('Error populating sample data:', error);
      throw new Error('Failed to populate sample data');
    }
  }

  /**
   * Clear existing sample data
   */
  private async clearExistingSampleData(): Promise<void> {
    try {
      // Clear existing sample data using Drizzle ORM
      await this.db.delete(schema.skillDemandHistory);
      await this.db.delete(schema.emergingSkills);
      await this.db.delete(schema.regionalSkillTrends);
      await this.db.delete(schema.marketForecasts);
      await this.db.delete(schema.industryTrends);
      
      logger.info('Cleared existing sample data');
    } catch (error) {
      logger.warn('Error clearing sample data (may not exist yet):', error);
    }
  }

  /**
   * Populate skill demand history with realistic trends
   */
  private async populateSkillDemandHistory(config: SampleDataConfig): Promise<void> {
    const skills = this.getSkillsData();
    const industries = this.getIndustriesData();
    const regions = this.getRegionsData();
    
    const records: any[] = [];
    
    for (const skill of skills.slice(0, config.skillCount)) {
      for (const industry of industries.slice(0, Math.min(3, industries.length))) {
        for (const region of regions.slice(0, Math.min(2, regions.length))) {
          // Generate historical data points
          for (let monthsBack = config.historicalMonths; monthsBack >= 0; monthsBack--) {
            const date = new Date();
            date.setMonth(date.getMonth() - monthsBack);
            
            // Generate realistic demand progression
            const baseDemand = skill.baseDemand;
            const trendFactor = skill.growthTrend * (config.historicalMonths - monthsBack) / config.historicalMonths;
            const seasonalFactor = this.getSeasonalFactor(date.getMonth(), skill.category);
            const randomFactor = (Math.random() - 0.5) * 0.1; // ±5% random variation
            
            const demandScore = Math.min(1, Math.max(0, baseDemand + trendFactor + seasonalFactor + randomFactor));
            const jobCount = Math.floor(demandScore * skill.maxJobs * (1 + randomFactor));
            const avgSalary = Math.floor(skill.baseSalary * (1 + demandScore * 0.3) * (1 + randomFactor * 0.1));
            
            records.push({
              id: `hist-${skill.name}-${industry.name}-${region.name}-${monthsBack}`,
              skill_name: skill.name,
              industry: industry.name,
              region: region.name,
              demand_score: demandScore,
              job_count: jobCount,
              avg_salary: avgSalary,
              data_source: 'sample_generator',
              recorded_at: date.toISOString()
            });
          }
        }
      }
    }
    
    // Batch insert
    await this.batchInsert('skill_demand_history', records);
    logger.info(`Populated ${records.length} skill demand history records`);
  }

  /**
   * Populate emerging skills with realistic emergence patterns
   */
  private async populateEmergingSkills(config: SampleDataConfig): Promise<void> {
    const emergingSkills = this.getEmergingSkillsData();
    const records: any[] = [];
    
    for (const skill of emergingSkills.slice(0, config.emergingSkillsCount)) {
      const firstDetected = new Date();
      firstDetected.setMonth(firstDetected.getMonth() - Math.floor(Math.random() * 18 + 6)); // 6-24 months ago
      
      const predictedPeak = new Date();
      predictedPeak.setMonth(predictedPeak.getMonth() + Math.floor(Math.random() * 24 + 6)); // 6-30 months from now
      
      records.push({
        id: `emrg-${skill.name.replace(/\s+/g, '-').toLowerCase()}`,
        skill_name: skill.name,
        category: skill.category,
        emergence_score: skill.emergenceScore,
        growth_velocity: skill.growthVelocity,
        first_detected: firstDetected.toISOString(),
        related_skills: JSON.stringify(skill.relatedSkills),
        industries: JSON.stringify(skill.industries),
        predicted_peak_demand: predictedPeak.toISOString(),
        confidence: skill.confidence,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    await this.batchInsert('emerging_skills', records);
    logger.info(`Populated ${records.length} emerging skills records`);
  }

  /**
   * Populate regional trends with geographic variations
   */
  private async populateRegionalTrends(config: SampleDataConfig): Promise<void> {
    const skills = this.getSkillsData();
    const regions = this.getRegionsData();
    const records: any[] = [];
    
    for (const region of regions.slice(0, config.regionCount)) {
      for (const skill of skills.slice(0, Math.min(20, skills.length))) {
        const demandScore = this.calculateRegionalDemand(skill, region);
        const supplyScore = this.calculateRegionalSupply(skill, region);
        const gapScore = demandScore - supplyScore;
        
        const avgSalary = Math.floor(skill.baseSalary * region.salaryMultiplier * (1 + demandScore * 0.2));
        const salaryGrowth = (Math.random() * 0.15) + (demandScore * 0.1); // 0-25% growth
        const jobGrowth = (Math.random() * 0.20) + (gapScore * 0.15); // Higher gap = more growth
        
        records.push({
          id: `reg-${region.name.replace(/\s+/g, '-')}-${skill.name.replace(/\s+/g, '-')}`,
          region: region.name,
          country: region.country,
          city: region.city,
          skill_name: skill.name,
          demand_score: demandScore,
          supply_score: supplyScore,
          gap_score: gapScore,
          avg_salary: avgSalary,
          salary_growth: salaryGrowth,
          job_growth: jobGrowth,
          analysis_date: new Date().toISOString()
        });
      }
    }
    
    await this.batchInsert('regional_skill_trends', records);
    logger.info(`Populated ${records.length} regional trends records`);
  }

  /**
   * Populate market forecasts with predictive data
   */
  private async populateMarketForecasts(config: SampleDataConfig): Promise<void> {
    const skills = this.getSkillsData();
    const industries = this.getIndustriesData();
    const regions = this.getRegionsData();
    const records: any[] = [];
    
    for (const skill of skills.slice(0, Math.min(50, skills.length))) {
      for (const industry of industries.slice(0, Math.min(2, industries.length))) {
        for (const region of regions.slice(0, Math.min(2, regions.length))) {
          const currentDemand = skill.baseDemand + (Math.random() - 0.5) * 0.1;
          const growthRate = skill.growthTrend;
          
          // Generate forecasts with some uncertainty
          const forecast3Months = Math.min(1, Math.max(0, currentDemand + (growthRate * 0.25) + (Math.random() - 0.5) * 0.05));
          const forecast6Months = Math.min(1, Math.max(0, currentDemand + (growthRate * 0.5) + (Math.random() - 0.5) * 0.08));
          const forecast1Year = Math.min(1, Math.max(0, currentDemand + growthRate + (Math.random() - 0.5) * 0.12));
          const forecast2Years = Math.min(1, Math.max(0, currentDemand + (growthRate * 2) + (Math.random() - 0.5) * 0.15));
          
          // Confidence decreases with time horizon
          const confidence = Math.max(0.5, 0.9 - (Math.abs(growthRate) * 0.2) - (Math.random() * 0.1));
          
          records.push({
            id: `fcst-${skill.name.replace(/\s+/g, '-')}-${industry.name.replace(/\s+/g, '-')}-${region.name.replace(/\s+/g, '-')}`,
            skill_name: skill.name,
            industry: industry.name,
            region: region.name,
            forecast_type: 'demand',
            current_value: currentDemand,
            forecast_3_months: forecast3Months,
            forecast_6_months: forecast6Months,
            forecast_1_year: forecast1Year,
            forecast_2_years: forecast2Years,
            confidence: confidence,
            methodology: 'Time series analysis with trend extrapolation',
            created_at: new Date().toISOString()
          });
        }
      }
    }
    
    await this.batchInsert('market_forecasts', records);
    logger.info(`Populated ${records.length} market forecast records`);
  }

  /**
   * Populate industry trends summary data
   */
  private async populateIndustryTrends(config: SampleDataConfig): Promise<void> {
    const skills = this.getSkillsData();
    const industries = this.getIndustriesData();
    const regions = this.getRegionsData();
    const records: any[] = [];
    
    for (const industry of industries.slice(0, config.industryCount)) {
      for (const skill of skills.slice(0, Math.min(30, skills.length))) {
        for (const region of regions.slice(0, Math.min(3, regions.length))) {
          const industryMultiplier = this.getIndustrySkillMultiplier(industry.name, skill.category);
          const demandScore = Math.min(1, skill.baseDemand * industryMultiplier);
          const growthRate = skill.growthTrend * industryMultiplier;
          
          const avgSalary = Math.floor(skill.baseSalary * industry.salaryMultiplier * (1 + demandScore * 0.2));
          const jobOpenings = Math.floor(skill.maxJobs * industryMultiplier * demandScore);
          
          records.push({
            id: `ind-${industry.name.replace(/\s+/g, '-')}-${skill.name.replace(/\s+/g, '-')}-${region.name.replace(/\s+/g, '-')}`,
            skill_name: skill.name,
            industry: industry.name,
            region: region.name,
            demand_score: demandScore,
            growth_rate: growthRate,
            average_salary: avgSalary,
            job_openings: jobOpenings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }
    }
    
    await this.batchInsert('industry_trends', records);
    logger.info(`Populated ${records.length} industry trends records`);
  }

  /**
   * Helper method for batch inserts using Drizzle ORM
   */
  private async batchInsert(tableName: string, records: any[]): Promise<void> {
    if (records.length === 0) return;
    
    const batchSize = 100;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        switch (tableName) {
          case 'skill_demand_history':
            await this.db.insert(schema.skillDemandHistory).values(batch);
            break;
          case 'emerging_skills':
            await this.db.insert(schema.emergingSkills).values(batch);
            break;
          case 'regional_skill_trends':
            await this.db.insert(schema.regionalSkillTrends).values(batch);
            break;
          case 'market_forecasts':
            await this.db.insert(schema.marketForecasts).values(batch);
            break;
          case 'industry_trends':
            await this.db.insert(schema.industryTrends).values(batch);
            break;
          default:
            logger.warn(`Unknown table for batch insert: ${tableName}`);
        }
      } catch (error) {
        logger.error(`Error inserting batch for ${tableName}:`, error);
        // Try individual inserts as fallback
        for (const record of batch) {
          try {
            switch (tableName) {
              case 'skill_demand_history':
                await this.db.insert(schema.skillDemandHistory).values(record);
                break;
              case 'emerging_skills':
                await this.db.insert(schema.emergingSkills).values(record);
                break;
              case 'regional_skill_trends':
                await this.db.insert(schema.regionalSkillTrends).values(record);
                break;
              case 'market_forecasts':
                await this.db.insert(schema.marketForecasts).values(record);
                break;
              case 'industry_trends':
                await this.db.insert(schema.industryTrends).values(record);
                break;
            }
          } catch (individualError) {
            logger.warn(`Failed to insert individual record:`, individualError);
          }
        }
      }
    }
  }

  /**
   * Populate realistic skill progression data
   */
  async populateSkillProgressionData(): Promise<void> {
    const skills = this.getSkillsData();
    const progressionRecords: any[] = [];
    
    for (const skill of skills.slice(0, 50)) {
      // Generate skill progression over time showing how demand evolved
      for (let monthsBack = 24; monthsBack >= 0; monthsBack--) {
        const date = new Date();
        date.setMonth(date.getMonth() - monthsBack);
        
        // Calculate realistic progression based on skill lifecycle
        const lifecycle = this.getSkillLifecycle(skill.name);
        const progressionFactor = this.calculateProgressionFactor(monthsBack, lifecycle);
        
        const demandScore = Math.min(1, Math.max(0, skill.baseDemand * progressionFactor));
        const jobCount = Math.floor(skill.maxJobs * demandScore * (0.8 + Math.random() * 0.4));
        const avgSalary = Math.floor(skill.baseSalary * (1 + demandScore * 0.2));
        
        progressionRecords.push({
          id: `prog-${skill.name.replace(/\s+/g, '-')}-${monthsBack}`,
          skillName: skill.name,
          industry: 'Technology',
          region: 'Global',
          demandScore,
          jobCount,
          avgSalary,
          dataSource: 'progression_model',
          recordedAt: date.toISOString()
        });
      }
    }
    
    await this.batchInsert('skill_demand_history', progressionRecords);
    logger.info(`Populated ${progressionRecords.length} skill progression records`);
  }

  /**
   * Get skill lifecycle stage
   */
  private getSkillLifecycle(skillName: string): 'emerging' | 'growing' | 'mature' | 'declining' {
    const emergingSkills = ['AI Prompt Engineering', 'Rust', 'Web3 Development', 'Quantum Computing'];
    const growingSkills = ['TypeScript', 'Go', 'Kubernetes', 'Machine Learning'];
    const decliningSkills = ['jQuery', 'Flash', 'Perl', 'ColdFusion'];
    
    if (emergingSkills.includes(skillName)) return 'emerging';
    if (growingSkills.includes(skillName)) return 'growing';
    if (decliningSkills.includes(skillName)) return 'declining';
    return 'mature';
  }

  /**
   * Calculate progression factor based on lifecycle
   */
  private calculateProgressionFactor(monthsBack: number, lifecycle: string): number {
    const timeProgress = (24 - monthsBack) / 24; // 0 to 1 over 24 months
    
    switch (lifecycle) {
      case 'emerging':
        // Exponential growth from low base
        return 0.2 + Math.pow(timeProgress, 0.5) * 0.8;
      case 'growing':
        // Steady linear growth
        return 0.6 + timeProgress * 0.3;
      case 'mature':
        // Stable with minor fluctuations
        return 0.8 + Math.sin(timeProgress * Math.PI * 4) * 0.1;
      case 'declining':
        // Gradual decline
        return 1.0 - timeProgress * 0.4;
      default:
        return 0.8;
    }
  }

  /**
   * Get seasonal factor for demand fluctuations
   */
  private getSeasonalFactor(month: number, category: string): number {
    // Different categories have different seasonal patterns
    const patterns: Record<string, number[]> = {
      'Programming': [0.02, 0.05, 0.08, 0.05, 0.02, -0.02, -0.05, -0.02, 0.05, 0.08, 0.05, 0.02],
      'AI & Machine Learning': [0.05, 0.08, 0.10, 0.08, 0.05, 0.02, -0.02, 0.02, 0.08, 0.10, 0.08, 0.05],
      'Cloud & DevOps': [0.03, 0.06, 0.08, 0.06, 0.03, 0.00, -0.03, 0.00, 0.06, 0.08, 0.06, 0.03],
      'Data Science': [0.04, 0.07, 0.09, 0.07, 0.04, 0.01, -0.01, 0.01, 0.07, 0.09, 0.07, 0.04],
      'Default': [0.02, 0.04, 0.06, 0.04, 0.02, 0.00, -0.02, 0.00, 0.04, 0.06, 0.04, 0.02]
    };
    
    const pattern = patterns[category] || patterns['Default'];
    return pattern[month] || 0;
  }

  /**
   * Calculate regional demand based on skill and region characteristics
   */
  private calculateRegionalDemand(skill: any, region: any): number {
    const baseDemand = skill.baseDemand;
    const regionalMultiplier = region.techMultiplier || 1.0;
    const categoryMultiplier = this.getRegionalCategoryMultiplier(region.name, skill.category);
    
    return Math.min(1, Math.max(0, baseDemand * regionalMultiplier * categoryMultiplier));
  }

  /**
   * Calculate regional supply based on skill and region characteristics
   */
  private calculateRegionalSupply(skill: any, region: any): number {
    const demand = this.calculateRegionalDemand(skill, region);
    const educationFactor = region.educationIndex || 0.8;
    const populationFactor = Math.min(1, region.population / 10000000); // Normalize by 10M
    
    // Supply is generally lower than demand, with some regional variation
    return Math.min(1, Math.max(0, demand * 0.7 * educationFactor * populationFactor));
  }

  /**
   * Get industry-skill multiplier
   */
  private getIndustrySkillMultiplier(industry: string, skillCategory: string): number {
    const multipliers: Record<string, Record<string, number>> = {
      'Technology': {
        'Programming': 1.5,
        'AI & Machine Learning': 1.4,
        'Cloud & DevOps': 1.3,
        'Data Science': 1.2,
        'Default': 1.0
      },
      'Finance': {
        'Data Science': 1.3,
        'Programming': 1.1,
        'AI & Machine Learning': 1.2,
        'Default': 0.8
      },
      'Healthcare': {
        'AI & Machine Learning': 1.2,
        'Data Science': 1.1,
        'Default': 0.7
      },
      'Default': {
        'Default': 1.0
      }
    };
    
    const industryMultipliers = multipliers[industry] || multipliers['Default'];
    return industryMultipliers[skillCategory] || industryMultipliers['Default'];
  }

  /**
   * Get regional category multiplier
   */
  private getRegionalCategoryMultiplier(region: string, category: string): number {
    // Some regions are stronger in certain skill categories
    const regionalStrengths: Record<string, Record<string, number>> = {
      'Silicon Valley': { 'AI & Machine Learning': 1.3, 'Programming': 1.2 },
      'New York': { 'Data Science': 1.2, 'Finance Tech': 1.3 },
      'London': { 'Finance Tech': 1.2, 'Programming': 1.1 },
      'Bangalore': { 'Programming': 1.2, 'Cloud & DevOps': 1.1 },
      'Berlin': { 'Programming': 1.1, 'AI & Machine Learning': 1.1 }
    };
    
    const strengths = regionalStrengths[region] || {};
    return strengths[category] || 1.0;
  }

  // Data definitions
  private getSkillsData() {
    return [
      { name: 'JavaScript', category: 'Programming', baseDemand: 0.92, growthTrend: 0.15, baseSalary: 120000, maxJobs: 45000 },
      { name: 'Python', category: 'Programming', baseDemand: 0.88, growthTrend: 0.25, baseSalary: 125000, maxJobs: 38000 },
      { name: 'React', category: 'Programming', baseDemand: 0.85, growthTrend: 0.20, baseSalary: 115000, maxJobs: 32000 },
      { name: 'TypeScript', category: 'Programming', baseDemand: 0.80, growthTrend: 0.28, baseSalary: 118000, maxJobs: 28000 },
      { name: 'Node.js', category: 'Programming', baseDemand: 0.78, growthTrend: 0.18, baseSalary: 112000, maxJobs: 26000 },
      { name: 'Java', category: 'Programming', baseDemand: 0.82, growthTrend: 0.08, baseSalary: 110000, maxJobs: 35000 },
      { name: 'C#', category: 'Programming', baseDemand: 0.75, growthTrend: 0.12, baseSalary: 108000, maxJobs: 22000 },
      { name: 'Go', category: 'Programming', baseDemand: 0.68, growthTrend: 0.35, baseSalary: 130000, maxJobs: 15000 },
      { name: 'Rust', category: 'Programming', baseDemand: 0.45, growthTrend: 0.55, baseSalary: 140000, maxJobs: 8000 },
      { name: 'Swift', category: 'Programming', baseDemand: 0.62, growthTrend: 0.15, baseSalary: 125000, maxJobs: 12000 },
      
      { name: 'Machine Learning', category: 'AI & Machine Learning', baseDemand: 0.78, growthTrend: 0.35, baseSalary: 140000, maxJobs: 25000 },
      { name: 'Deep Learning', category: 'AI & Machine Learning', baseDemand: 0.72, growthTrend: 0.40, baseSalary: 145000, maxJobs: 18000 },
      { name: 'Natural Language Processing', category: 'AI & Machine Learning', baseDemand: 0.65, growthTrend: 0.45, baseSalary: 142000, maxJobs: 12000 },
      { name: 'Computer Vision', category: 'AI & Machine Learning', baseDemand: 0.68, growthTrend: 0.38, baseSalary: 138000, maxJobs: 14000 },
      { name: 'TensorFlow', category: 'AI & Machine Learning', baseDemand: 0.70, growthTrend: 0.32, baseSalary: 135000, maxJobs: 16000 },
      { name: 'PyTorch', category: 'AI & Machine Learning', baseDemand: 0.68, growthTrend: 0.42, baseSalary: 138000, maxJobs: 15000 },
      { name: 'AI Prompt Engineering', category: 'AI & Machine Learning', baseDemand: 0.55, growthTrend: 0.85, baseSalary: 120000, maxJobs: 8000 },
      
      { name: 'AWS', category: 'Cloud & DevOps', baseDemand: 0.85, growthTrend: 0.25, baseSalary: 125000, maxJobs: 30000 },
      { name: 'Azure', category: 'Cloud & DevOps', baseDemand: 0.78, growthTrend: 0.28, baseSalary: 122000, maxJobs: 25000 },
      { name: 'Google Cloud', category: 'Cloud & DevOps', baseDemand: 0.72, growthTrend: 0.32, baseSalary: 128000, maxJobs: 20000 },
      { name: 'Kubernetes', category: 'Cloud & DevOps', baseDemand: 0.72, growthTrend: 0.40, baseSalary: 130000, maxJobs: 15000 },
      { name: 'Docker', category: 'Cloud & DevOps', baseDemand: 0.80, growthTrend: 0.22, baseSalary: 115000, maxJobs: 28000 },
      { name: 'DevOps', category: 'Cloud & DevOps', baseDemand: 0.76, growthTrend: 0.22, baseSalary: 118000, maxJobs: 22000 },
      { name: 'Terraform', category: 'Cloud & DevOps', baseDemand: 0.68, growthTrend: 0.35, baseSalary: 125000, maxJobs: 12000 },
      
      { name: 'Data Analysis', category: 'Data Science', baseDemand: 0.75, growthTrend: 0.18, baseSalary: 95000, maxJobs: 22000 },
      { name: 'SQL', category: 'Data Science', baseDemand: 0.88, growthTrend: 0.10, baseSalary: 85000, maxJobs: 40000 },
      { name: 'Tableau', category: 'Data Science', baseDemand: 0.65, growthTrend: 0.15, baseSalary: 92000, maxJobs: 15000 },
      { name: 'Power BI', category: 'Data Science', baseDemand: 0.68, growthTrend: 0.25, baseSalary: 88000, maxJobs: 18000 },
      { name: 'Apache Spark', category: 'Data Science', baseDemand: 0.58, growthTrend: 0.20, baseSalary: 125000, maxJobs: 10000 },
      { name: 'Pandas', category: 'Data Science', baseDemand: 0.72, growthTrend: 0.22, baseSalary: 105000, maxJobs: 16000 }
    ];
  }

  private getIndustriesData() {
    return [
      { name: 'Technology', salaryMultiplier: 1.2 },
      { name: 'Finance', salaryMultiplier: 1.15 },
      { name: 'Healthcare', salaryMultiplier: 1.05 },
      { name: 'E-commerce', salaryMultiplier: 1.1 },
      { name: 'Gaming', salaryMultiplier: 1.08 },
      { name: 'Education', salaryMultiplier: 0.9 },
      { name: 'Government', salaryMultiplier: 0.95 },
      { name: 'Manufacturing', salaryMultiplier: 1.0 },
      { name: 'Retail', salaryMultiplier: 0.85 },
      { name: 'Media', salaryMultiplier: 0.95 },
      { name: 'Consulting', salaryMultiplier: 1.1 },
      { name: 'Automotive', salaryMultiplier: 1.05 },
      { name: 'Energy', salaryMultiplier: 1.08 },
      { name: 'Telecommunications', salaryMultiplier: 1.05 },
      { name: 'Real Estate', salaryMultiplier: 0.95 }
    ];
  }

  private getRegionsData() {
    return [
      { name: 'North America', country: 'USA', city: 'San Francisco', salaryMultiplier: 1.4, techMultiplier: 1.3, educationIndex: 0.9, population: 8000000 },
      { name: 'North America', country: 'USA', city: 'New York', salaryMultiplier: 1.3, techMultiplier: 1.2, educationIndex: 0.85, population: 8500000 },
      { name: 'North America', country: 'USA', city: 'Seattle', salaryMultiplier: 1.25, techMultiplier: 1.25, educationIndex: 0.88, population: 750000 },
      { name: 'North America', country: 'USA', city: 'Austin', salaryMultiplier: 1.1, techMultiplier: 1.15, educationIndex: 0.82, population: 950000 },
      { name: 'North America', country: 'Canada', city: 'Toronto', salaryMultiplier: 1.0, techMultiplier: 1.1, educationIndex: 0.85, population: 2900000 },
      
      { name: 'Europe', country: 'UK', city: 'London', salaryMultiplier: 1.1, techMultiplier: 1.15, educationIndex: 0.88, population: 9000000 },
      { name: 'Europe', country: 'Germany', city: 'Berlin', salaryMultiplier: 0.95, techMultiplier: 1.1, educationIndex: 0.9, population: 3700000 },
      { name: 'Europe', country: 'Netherlands', city: 'Amsterdam', salaryMultiplier: 1.05, techMultiplier: 1.12, educationIndex: 0.92, population: 870000 },
      { name: 'Europe', country: 'France', city: 'Paris', salaryMultiplier: 1.0, techMultiplier: 1.05, educationIndex: 0.85, population: 2200000 },
      { name: 'Europe', country: 'Sweden', city: 'Stockholm', salaryMultiplier: 1.08, techMultiplier: 1.18, educationIndex: 0.95, population: 975000 },
      
      { name: 'Asia', country: 'India', city: 'Bangalore', salaryMultiplier: 0.4, techMultiplier: 1.2, educationIndex: 0.75, population: 12300000 },
      { name: 'Asia', country: 'India', city: 'Mumbai', salaryMultiplier: 0.42, techMultiplier: 1.1, educationIndex: 0.72, population: 20400000 },
      { name: 'Asia', country: 'Singapore', city: 'Singapore', salaryMultiplier: 0.9, techMultiplier: 1.25, educationIndex: 0.95, population: 5900000 },
      { name: 'Asia', country: 'Japan', city: 'Tokyo', salaryMultiplier: 0.85, techMultiplier: 1.15, educationIndex: 0.9, population: 14000000 },
      { name: 'Asia', country: 'China', city: 'Shanghai', salaryMultiplier: 0.6, techMultiplier: 1.2, educationIndex: 0.8, population: 24300000 },
      
      { name: 'Australia', country: 'Australia', city: 'Sydney', salaryMultiplier: 1.05, techMultiplier: 1.08, educationIndex: 0.88, population: 5300000 },
      { name: 'Australia', country: 'Australia', city: 'Melbourne', salaryMultiplier: 1.0, techMultiplier: 1.05, educationIndex: 0.85, population: 5100000 },
      
      { name: 'South America', country: 'Brazil', city: 'São Paulo', salaryMultiplier: 0.35, techMultiplier: 0.9, educationIndex: 0.7, population: 12300000 },
      { name: 'South America', country: 'Argentina', city: 'Buenos Aires', salaryMultiplier: 0.3, techMultiplier: 0.85, educationIndex: 0.75, population: 15200000 },
      
      { name: 'Africa', country: 'South Africa', city: 'Cape Town', salaryMultiplier: 0.25, techMultiplier: 0.8, educationIndex: 0.65, population: 4600000 }
    ];
  }

  private getEmergingSkillsData() {
    return [
      {
        name: 'AI Prompt Engineering',
        category: 'AI & Machine Learning',
        emergenceScore: 0.95,
        growthVelocity: 0.85,
        relatedSkills: ['Machine Learning', 'NLP', 'ChatGPT', 'GPT-4'],
        industries: ['Technology', 'Marketing', 'Education', 'Content Creation'],
        confidence: 0.88
      },
      {
        name: 'Rust Programming',
        category: 'Programming',
        emergenceScore: 0.82,
        growthVelocity: 0.45,
        relatedSkills: ['C++', 'Systems Programming', 'WebAssembly', 'Memory Safety'],
        industries: ['Technology', 'Gaming', 'Blockchain', 'Systems'],
        confidence: 0.75
      },
      {
        name: 'Web3 Development',
        category: 'Blockchain',
        emergenceScore: 0.78,
        growthVelocity: 0.38,
        relatedSkills: ['Blockchain', 'Solidity', 'Smart Contracts', 'DeFi'],
        industries: ['Finance', 'Technology', 'Gaming', 'NFTs'],
        confidence: 0.70
      },
      {
        name: 'Quantum Computing',
        category: 'Emerging Tech',
        emergenceScore: 0.65,
        growthVelocity: 0.55,
        relatedSkills: ['Mathematics', 'Physics', 'Algorithms', 'Qiskit'],
        industries: ['Research', 'Technology', 'Finance', 'Cryptography'],
        confidence: 0.68
      },
      {
        name: 'Edge Computing',
        category: 'Cloud & DevOps',
        emergenceScore: 0.73,
        growthVelocity: 0.42,
        relatedSkills: ['IoT', 'Cloud Computing', '5G', 'Distributed Systems'],
        industries: ['Technology', 'Manufacturing', 'Healthcare', 'Automotive'],
        confidence: 0.80
      },
      {
        name: 'MLOps',
        category: 'AI & Machine Learning',
        emergenceScore: 0.85,
        growthVelocity: 0.48,
        relatedSkills: ['Machine Learning', 'DevOps', 'Kubernetes', 'CI/CD'],
        industries: ['Technology', 'Finance', 'Healthcare', 'E-commerce'],
        confidence: 0.82
      },
      {
        name: 'Low-Code/No-Code',
        category: 'Development Platforms',
        emergenceScore: 0.78,
        growthVelocity: 0.52,
        relatedSkills: ['Business Process', 'Automation', 'Workflow Design'],
        industries: ['Business', 'Consulting', 'SMB', 'Enterprise'],
        confidence: 0.75
      },
      {
        name: 'Cybersecurity Mesh',
        category: 'Security',
        emergenceScore: 0.68,
        growthVelocity: 0.35,
        relatedSkills: ['Cybersecurity', 'Zero Trust', 'Network Security'],
        industries: ['Technology', 'Finance', 'Government', 'Healthcare'],
        confidence: 0.72
      },
      {
        name: 'Sustainable Tech',
        category: 'Green Technology',
        emergenceScore: 0.72,
        growthVelocity: 0.38,
        relatedSkills: ['Energy Efficiency', 'Carbon Footprint', 'Green Computing'],
        industries: ['Energy', 'Technology', 'Manufacturing', 'Government'],
        confidence: 0.70
      },
      {
        name: 'Metaverse Development',
        category: 'Extended Reality',
        emergenceScore: 0.65,
        growthVelocity: 0.42,
        relatedSkills: ['VR', 'AR', 'Unity', 'Unreal Engine', '3D Modeling'],
        industries: ['Gaming', 'Entertainment', 'Education', 'Real Estate'],
        confidence: 0.65
      }
    ];
  }
}