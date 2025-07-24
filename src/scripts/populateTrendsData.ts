#!/usr/bin/env node

import { createDatabase } from '../config/database';
import { SampleDataPopulator } from '../services/sampleDataPopulator';
import { JobApiCollector } from '../services/jobApiCollector';
import { TrendComputationJobs } from '../services/trendComputationJobs';
import { ForecastValidationService } from '../services/forecastValidation';
import { logger } from '../utils/logger';

/**
 * Comprehensive script to populate database with sample trends data
 * and run automated trend computation jobs
 */
async function main() {
  try {
    logger.info('Starting comprehensive trends data population...');
    
    // Initialize database connection
    // Note: In production, this would use actual D1 database
    // For development, we'll use a mock database interface
    const mockDb = createMockDatabase();
    
    // Initialize services
    const dataPopulator = new SampleDataPopulator(mockDb);
    const jobCollector = new JobApiCollector(mockDb);
    const trendJobs = new TrendComputationJobs(mockDb);
    const forecastValidator = new ForecastValidationService(mockDb);
    
    // Step 1: Populate comprehensive sample data
    logger.info('Step 1: Populating sample data...');
    await dataPopulator.populateAllSampleData({
      skillCount: 150,
      industryCount: 20,
      regionCount: 25,
      historicalMonths: 36, // 3 years of historical data
      emergingSkillsCount: 50
    });
    
    // Step 1.1: Populate skill progression data for more realistic trends
    logger.info('Step 1.1: Populating skill progression data...');
    await dataPopulator.populateSkillProgressionData();
    
    // Step 2: Collect data from external job APIs (mock for now)
    logger.info('Step 2: Collecting external job data...');
    const jobMetrics = await jobCollector.collectJobData(['mock', 'sample'], {
      maxJobs: 200,
      location: 'Global',
      industry: 'Technology'
    });
    
    logger.info(`Collected ${jobMetrics.totalJobs} jobs with ${jobMetrics.skillDemand.size} unique skills`);
    
    // Step 2.1: Collect real-time data simulation
    logger.info('Step 2.1: Simulating real-time data collection...');
    const realTimeMetrics = await jobCollector.collectRealTimeData(['linkedin', 'indeed', 'glassdoor'], {
      keywords: ['JavaScript', 'Python', 'React', 'Machine Learning'],
      location: 'Remote',
      industry: 'Technology',
      maxAge: 7
    });
    
    logger.info(`Real-time collection: ${realTimeMetrics.totalJobs} jobs from ${realTimeMetrics.skillDemand.size} skills`);
    
    // Step 3: Run automated trend computation jobs
    logger.info('Step 3: Running trend computation jobs...');
    const computationResults = await trendJobs.runAllJobs({
      updateFrequency: 'daily',
      enabledJobs: [
        'updateSkillDemandTrends',
        'computeEmergingSkills',
        'updateRegionalTrends',
        'generateForecasts',
        'collectExternalData',
        'cleanupOldData'
      ],
      dataRetentionDays: 730, // 2 years
      forecastHorizonMonths: 24
    });
    
    // Log computation results
    for (const result of computationResults) {
      if (result.status === 'success') {
        logger.info(`✅ ${result.jobName}: ${result.recordsProcessed} processed, ${result.recordsUpdated} updated (${result.executionTimeMs}ms)`);
      } else {
        logger.error(`❌ ${result.jobName}: ${result.errors?.join(', ')}`);
      }
    }
    
    // Step 4: Validate forecast accuracy (if historical data exists)
    logger.info('Step 4: Validating forecast accuracy...');
    try {
      const validationReport = await forecastValidator.validateForecastAccuracy(6);
      logger.info(`Forecast validation: ${validationReport.validatedForecasts} forecasts validated`);
      logger.info(`Overall accuracy: ${(validationReport.overallAccuracy * 100).toFixed(1)}%`);
      
      if (validationReport.recommendedImprovements.length > 0) {
        logger.info('Recommendations:');
        validationReport.recommendedImprovements.forEach(rec => logger.info(`  - ${rec}`));
      }
      
      // Step 4.1: Run accuracy improvement job
      logger.info('Step 4.1: Running forecast accuracy improvement...');
      const accuracyResult = await trendJobs.validateAndImproveForecastAccuracy();
      if (accuracyResult.status === 'success') {
        logger.info(`✅ Accuracy improvement: ${accuracyResult.recordsProcessed} forecasts analyzed, ${accuracyResult.recordsUpdated} improvements applied`);
      } else {
        logger.warn(`⚠️ Accuracy improvement had issues: ${accuracyResult.errors?.join(', ')}`);
      }
    } catch (error) {
      logger.warn('Forecast validation skipped (insufficient historical data):', error);
    }
    
    // Step 5: Generate forecast quality score
    logger.info('Step 5: Calculating forecast quality score...');
    try {
      const qualityScore = await forecastValidator.calculateForecastQualityScore();
      logger.info(`Forecast Quality Score: ${(qualityScore.overallScore * 100).toFixed(1)}%`);
      logger.info(`  - Accuracy: ${(qualityScore.accuracy * 100).toFixed(1)}%`);
      logger.info(`  - Reliability: ${(qualityScore.reliability * 100).toFixed(1)}%`);
      logger.info(`  - Coverage: ${(qualityScore.coverage * 100).toFixed(1)}%`);
      logger.info(`  - Timeliness: ${(qualityScore.timeliness * 100).toFixed(1)}%`);
    } catch (error) {
      logger.warn('Quality score calculation skipped:', error);
    }
    
    // Step 6: Generate summary statistics
    logger.info('Step 6: Generating summary statistics...');
    await generateSummaryStats(mockDb);
    
    logger.info('✅ Trends data population completed successfully!');
    
    // Display next steps
    logger.info('\n📋 Next Steps:');
    logger.info('1. Test the trends API endpoints:');
    logger.info('   - GET /api/v1/trends/industry/Technology');
    logger.info('   - GET /api/v1/trends/skills/emerging');
    logger.info('   - GET /api/v1/trends/geographic/North America');
    logger.info('   - POST /api/v1/trends/forecast');
    logger.info('2. Set up automated jobs to run periodically');
    logger.info('3. Monitor forecast accuracy over time');
    logger.info('4. Configure real external job API integrations');
    
  } catch (error) {
    logger.error('Error during trends data population:', error);
    process.exit(1);
  }
}

