import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TrendsAnalysisService } from '../services/trendsAnalysis';
import { JobApiCollector } from '../services/jobApiCollector';
import { TrendComputationJobs } from '../services/trendComputationJobs';
import { ForecastValidationService } from '../services/forecastValidation';
import { SampleDataPopulator } from '../services/sampleDataPopulator';

// Mock database
const mockDb = {
  prepare: jest.fn(() => ({
    bind: jest.fn(() => ({
      run: jest.fn(() => Promise.resolve({ success: true, changes: 1 })),
      all: jest.fn(() => Promise.resolve({ results: [] })),
      first: jest.fn(() => Promise.resolve(null))
    })),
    run: jest.fn(() => Promise.resolve({ success: true, changes: 1 })),
    all: jest.fn(() => Promise.resolve({ results: [] })),
    first: jest.fn(() => Promise.resolve(null))
  }))
} as any;

describe('Trends Analysis System', () => {
  let trendsService: TrendsAnalysisService;
  let jobCollector: JobApiCollector;
  let computationJobs: TrendComputationJobs;
  let forecastValidation: ForecastValidationService;
  let sampleDataPopulator: SampleDataPopulator;

  beforeEach(() => {
    jest.clearAllMocks();
    trendsService = new TrendsAnalysisService(mockDb);
    jobCollector = new JobApiCollector(mockDb);
    computationJobs = new TrendComputationJobs(mockDb);
    forecastValidation = new ForecastValidationService(mockDb);
    sampleDataPopulator = new SampleDataPopulator(mockDb);
  });

  describe('TrendsAnalysisService', () => {
    it('should get industry trends with proper filtering', async () => {
      // Mock database response
      mockDb.prepare.mockReturnValue({
        bind: jest.fn(() => ({
          all: jest.fn(() => Promise.resolve({
            results: [
              {
                industry: 'Technology',
                skillName: 'JavaScript',
                avgDemand: 0.85,
                avgGrowth: 0.15,
                avgSalary: 120000,
                totalJobs: 1500
              }
            ]
          }))
        }))
      });

      const trends = await trendsService.getIndustryTrends('Technology', 'Global', 10);
      
      expect(trends).toBeDefined();
      expect(Array.isArray(trends)).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should get emerging skills with growth threshold', async () => {
      mockDb.prepare.mockReturnValue({
        bind: jest.fn(() => ({
          all: jest.fn(() => Promise.resolve({
            results: [
              {
                skillName: 'AI Prompt Engineering',
                category: 'AI & Machine Learning',
                emergenceScore: 0.95,
                growthVelocity: 0.85,
                relatedSkills: '["Machine Learning", "NLP"]',
                predictedPeakDemand: '2025-12-31'
              }
            ]
          }))
        }))
      });

      const emergingSkills = await trendsService.getEmergingSkills('AI & Machine Learning', 0.3, 20);
      
      expect(emergingSkills).toBeDefined();
      expect(Array.isArray(emergingSkills)).toBe(true);
    });

    it('should generate skill forecasts', async () => {
      const skillNames = ['JavaScript', 'Python', 'React'];
      
      const forecasts = await trendsService.generateSkillForecasts(
        skillNames,
        'Technology',
        'Global'
      );
      
      expect(forecasts).toBeDefined();
      expect(Array.isArray(forecasts)).toBe(true);
    });

    it('should analyze growth velocity', async () => {
      mockDb.prepare.mockReturnValue({
        bind: jest.fn(() => ({
          all: jest.fn(() => Promise.resolve({
            results: [
              {
                skillName: 'TypeScript',
                initialDemand: 0.6,
                currentDemand: 0.8,
                dataPoints: 6
              }
            ]
          }))
        }))
      });

      const velocityMap = await trendsService.analyzeGrowthVelocity(6);
      
      expect(velocityMap).toBeInstanceOf(Map);
    });

    it('should identify declining skills', async () => {
      const decliningSkills = await trendsService.identifyDecliningSkills(-0.1, 12);
      
      expect(decliningSkills).toBeDefined();
      expect(Array.isArray(decliningSkills)).toBe(true);
    });
  });

  describe('JobApiCollector', () => {
    it('should collect job data from multiple sources', async () => {
      const metrics = await jobCollector.collectJobData(['mock'], {
        maxJobs: 50,
        location: 'Remote',
        industry: 'Technology'
      });
      
      expect(metrics).toBeDefined();
      expect(metrics.totalJobs).toBeGreaterThan(0);
      expect(metrics.skillDemand).toBeInstanceOf(Map);
      expect(metrics.averageSalaries).toBeInstanceOf(Map);
      expect(metrics.locationTrends).toBeInstanceOf(Map);
      expect(metrics.industryDistribution).toBeInstanceOf(Map);
    });

    it('should generate realistic mock job data', async () => {
      const metrics = await jobCollector.collectJobData(['mock'], {
        maxJobs: 10
      });
      
      expect(metrics.totalJobs).toBe(10);
      expect(metrics.skillDemand.size).toBeGreaterThan(0);
      
      // Check that skills have reasonable demand counts
      for (const [skill, count] of metrics.skillDemand.entries()) {
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(10);
      }
    });

    it('should handle rate limiting between sources', async () => {
      const startTime = Date.now();
      
      await jobCollector.collectJobData(['mock', 'sample'], {
        maxJobs: 5
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take at least 1 second due to delay between sources
      expect(duration).toBeGreaterThan(1000);
    });
  });

  describe('TrendComputationJobs', () => {
    it('should run all enabled computation jobs', async () => {
      const results = await computationJobs.runAllJobs({
        enabledJobs: ['updateSkillDemandTrends', 'computeEmergingSkills']
      });
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      
      for (const result of results) {
        expect(result).toHaveProperty('jobName');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('recordsProcessed');
        expect(result).toHaveProperty('recordsUpdated');
        expect(result).toHaveProperty('executionTimeMs');
        expect(result).toHaveProperty('lastRun');
      }
    });

    it('should handle job failures gracefully', async () => {
      // Mock a database error
      mockDb.prepare.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const results = await computationJobs.runAllJobs({
        enabledJobs: ['updateSkillDemandTrends']
      });
      
      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('error');
      expect(results[0].errors).toBeDefined();
      expect(results[0].errors!.length).toBeGreaterThan(0);
    });

    it('should prevent concurrent job execution', async () => {
      // Start first job execution
      const promise1 = computationJobs.runAllJobs({
        enabledJobs: ['updateSkillDemandTrends']
      });
      
      // Try to start second job execution immediately
      const promise2 = computationJobs.runAllJobs({
        enabledJobs: ['computeEmergingSkills']
      });
      
      await expect(promise2).rejects.toThrow('already running');
      await promise1; // Wait for first to complete
    });
  });

  describe('ForecastValidationService', () => {
    it('should validate forecast accuracy', async () => {
      mockDb.prepare.mockReturnValue({
        bind: jest.fn(() => ({
          all: jest.fn(() => Promise.resolve({ results: [] }))
        }))
      });

      const report = await forecastValidation.validateForecastAccuracy(6);
      
      expect(report).toBeDefined();
      expect(report).toHaveProperty('overallAccuracy');
      expect(report).toHaveProperty('skillAccuracies');
      expect(report).toHaveProperty('horizonAccuracies');
      expect(report).toHaveProperty('totalForecasts');
      expect(report).toHaveProperty('validatedForecasts');
      expect(report).toHaveProperty('recommendedImprovements');
      expect(report.validationDate).toBeDefined();
    });

    it('should calculate forecast quality score', async () => {
      const qualityScore = await forecastValidation.calculateForecastQualityScore();
      
      expect(qualityScore).toBeDefined();
      expect(qualityScore).toHaveProperty('accuracy');
      expect(qualityScore).toHaveProperty('reliability');
      expect(qualityScore).toHaveProperty('coverage');
      expect(qualityScore).toHaveProperty('timeliness');
      expect(qualityScore).toHaveProperty('overallScore');
      
      // All scores should be between 0 and 1
      expect(qualityScore.accuracy).toBeGreaterThanOrEqual(0);
      expect(qualityScore.accuracy).toBeLessThanOrEqual(1);
      expect(qualityScore.overallScore).toBeGreaterThanOrEqual(0);
      expect(qualityScore.overallScore).toBeLessThanOrEqual(1);
    });

    it('should generate improvement recommendations', async () => {
      const recommendations = await forecastValidation.getForecastImprovementRecommendations();
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Each recommendation should be a non-empty string
      for (const recommendation of recommendations) {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      }
    });

    it('should monitor forecast drift', async () => {
      const driftAnalysis = await forecastValidation.monitorForecastDrift('JavaScript', 12);
      
      expect(driftAnalysis).toBeDefined();
      expect(driftAnalysis).toHaveProperty('skillName');
      expect(driftAnalysis).toHaveProperty('driftScore');
      expect(driftAnalysis).toHaveProperty('trendDirection');
      expect(driftAnalysis).toHaveProperty('recentAccuracy');
      expect(driftAnalysis).toHaveProperty('historicalAccuracy');
      expect(driftAnalysis).toHaveProperty('recommendations');
      
      expect(driftAnalysis.skillName).toBe('JavaScript');
      expect(['improving', 'degrading', 'stable']).toContain(driftAnalysis.trendDirection);
      expect(Array.isArray(driftAnalysis.recommendations)).toBe(true);
    });
  });

  describe('SampleDataPopulator', () => {
    it('should populate all sample data types', async () => {
      await expect(sampleDataPopulator.populateAllSampleData({
        skillCount: 10,
        industryCount: 5,
        regionCount: 5,
        historicalMonths: 6,
        emergingSkillsCount: 5
      })).resolves.not.toThrow();
      
      // Verify database calls were made
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should handle custom configuration', async () => {
      const customConfig = {
        skillCount: 25,
        industryCount: 8,
        regionCount: 12,
        historicalMonths: 12,
        emergingSkillsCount: 15
      };
      
      await expect(sampleDataPopulator.populateAllSampleData(customConfig))
        .resolves.not.toThrow();
    });

    it('should use default configuration when none provided', async () => {
      await expect(sampleDataPopulator.populateAllSampleData())
        .resolves.not.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should complete full trends analysis workflow', async () => {
      // 1. Populate sample data
      await sampleDataPopulator.populateAllSampleData({
        skillCount: 20,
        industryCount: 5,
        regionCount: 5,
        historicalMonths: 6,
        emergingSkillsCount: 10
      });
      
      // 2. Collect job data
      const jobMetrics = await jobCollector.collectJobData(['mock'], {
        maxJobs: 20
      });
      
      expect(jobMetrics.totalJobs).toBe(20);
      
      // 3. Run computation jobs
      const computationResults = await computationJobs.runAllJobs({
        enabledJobs: ['updateSkillDemandTrends', 'computeEmergingSkills']
      });
      
      expect(computationResults.length).toBe(2);
      
      // 4. Validate forecasts
      const validationReport = await forecastValidation.validateForecastAccuracy(3);
      
      expect(validationReport).toBeDefined();
      
      // 5. Get quality score
      const qualityScore = await forecastValidation.calculateForecastQualityScore();
      
      expect(qualityScore.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors in workflow gracefully', async () => {
      // Mock a database error for one step
      const originalPrepare = mockDb.prepare;
      let callCount = 0;
      
      mockDb.prepare.mockImplementation(() => {
        callCount++;
        if (callCount === 5) { // Fail on 5th database call
          throw new Error('Simulated database error');
        }
        return originalPrepare();
      });
      
      // The workflow should handle errors and continue
      await expect(sampleDataPopulator.populateAllSampleData({
        skillCount: 5
      })).rejects.toThrow();
      
      // But other services should still work
      const jobMetrics = await jobCollector.collectJobData(['mock'], {
        maxJobs: 5
      });
      
      expect(jobMetrics.totalJobs).toBe(5);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      const startTime = Date.now();
      
      const jobMetrics = await jobCollector.collectJobData(['mock'], {
        maxJobs: 100
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(jobMetrics.totalJobs).toBe(100);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should batch database operations efficiently', async () => {
      const startTime = Date.now();
      
      await sampleDataPopulator.populateAllSampleData({
        skillCount: 50,
        industryCount: 10,
        regionCount: 10,
        historicalMonths: 12,
        emergingSkillsCount: 20
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time even with large dataset
      expect(duration).toBeLessThan(30000); // 30 seconds
    });
  });
});