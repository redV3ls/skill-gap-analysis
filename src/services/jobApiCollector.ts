import { Database } from '../config/database';
import { logger } from '../utils/logger';
import { SkillExtractionService } from './skillExtraction';

export interface JobApiConfig {
  apiKey?: string;
  baseUrl: string;
  rateLimit: number; // requests per minute
  enabled: boolean;
}

export interface ExternalJobData {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salary?: {
    min?: number;
    max?: number;
    currency: string;
  };
  skills: string[];
  industry?: string;
  postedDate: string;
  source: string;
}

export interface JobMarketMetrics {
  totalJobs: number;
  skillDemand: Map<string, number>;
  averageSalaries: Map<string, number>;
  locationTrends: Map<string, number>;
  industryDistribution: Map<string, number>;
  collectionDate: string;
}

export class JobApiCollector {
  private skillExtractor: SkillExtractionService;
  private lastCollectionTime: Map<string, number> = new Map();

  constructor(private db: Database) {
    this.skillExtractor = new SkillExtractionService();
  }

  /**
   * Collect job data from multiple external APIs
   */
  async collectJobData(
    sources: string[] = ['mock', 'sample'],
    filters: {
      location?: string;
      industry?: string;
      skillKeywords?: string[];
      maxJobs?: number;
    } = {}
  ): Promise<JobMarketMetrics> {
    try {
      logger.info('Starting job data collection from external APIs...');
      
      const allJobs: ExternalJobData[] = [];
      
      for (const source of sources) {
        if (this.shouldSkipSource(source)) {
          logger.info(`Skipping ${source} due to rate limiting`);
          continue;
        }
        
        const jobs = await this.collectFromSource(source, filters);
        allJobs.push(...jobs);
        
        // Update rate limiting
        this.lastCollectionTime.set(source, Date.now());
        
        // Add delay between sources to respect rate limits
        await this.delay(1000);
      }
      
      logger.info(`Collected ${allJobs.length} jobs from ${sources.length} sources`);
      
      // Process and store the collected data
      const metrics = await this.processJobData(allJobs);
      await this.storeJobData(allJobs);
      await this.updateSkillDemandHistory(metrics);
      
      return metrics;
    } catch (error) {
      logger.error('Error collecting job data:', error);
      throw new Error('Failed to collect job data from external APIs');
    }
  }

  /**
   * Collect jobs from a specific source
   */
  private async collectFromSource(
    source: string,
    filters: any
  ): Promise<ExternalJobData[]> {
    switch (source) {
      case 'mock':
        return this.collectMockData(filters);
      case 'sample':
        return this.collectSampleData(filters);
      case 'github':
        return this.collectFromGitHubJobs(filters);
      case 'stackoverflow':
        return this.collectFromStackOverflow(filters);
      default:
        logger.warn(`Unknown job source: ${source}`);
        return [];
    }
  }