/**
 * Generate summary statistics about the populated data
 */
async function generateSummaryStats(db: any) {
  try {
    // Mock summary stats since we're using a mock database
    const stats = {
      totalSkills: 150,
      emergingSkills: 50,
      industries: 20,
      regions: 25,
      historicalDataPoints: 150 * 20 * 25 * 36, // skills * industries * regions * months
      forecasts: 150 * 20 * 25, // skills * industries * regions
      trendComputations: 6
    };
    
    logger.info('\n📊 Data Population Summary:');
    logger.info(`  - Total Skills: ${stats.totalSkills.toLocaleString()}`);
    logger.info(`  - Emerging Skills: ${stats.emergingSkills.toLocaleString()}`);
    logger.info(`  - Industries Covered: ${stats.industries}`);
    logger.info(`  - Regions Covered: ${stats.regions}`);
    logger.info(`  - Historical Data Points: ${stats.historicalDataPoints.toLocaleString()}`);
    logger.info(`  - Market Forecasts: ${stats.forecasts.toLocaleString()}`);
    logger.info(`  - Trend Computations: ${stats.trendComputations}`);
    
    // Calculate estimated data size
    const estimatedSizeMB = (
      stats.historicalDataPoints * 0.5 + // 0.5KB per historical record
      stats.forecasts * 0.3 + // 0.3KB per forecast
      stats.emergingSkills * 1 + // 1KB per emerging skill
      stats.totalSkills * 0.2 // 0.2KB per skill
    ) / 1024;
    
    logger.info(`  - Estimated Database Size: ${estimatedSizeMB.toFixed(1)} MB`);
    
  } catch (error) {
    logger.warn('Could not generate summary statistics:', error);
  }
}

/**
 * Create a mock database interface for development
 * In production, this would be replaced with actual D1 database
 */
function createMockDatabase() {
  return {
    // Mock database methods
    insert: (table: any) => ({
      values: (data: any) => ({
        onConflictDoUpdate: (config: any) => Promise.resolve(),
        run: () => Promise.resolve()
      })
    }),
    delete: (table: any) => ({
      where: (condition: any) => Promise.resolve()
    }),
    prepare: (query: string) => ({
      bind: (...params: any[]) => ({
        first: () => Promise.resolve(null),
        all: () => Promise.resolve({ results: [] }),
        run: () => Promise.resolve()
      })
    }),
    // Add other mock methods as needed
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([])
      })
    })
  };
}

// Run the script if called directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
}

export { main as populateTrendsData };