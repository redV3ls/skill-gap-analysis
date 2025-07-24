import { Hono } from 'hono';
import { createDatabase } from '../config/database';
import { TrendsAnalysisService } from '../services/trendsAnalysis';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const trends = new Hono<{ Bindings: { DB: D1Database; CACHE: KVNamespace } }>();

// Validation schemas
const industryTrendsSchema = z.object({
  region: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(10),
});

const emergingSkillsSchema = z.object({
  category: z.string().optional(),
  minGrowthRate: z.coerce.number().min(0).max(1).default(0.2),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const regionalTrendsSchema = z.object({
  skillCategory: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(10),
});

const forecastSchema = z.object({
  skill_names: z.array(z.string()).min(1).max(20),
  industry: z.string().optional(),
  region: z.string().optional(),
});

const velocitySchema = z.object({
  timeWindow: z.coerce.number().min(1).max(24).default(6),
});

const decliningSkillsSchema = z.object({
  threshold: z.coerce.number().min(-1).max(0).default(-0.1),
  timeWindow: z.coerce.number().min(1).max(24).default(12),
});

// GET /trends/industry/:industry - Get industry trends
trends.get('/industry/:industry', zValidator('query', industryTrendsSchema), async (c) => {
  try {
    const industry = c.req.param('industry');
    const { region, limit } = c.req.valid('query');
    
    const db = createDatabase(c.env.DB);
    const trendsService = new TrendsAnalysisService(db);
    
    const trends = await trendsService.getIndustryTrends(industry, region, limit);
    
    return c.json({
      success: true,
      data: {
        industry,
        region,
        trends,
        metadata: {
          count: trends.length,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching industry trends:', error);
    return c.json({
      success: false,
      error: {
        code: 'TRENDS_FETCH_ERROR',
        message: 'Failed to fetch industry trends',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

// GET /trends/skills/emerging - Get emerging skills
trends.get('/skills/emerging', zValidator('query', emergingSkillsSchema), async (c) => {
  try {
    const { category, minGrowthRate, limit } = c.req.valid('query');
    
    const db = createDatabase(c.env.DB);
    const trendsService = new TrendsAnalysisService(db);
    
    const emergingSkills = await trendsService.getEmergingSkills(category, minGrowthRate, limit);
    
    return c.json({
      success: true,
      data: {
        emergingSkills,
        filters: {
          category,
          minGrowthRate,
        },
        metadata: {
          count: emergingSkills.length,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching emerging skills:', error);
    return c.json({
      success: false,
      error: {
        code: 'EMERGING_SKILLS_ERROR',
        message: 'Failed to fetch emerging skills',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

// GET /trends/geographic/:region - Get regional trends
trends.get('/geographic/:region', zValidator('query', regionalTrendsSchema), async (c) => {
  try {
    const region = c.req.param('region');
    const { skillCategory, limit } = c.req.valid('query');
    
    const db = createDatabase(c.env.DB);
    const trendsService = new TrendsAnalysisService(db);
    
    const regionalTrends = await trendsService.getRegionalTrends(region, skillCategory, limit);
    
    return c.json({
      success: true,
      data: {
        region,
        trends: regionalTrends,
        filters: {
          skillCategory,
        },
        metadata: {
          count: regionalTrends.length,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching regional trends:', error);
    return c.json({
      success: false,
      error: {
        code: 'REGIONAL_TRENDS_ERROR',
        message: 'Failed to fetch regional trends',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

// POST /trends/forecast - Generate skill forecasts
trends.post('/forecast', zValidator('json', forecastSchema), async (c) => {
  try {
    const { skill_names, industry, region } = c.req.valid('json');
    
    const db = createDatabase(c.env.DB);
    const trendsService = new TrendsAnalysisService(db);
    
    const forecasts = await trendsService.generateSkillForecasts(skill_names, industry, region);
    
    return c.json({
      success: true,
      data: {
        forecasts,
        parameters: {
          skillNames: skill_names,
          industry,
          region,
        },
        metadata: {
          count: forecasts.length,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error('Error generating skill forecasts:', error);
    return c.json({
      success: false,
      error: {
        code: 'FORECAST_ERROR',
        message: 'Failed to generate skill forecasts',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

// GET /trends/skills/declining - Get declining skills
trends.get('/skills/declining', zValidator('query', decliningSkillsSchema), async (c) => {
  try {
    const { threshold, timeWindow } = c.req.valid('query');
    
    const db = createDatabase(c.env.DB);
    const trendsService = new TrendsAnalysisService(db);
    
    const decliningSkills = await trendsService.identifyDecliningSkills(threshold, timeWindow);
    
    return c.json({
      success: true,
      data: {
        decliningSkills,
        parameters: {
          threshold,
          timeWindow,
        },
        metadata: {
          count: decliningSkills.length,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching declining skills:', error);
    return c.json({
      success: false,
      error: {
        code: 'DECLINING_SKILLS_ERROR',
        message: 'Failed to fetch declining skills',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

// GET /trends/skills/velocity - Get skill growth velocity
trends.get('/skills/velocity', zValidator('query', velocitySchema), async (c) => {
  try {
    const { timeWindow } = c.req.valid('query');
    
    const db = createDatabase(c.env.DB);
    const trendsService = new TrendsAnalysisService(db);
    
    const velocityMap = await trendsService.analyzeGrowthVelocity(timeWindow);
    
    // Convert Map to array for JSON response
    const velocityData = Array.from(velocityMap.entries()).map(([skillName, velocity]) => ({
      skillName,
      velocity,
      trend: velocity > 0.1 ? 'growing' : velocity < -0.1 ? 'declining' : 'stable',
    }));
    
    return c.json({
      success: true,
      data: {
        skillVelocities: velocityData,
        parameters: {
          timeWindow,
        },
        metadata: {
          count: velocityData.length,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    logger.error('Error analyzing skill velocity:', error);
    return c.json({
      success: false,
      error: {
        code: 'VELOCITY_ANALYSIS_ERROR',
        message: 'Failed to analyze skill velocity',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

export default trends;