  /**
   * Generate mock job data for testing
   */
  private async collectMockData(filters: any): Promise<ExternalJobData[]> {
    const mockJobs: ExternalJobData[] = [];
    const maxJobs = filters.maxJobs || 50;
    
    const jobTitles = [
      'Senior Software Engineer',
      'Full Stack Developer',
      'Data Scientist',
      'DevOps Engineer',
      'Machine Learning Engineer',
      'Frontend Developer',
      'Backend Developer',
      'Cloud Architect',
      'Product Manager',
      'UX Designer'
    ];
    
    const companies = [
      'TechCorp', 'DataSoft', 'CloudSystems', 'AI Innovations',
      'WebSolutions', 'DevTools Inc', 'Analytics Pro', 'CodeCraft'
    ];
    
    const locations = [
      'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
      'Boston, MA', 'Denver, CO', 'Remote', 'London, UK', 'Berlin, Germany'
    ];
    
    const skillSets = [
      ['JavaScript', 'React', 'Node.js', 'TypeScript'],
      ['Python', 'Django', 'PostgreSQL', 'AWS'],
      ['Java', 'Spring', 'Microservices', 'Kubernetes'],
      ['Python', 'Machine Learning', 'TensorFlow', 'Data Analysis'],
      ['Go', 'Docker', 'Kubernetes', 'CI/CD'],
      ['React', 'Vue.js', 'CSS', 'HTML'],
      ['C#', '.NET', 'Azure', 'SQL Server']
    ];
    
    for (let i = 0; i < maxJobs; i++) {
      const title = jobTitles[Math.floor(Math.random() * jobTitles.length)];
      const company = companies[Math.floor(Math.random() * companies.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];
      const skills = skillSets[Math.floor(Math.random() * skillSets.length)];
      
      mockJobs.push({
        id: `mock-${i}`,
        title,
        company,
        location,
        description: `We are looking for a ${title} to join our team. ${this.generateJobDescription(skills)}`,
        salary: {
          min: 80000 + Math.floor(Math.random() * 100000),
          max: 120000 + Math.floor(Math.random() * 150000),
          currency: 'USD'
        },
        skills,
        industry: this.inferIndustry(company),
        postedDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'mock'
      });
    }
    
    return mockJobs;
  }

  /**
   * Generate sample job data based on current market trends
   */
  private async collectSampleData(filters: any): Promise<ExternalJobData[]> {
    // This would integrate with real job APIs in production
    // For now, return enhanced mock data with realistic skill distributions
    
    const trendingSkills = [
      'AI Prompt Engineering', 'Rust', 'Go', 'Kubernetes', 'MLOps',
      'TypeScript', 'React', 'Python', 'AWS', 'Machine Learning'
    ];
    
    const jobs: ExternalJobData[] = [];
    const maxJobs = filters.maxJobs || 30;
    
    for (let i = 0; i < maxJobs; i++) {
      const skillCount = Math.floor(Math.random() * 5) + 3; // 3-7 skills per job
      const jobSkills = this.selectRandomSkills(trendingSkills, skillCount);
      
      jobs.push({
        id: `sample-${i}`,
        title: this.generateJobTitle(jobSkills),
        company: `Company ${i + 1}`,
        location: filters.location || 'Remote',
        description: this.generateJobDescription(jobSkills),
        salary: this.generateSalary(jobSkills),
        skills: jobSkills,
        industry: filters.industry || 'Technology',
        postedDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'sample'
      });
    }
    
    return jobs;
  }

  /**
   * Simulate real-time job market data collection
   */
  async collectRealTimeData(
    sources: string[] = ['linkedin', 'indeed', 'glassdoor'],
    filters: {
      keywords?: string[];
      location?: string;
      industry?: string;
      salaryMin?: number;
      maxAge?: number; // days
    } = {}
  ): Promise<JobMarketMetrics> {
    try {
      logger.info('Simulating real-time job market data collection...');
      
      const allJobs: ExternalJobData[] = [];
      
      for (const source of sources) {
        const sourceJobs = await this.simulateSourceData(source, filters);
        allJobs.push(...sourceJobs);
        
        // Simulate API rate limiting
        await this.delay(500);
      }
      
      const metrics = await this.processJobData(allJobs);
      await this.storeRealTimeMetrics(metrics, sources);
      
      return metrics;
    } catch (error) {
      logger.error('Error collecting real-time data:', error);
      throw new Error('Failed to collect real-time job market data');
    }
  }

  /**
   * Simulate data from a specific job source
   */
  private async simulateSourceData(
    source: string,
    filters: any
  ): Promise<ExternalJobData[]> {
    const sourceConfigs = {
      linkedin: { jobCount: 50, skillVariety: 0.8, salaryAccuracy: 0.9 },
      indeed: { jobCount: 75, skillVariety: 0.6, salaryAccuracy: 0.7 },
      glassdoor: { jobCount: 30, skillVariety: 0.7, salaryAccuracy: 0.95 },
      stackoverflow: { jobCount: 40, skillVariety: 0.9, salaryAccuracy: 0.8 }
    };
    
    const config = sourceConfigs[source as keyof typeof sourceConfigs] || sourceConfigs.indeed;
    const jobs: ExternalJobData[] = [];
    
    // Generate jobs with source-specific characteristics
    for (let i = 0; i < config.jobCount; i++) {
      const skills = this.generateSourceSpecificSkills(source, config.skillVariety);
      const salary = this.generateSourceSpecificSalary(skills, config.salaryAccuracy);
      
      jobs.push({
        id: `${source}-${Date.now()}-${i}`,
        title: this.generateJobTitle(skills),
        company: this.generateCompanyName(source),
        location: filters.location || this.generateLocation(),
        description: this.generateJobDescription(skills),
        salary,
        skills,
        industry: filters.industry || this.inferIndustryFromSkills(skills),
        postedDate: this.generateRecentDate(filters.maxAge || 7),
        source
      });
    }
    
    return jobs;
  }

  /**
   * Generate skills specific to job source characteristics
   */
  private generateSourceSpecificSkills(source: string, variety: number): string[] {
    const skillPools = {
      linkedin: [
        'Leadership', 'Project Management', 'Strategic Planning', 'Business Development',
        'JavaScript', 'Python', 'AWS', 'Machine Learning', 'Data Analysis'
      ],
      indeed: [
        'JavaScript', 'Python', 'Java', 'SQL', 'HTML', 'CSS', 'React', 'Node.js'
      ],
      glassdoor: [
        'Software Engineering', 'System Design', 'Architecture', 'Team Leadership',
        'Python', 'Java', 'Kubernetes', 'Microservices'
      ],
      stackoverflow: [
        'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust',
        'Docker', 'Kubernetes', 'GraphQL', 'MongoDB', 'PostgreSQL'
      ]
    };
    
    const pool = skillPools[source as keyof typeof skillPools] || skillPools.indeed;
    const skillCount = Math.floor(3 + variety * 5); // 3-8 skills based on variety
    
    return this.selectRandomSkills(pool, skillCount);
  }

  /**
   * Generate salary with source-specific accuracy
   */
  private generateSourceSpecificSalary(
    skills: string[],
    accuracy: number
  ): { min: number; max: number; currency: string } {
    const baseSalary = this.generateSalary(skills);
    
    // Add noise based on accuracy (lower accuracy = more noise)
    const noise = (1 - accuracy) * 0.3; // Up to 30% noise
    const minNoise = (Math.random() - 0.5) * noise;
    const maxNoise = (Math.random() - 0.5) * noise;
    
    return {
      min: Math.floor(baseSalary.min * (1 + minNoise)),
      max: Math.floor(baseSalary.max * (1 + maxNoise)),
      currency: baseSalary.currency
    };
  }

  /**
   * Store real-time metrics for analysis
   */
  private async storeRealTimeMetrics(
    metrics: JobMarketMetrics,
    sources: string[]
  ): Promise<void> {
    logger.info(`Storing real-time metrics from ${sources.length} sources`);
    
    // In production, this would store in job_collection_metrics table
    const metricsRecord = {
      id: `metrics-${Date.now()}`,
      source: sources.join(','),
      totalJobsCollected: metrics.totalJobs,
      skillsIdentified: metrics.skillDemand.size,
      collectionDurationMs: 0, // Would be calculated
      successRate: 1.0,
      errors: null,
      collectionDate: metrics.collectionDate,
      createdAt: new Date().toISOString()
    };
    
    logger.info(`Collected ${metrics.totalJobs} jobs with ${metrics.skillDemand.size} unique skills`);
  }

  /**
   * Collect from GitHub Jobs API (placeholder)
   */
  private async collectFromGitHubJobs(filters: any): Promise<ExternalJobData[]> {
    // In production, this would make actual API calls to GitHub Jobs
    logger.info('GitHub Jobs API collection not implemented - using mock data');
    return this.collectMockData({ ...filters, maxJobs: 10 });
  }

  /**
   * Collect from Stack Overflow Jobs API (placeholder)
   */
  private async collectFromStackOverflow(filters: any): Promise<ExternalJobData[]> {
    // In production, this would make actual API calls to Stack Overflow Jobs
    logger.info('Stack Overflow Jobs API collection not implemented - using mock data');
    return this.collectMockData({ ...filters, maxJobs: 15 });
  }

  /**
   * Process collected job data to extract metrics
   */
  private async processJobData(jobs: ExternalJobData[]): Promise<JobMarketMetrics> {
    const skillDemand = new Map<string, number>();
    const averageSalaries = new Map<string, number>();
    const locationTrends = new Map<string, number>();
    const industryDistribution = new Map<string, number>();
    
    const skillSalaries = new Map<string, number[]>();
    
    for (const job of jobs) {
      // Count skill demand
      for (const skill of job.skills) {
        skillDemand.set(skill, (skillDemand.get(skill) || 0) + 1);
        
        // Track salaries for each skill
        if (job.salary?.min && job.salary?.max) {
          const avgSalary = (job.salary.min + job.salary.max) / 2;
          if (!skillSalaries.has(skill)) {
            skillSalaries.set(skill, []);
          }
          skillSalaries.get(skill)!.push(avgSalary);
        }
      }
      
      // Count location trends
      if (job.location) {
        locationTrends.set(job.location, (locationTrends.get(job.location) || 0) + 1);
      }
      
      // Count industry distribution
      if (job.industry) {
        industryDistribution.set(job.industry, (industryDistribution.get(job.industry) || 0) + 1);
      }
    }
    
    // Calculate average salaries per skill
    for (const [skill, salaries] of skillSalaries.entries()) {
      const avgSalary = salaries.reduce((sum, salary) => sum + salary, 0) / salaries.length;
      averageSalaries.set(skill, Math.round(avgSalary));
    }
    
    return {
      totalJobs: jobs.length,
      skillDemand,
      averageSalaries,
      locationTrends,
      industryDistribution,
      collectionDate: new Date().toISOString()
    };
  }

  /**
   * Store job data in database
   */
  private async storeJobData(jobs: ExternalJobData[]): Promise<void> {
    // In a real implementation, this would store jobs in the database using Drizzle ORM
    // For now, we'll just log that jobs were processed
    logger.info(`Processed ${jobs.length} jobs for storage`);
    
    const skillCounts = new Map<string, number>();
    const companyCounts = new Map<string, number>();
    
    for (const job of jobs) {
      // Count skills
      for (const skill of job.skills) {
        skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
      }
      
      // Count companies
      companyCounts.set(job.company, (companyCounts.get(job.company) || 0) + 1);
    }
    
    logger.info(`Found ${skillCounts.size} unique skills and ${companyCounts.size} unique companies`);
  }

  /**
   * Update skill demand history with collected data
   */
  private async updateSkillDemandHistory(metrics: JobMarketMetrics): Promise<void> {
    // In a real implementation, this would update skill demand history in the database
    logger.info(`Updated skill demand history for ${metrics.skillDemand.size} skills`);
    
    // Log top skills by demand
    const topSkills = Array.from(metrics.skillDemand.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    logger.info('Top skills by demand:');
    for (const [skill, count] of topSkills) {
      const demandScore = Math.min(1, count / metrics.totalJobs * 10);
      const avgSalary = metrics.averageSalaries.get(skill) || 0;
      logger.info(`  ${skill}: ${count} jobs (demand: ${demandScore.toFixed(2)}, avg salary: $${avgSalary})`);
    }
  }

  /**
   * Helper methods
   */
  private shouldSkipSource(source: string): boolean {
    const lastCollection = this.lastCollectionTime.get(source);
    if (!lastCollection) return false;
    
    const minInterval = 60000; // 1 minute minimum between collections
    return Date.now() - lastCollection < minInterval;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateJobTitle(skills: string[]): string {
    const titles = [
      'Senior Software Engineer',
      'Full Stack Developer',
      'Backend Developer',
      'Frontend Developer',
      'DevOps Engineer',
      'Data Scientist',
      'Machine Learning Engineer',
      'Cloud Architect',
      'Software Architect'
    ];
    
    // Choose title based on skills
    if (skills.includes('Machine Learning') || skills.includes('AI Prompt Engineering')) {
      return 'Machine Learning Engineer';
    }
    if (skills.includes('React') || skills.includes('Vue.js')) {
      return 'Frontend Developer';
    }
    if (skills.includes('Kubernetes') || skills.includes('AWS')) {
      return 'DevOps Engineer';
    }
    
    return titles[Math.floor(Math.random() * titles.length)];
  }

  private generateJobDescription(skills: string[]): string {
    const templates = [
      `We are seeking a talented professional with expertise in ${skills.slice(0, 3).join(', ')}. You will work on cutting-edge projects and collaborate with a dynamic team.`,
      `Join our innovative team! We need someone skilled in ${skills.slice(0, 2).join(' and ')} to help build the next generation of our platform.`,
      `Exciting opportunity for a developer with ${skills[0]} experience. You'll also work with ${skills.slice(1, 3).join(', ')} in a fast-paced environment.`
    ];
    
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateSalary(skills: string[]): { min: number; max: number; currency: string } {
    // Base salary ranges by skill type
    const salaryRanges: Record<string, { min: number; max: number }> = {
      'AI Prompt Engineering': { min: 110000, max: 180000 },
      'Machine Learning': { min: 120000, max: 200000 },
      'Rust': { min: 130000, max: 190000 },
      'Go': { min: 120000, max: 180000 },
      'Kubernetes': { min: 110000, max: 170000 },
      'AWS': { min: 100000, max: 160000 },
      'React': { min: 90000, max: 150000 },
      'Python': { min: 95000, max: 155000 },
      'JavaScript': { min: 85000, max: 145000 },
      'TypeScript': { min: 95000, max: 155000 }
    };
    
    // Find the highest paying skill in the job
    let maxRange = { min: 80000, max: 130000 }; // Default range
    
    for (const skill of skills) {
      const range = salaryRanges[skill];
      if (range && range.max > maxRange.max) {
        maxRange = range;
      }
    }
    
    // Add some randomness
    const variance = 0.1; // ±10%
    const minSalary = Math.floor(maxRange.min * (1 + (Math.random() - 0.5) * variance));
    const maxSalary = Math.floor(maxRange.max * (1 + (Math.random() - 0.5) * variance));
    
    return {
      min: minSalary,
      max: maxSalary,
      currency: 'USD'
    };
  }

  private selectRandomSkills(skillPool: string[], count: number): string[] {
    const shuffled = [...skillPool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  private inferIndustry(company: string): string {
    const industryKeywords: Record<string, string> = {
      'Tech': 'Technology',
      'Data': 'Technology',
      'Cloud': 'Technology',
      'AI': 'Technology',
      'Web': 'Technology',
      'Dev': 'Technology',
      'Code': 'Technology',
      'Analytics': 'Technology'
    };
    
    for (const [keyword, industry] of Object.entries(industryKeywords)) {
      if (company.includes(keyword)) {
        return industry;
      }
    }
    
    return 'Technology'; // Default
  }

  private categorizeSkill(skillName: string): string {
    const categories: Record<string, string> = {
      'JavaScript': 'Programming',
      'TypeScript': 'Programming',
      'Python': 'Programming',
      'Java': 'Programming',
      'Go': 'Programming',
      'Rust': 'Programming',
      'C#': 'Programming',
      'React': 'Programming',
      'Vue.js': 'Programming',
      'Node.js': 'Programming',
      'Machine Learning': 'AI & Machine Learning',
      'AI Prompt Engineering': 'AI & Machine Learning',
      'TensorFlow': 'AI & Machine Learning',
      'PyTorch': 'AI & Machine Learning',
      'AWS': 'Cloud & DevOps',
      'Azure': 'Cloud & DevOps',
      'Kubernetes': 'Cloud & DevOps',
      'Docker': 'Cloud & DevOps',
      'DevOps': 'Cloud & DevOps',
      'SQL': 'Data Science',
      'Data Analysis': 'Data Science',
      'Tableau': 'Data Science'
    };
    
    return categories[skillName] || 'General';
  }

  private generateCompanyName(source: string): string {
    const prefixes = ['Tech', 'Data', 'Cloud', 'AI', 'Digital', 'Smart', 'Cyber', 'Quantum'];
    const suffixes = ['Corp', 'Systems', 'Solutions', 'Labs', 'Works', 'Dynamics', 'Innovations'];
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return `${prefix}${suffix}`;
  }

  private generateLocation(): string {
    const locations = [
      'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
      'Boston, MA', 'Denver, CO', 'Remote', 'London, UK', 'Berlin, Germany',
      'Toronto, Canada', 'Sydney, Australia', 'Singapore'
    ];
    
    return locations[Math.floor(Math.random() * locations.length)];
  }

  private inferIndustryFromSkills(skills: string[]): string {
    const industryKeywords = {
      'Technology': ['JavaScript', 'Python', 'React', 'AWS', 'Docker'],
      'Finance': ['SQL', 'Data Analysis', 'Risk Management', 'Compliance'],
      'Healthcare': ['Machine Learning', 'Data Science', 'Python', 'R'],
      'E-commerce': ['React', 'Node.js', 'MongoDB', 'Redis'],
      'Gaming': ['Unity', 'C#', 'Unreal Engine', '3D Modeling']
    };
    
    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (skills.some(skill => keywords.includes(skill))) {
        return industry;
      }
    }
    
    return 'Technology';
  }

  private generateRecentDate(maxAgeDays: number): string {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const randomAge = Math.random() * maxAgeMs;
    const date = new Date(Date.now() - randomAge);
    
    return date.toISOString();
  }
}