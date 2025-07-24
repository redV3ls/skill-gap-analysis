import { Database } from '../config/database';
import { logger } from '../utils/logger';
import { IntelligentCachingService } from './intelligentCaching';
import { Env } from '../index';
import { eq, and, or, desc, asc, sql, inArray, like, gte, lte, count } from 'drizzle-orm';
import * as schema from '../db/schema';

export interface QueryPerformanceMetrics {
  queryId: string;
  executionTime: number;
  rowsReturned: number;
  cacheHit: boolean;
  optimizationApplied: string[];
}

export interface QueryOptimizationConfig {
  enableCaching: boolean;
  cacheType: string;
  cacheTTL?: number;
  enablePagination: boolean;
  defaultPageSize: number;
  maxPageSize: number;
  enableIndexHints: boolean;
  enableQueryRewriting: boolean;
}

export class QueryOptimizationService {
  private db: Database;
  private cache: IntelligentCachingService;
  private queryMetrics: Map<string, QueryPerformanceMetrics[]> = new Map();

  private readonly DEFAULT_CONFIG: QueryOptimizationConfig = {
    enableCaching: true,
    cacheType: 'api_response',
    enablePagination: true,
    defaultPageSize: 20,
    maxPageSize: 100,
    enableIndexHints: true,
    enableQueryRewriting: true,
  };

  constructor(db: Database, env: Env) {
    this.db = db;
    this.cache = new IntelligentCachingService(env);
  }

  /**
   * Optimized user profile queries
   */
  async getUserProfileOptimized(
    userId: string,
    config: Partial<QueryOptimizationConfig> = {}
  ): Promise<any> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const queryId = `user_profile_${userId}`;
    const startTime = Date.now();

    try {
      // Try cache first
      if (finalConfig.enableCaching) {
        const cached = await this.cache.get(queryId, 'user_profile');
        if (cached) {
          this.recordQueryMetrics(queryId, Date.now() - startTime, 1, true, ['cache_hit']);
          return cached;
        }
      }

      // Optimized query with covering index
      const profile = await this.db
        .select({
          id: schema.userProfiles.id,
          userId: schema.userProfiles.userId,
          title: schema.userProfiles.title,
          industry: schema.userProfiles.industry,
          location: schema.userProfiles.location,
          experience: schema.userProfiles.experience,
          learningStyle: schema.userProfiles.learningStyle,
          timeCommitment: schema.userProfiles.timeCommitment,
          budgetRange: schema.userProfiles.budgetRange,
          createdAt: schema.userProfiles.createdAt,
          updatedAt: schema.userProfiles.updatedAt,
        })
        .from(schema.userProfiles)
        .where(eq(schema.userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        return null;
      }

      // Get user skills with optimized join
      const userSkills = await this.db
        .select({
          id: schema.userSkills.id,
          skillId: schema.userSkills.skillId,
          skillName: schema.skills.name,
          skillCategory: schema.skills.category,
          level: schema.userSkills.level,
          yearsExperience: schema.userSkills.yearsExperience,
          lastUsed: schema.userSkills.lastUsed,
          confidenceScore: schema.userSkills.confidenceScore,
          certifications: schema.userSkills.certifications,
        })
        .from(schema.userSkills)
        .innerJoin(schema.skills, eq(schema.userSkills.skillId, schema.skills.id))
        .where(eq(schema.userSkills.userId, profile[0].id));

      const result = {
        ...profile[0],
        skills: userSkills.map(skill => ({
          ...skill,
          certifications: skill.certifications ? JSON.parse(skill.certifications) : [],
        })),
      };

      // Cache the result
      if (finalConfig.enableCaching) {
        await this.cache.set(queryId, result, 'user_profile');
      }

      this.recordQueryMetrics(queryId, Date.now() - startTime, 1, false, ['optimized_join']);
      return result;
    } catch (error) {
      logger.error('Error in optimized user profile query:', error);
      throw error;
    }
  }

  /**
   * Optimized skill matching queries with pagination
   */
  async getSkillsOptimized(
    filters: {
      category?: string;
      searchTerm?: string;
      limit?: number;
      offset?: number;
    } = {},
    config: Partial<QueryOptimizationConfig> = {}
  ): Promise<{ skills: any[]; total: number; hasMore: boolean }> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const limit = Math.min(filters.limit || finalConfig.defaultPageSize, finalConfig.maxPageSize);
    const offset = filters.offset || 0;
    
    const queryId = `skills_${JSON.stringify(filters)}_${limit}_${offset}`;
    const startTime = Date.now();

    try {
      // Try cache first
      if (finalConfig.enableCaching) {
        const cached = await this.cache.get(queryId, 'skills_taxonomy');
        if (cached) {
          this.recordQueryMetrics(queryId, Date.now() - startTime, cached.skills.length, true, ['cache_hit']);
          return cached;
        }
      }

      // Build optimized query conditions
      const conditions = [];
      const optimizations = ['indexed_query'];

      if (filters.category) {
        conditions.push(eq(schema.skills.category, filters.category));
        optimizations.push('category_filter');
      }

      if (filters.searchTerm) {
        // Use indexed LIKE query instead of full-text search for better performance
        conditions.push(like(schema.skills.name, `%${filters.searchTerm}%`));
        optimizations.push('name_search');
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count efficiently
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(schema.skills)
        .where(whereClause);

      const total = totalResult.count;

      // Get paginated results with covering index
      const skills = await this.db
        .select({
          id: schema.skills.id,
          name: schema.skills.name,
          category: schema.skills.category,
          description: schema.skills.description,
          createdAt: schema.skills.createdAt,
        })
        .from(schema.skills)
        .where(whereClause)
        .orderBy(asc(schema.skills.name))
        .limit(limit)
        .offset(offset);

      const result = {
        skills,
        total,
        hasMore: offset + limit < total,
      };

      // Cache the result
      if (finalConfig.enableCaching) {
        await this.cache.set(queryId, result, 'skills_taxonomy');
      }

      this.recordQueryMetrics(queryId, Date.now() - startTime, skills.length, false, optimizations);
      return result;
    } catch (error) {
      logger.error('Error in optimized skills query:', error);
      throw error;
    }
  }

  /**
   * Optimized gap analysis queries with complex joins
   */
  async getGapAnalysesOptimized(
    userId: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    } = {},
    config: Partial<QueryOptimizationConfig> = {}
  ): Promise<{ analyses: any[]; total: number; hasMore: boolean }> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const limit = Math.min(filters.limit || finalConfig.defaultPageSize, finalConfig.maxPageSize);
    const offset = filters.offset || 0;
    
    const queryId = `gap_analyses_${userId}_${JSON.stringify(filters)}_${limit}_${offset}`;
    const startTime = Date.now();

    try {
      // Try cache first
      if (finalConfig.enableCaching) {
        const cached = await this.cache.get(queryId, 'gap_analysis');
        if (cached) {
          this.recordQueryMetrics(queryId, Date.now() - startTime, cached.analyses.length, true, ['cache_hit']);
          return cached;
        }
      }

      // Build date filter conditions
      const conditions = [eq(schema.gapAnalyses.userId, userId)];
      const optimizations = ['user_index', 'date_range'];

      if (filters.dateFrom) {
        conditions.push(gte(schema.gapAnalyses.createdAt, filters.dateFrom));
      }

      if (filters.dateTo) {
        conditions.push(lte(schema.gapAnalyses.createdAt, filters.dateTo));
      }

      const whereClause = and(...conditions);

      // Get total count
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(schema.gapAnalyses)
        .where(whereClause);

      const total = totalResult.count;

      // Get analyses with job details in single query
      const analyses = await this.db
        .select({
          id: schema.gapAnalyses.id,
          userId: schema.gapAnalyses.userId,
          jobId: schema.gapAnalyses.jobId,
          jobTitle: schema.jobs.title,
          jobCompany: schema.jobs.company,
          jobIndustry: schema.jobs.industry,
          overallMatch: schema.gapAnalyses.overallMatch,
          createdAt: schema.gapAnalyses.createdAt,
        })
        .from(schema.gapAnalyses)
        .innerJoin(schema.jobs, eq(schema.gapAnalyses.jobId, schema.jobs.id))
        .where(whereClause)
        .orderBy(desc(schema.gapAnalyses.createdAt))
        .limit(limit)
        .offset(offset);

      // Get skill gaps for each analysis in batch
      if (analyses.length > 0) {
        const analysisIds = analyses.map(a => a.id);
        const skillGaps = await this.db
          .select({
            analysisId: schema.skillGaps.analysisId,
            skillName: schema.skillGaps.skillName,
            currentLevel: schema.skillGaps.currentLevel,
            requiredLevel: schema.skillGaps.requiredLevel,
            gapSeverity: schema.skillGaps.gapSeverity,
            timeToBridge: schema.skillGaps.timeToBridge,
          })
          .from(schema.skillGaps)
          .where(inArray(schema.skillGaps.analysisId, analysisIds))
          .orderBy(asc(schema.skillGaps.gapSeverity));

        // Group skill gaps by analysis ID
        const skillGapsByAnalysis = skillGaps.reduce((acc, gap) => {
          if (!acc[gap.analysisId]) {
            acc[gap.analysisId] = [];
          }
          acc[gap.analysisId].push(gap);
          return acc;
        }, {} as Record<string, any[]>);

        // Attach skill gaps to analyses
        analyses.forEach(analysis => {
          analysis.skillGaps = skillGapsByAnalysis[analysis.id] || [];
        });

        optimizations.push('batch_skill_gaps');
      }

      const result = {
        analyses,
        total,
        hasMore: offset + limit < total,
      };

      // Cache the result
      if (finalConfig.enableCaching) {
        await this.cache.set(queryId, result, 'gap_analysis');
      }

      this.recordQueryMetrics(queryId, Date.now() - startTime, analyses.length, false, optimizations);
      return result;
    } catch (error) {
      logger.error('Error in optimized gap analyses query:', error);
      throw error;
    }
  }

  /**
   * Optimized trend analysis queries with aggregations
   */
  async getSkillTrendsOptimized(
    filters: {
      skillNames?: string[];
      industries?: string[];
      regions?: string[];
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    } = {},
    config: Partial<QueryOptimizationConfig> = {}
  ): Promise<any[]> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const limit = filters.limit || 50;
    
    const queryId = `skill_trends_${JSON.stringify(filters)}`;
    const startTime = Date.now();

    try {
      // Try cache first
      if (finalConfig.enableCaching) {
        const cached = await this.cache.get(queryId, 'skill_trends');
        if (cached) {
          this.recordQueryMetrics(queryId, Date.now() - startTime, cached.length, true, ['cache_hit']);
          return cached;
        }
      }

      // Build optimized aggregation query
      const conditions = [];
      const optimizations = ['aggregation_query'];

      if (filters.skillNames && filters.skillNames.length > 0) {
        conditions.push(inArray(schema.skillDemandHistory.skillName, filters.skillNames));
        optimizations.push('skill_filter');
      }

      if (filters.industries && filters.industries.length > 0) {
        conditions.push(inArray(schema.skillDemandHistory.industry, filters.industries));
        optimizations.push('industry_filter');
      }

      if (filters.regions && filters.regions.length > 0) {
        conditions.push(inArray(schema.skillDemandHistory.region, filters.regions));
        optimizations.push('region_filter');
      }

      if (filters.dateFrom) {
        conditions.push(gte(schema.skillDemandHistory.recordedAt, filters.dateFrom));
      }

      if (filters.dateTo) {
        conditions.push(lte(schema.skillDemandHistory.recordedAt, filters.dateTo));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Optimized aggregation query using SQL
      const trends = await this.db
        .select({
          skillName: schema.skillDemandHistory.skillName,
          industry: schema.skillDemandHistory.industry,
          region: schema.skillDemandHistory.region,
          avgDemandScore: sql<number>`AVG(${schema.skillDemandHistory.demandScore})`,
          maxDemandScore: sql<number>`MAX(${schema.skillDemandHistory.demandScore})`,
          minDemandScore: sql<number>`MIN(${schema.skillDemandHistory.demandScore})`,
          avgJobCount: sql<number>`AVG(${schema.skillDemandHistory.jobCount})`,
          avgSalary: sql<number>`AVG(${schema.skillDemandHistory.avgSalary})`,
          dataPoints: sql<number>`COUNT(*)`,
          latestRecord: sql<string>`MAX(${schema.skillDemandHistory.recordedAt})`,
        })
        .from(schema.skillDemandHistory)
        .where(whereClause)
        .groupBy(
          schema.skillDemandHistory.skillName,
          schema.skillDemandHistory.industry,
          schema.skillDemandHistory.region
        )
        .orderBy(desc(sql`AVG(${schema.skillDemandHistory.demandScore})`))
        .limit(limit);

      // Cache the result
      if (finalConfig.enableCaching) {
        await this.cache.set(queryId, trends, 'skill_trends');
      }

      this.recordQueryMetrics(queryId, Date.now() - startTime, trends.length, false, optimizations);
      return trends;
    } catch (error) {
      logger.error('Error in optimized skill trends query:', error);
      throw error;
    }
  }

  /**
   * Optimized search across multiple entities
   */
  async searchOptimized(
    searchTerm: string,
    entityTypes: ('skills' | 'jobs' | 'users')[] = ['skills', 'jobs'],
    config: Partial<QueryOptimizationConfig> = {}
  ): Promise<{
    skills: any[];
    jobs: any[];
    users: any[];
    totalResults: number;
  }> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const queryId = `search_${searchTerm}_${entityTypes.join('_')}`;
    const startTime = Date.now();

    try {
      // Try cache first
      if (finalConfig.enableCaching) {
        const cached = await this.cache.get(queryId, 'search_results');
        if (cached) {
          this.recordQueryMetrics(queryId, Date.now() - startTime, cached.totalResults, true, ['cache_hit']);
          return cached;
        }
      }

      const results = {
        skills: [] as any[],
        jobs: [] as any[],
        users: [] as any[],
        totalResults: 0,
      };

      const searchPattern = `%${searchTerm}%`;
      const optimizations = ['parallel_search'];

      // Execute searches in parallel for better performance
      const searchPromises = [];

      if (entityTypes.includes('skills')) {
        searchPromises.push(
          this.db
            .select({
              id: schema.skills.id,
              name: schema.skills.name,
              category: schema.skills.category,
              description: schema.skills.description,
            })
            .from(schema.skills)
            .where(
              or(
                like(schema.skills.name, searchPattern),
                like(schema.skills.description, searchPattern)
              )
            )
            .limit(20)
            .then(skills => {
              results.skills = skills;
              results.totalResults += skills.length;
            })
        );
      }

      if (entityTypes.includes('jobs')) {
        searchPromises.push(
          this.db
            .select({
              id: schema.jobs.id,
              title: schema.jobs.title,
              company: schema.jobs.company,
              industry: schema.jobs.industry,
              location: schema.jobs.location,
            })
            .from(schema.jobs)
            .where(
              or(
                like(schema.jobs.title, searchPattern),
                like(schema.jobs.company, searchPattern),
                like(schema.jobs.description, searchPattern)
              )
            )
            .limit(20)
            .then(jobs => {
              results.jobs = jobs;
              results.totalResults += jobs.length;
            })
        );
      }

      if (entityTypes.includes('users')) {
        searchPromises.push(
          this.db
            .select({
              id: schema.users.id,
              name: schema.users.name,
              email: schema.users.email,
              organization: schema.users.organization,
            })
            .from(schema.users)
            .where(
              or(
                like(schema.users.name, searchPattern),
                like(schema.users.organization, searchPattern)
              )
            )
            .limit(20)
            .then(users => {
              results.users = users;
              results.totalResults += users.length;
            })
        );
      }

      await Promise.all(searchPromises);

      // Cache the result
      if (finalConfig.enableCaching) {
        await this.cache.set(queryId, results, 'search_results');
      }

      this.recordQueryMetrics(queryId, Date.now() - startTime, results.totalResults, false, optimizations);
      return results;
    } catch (error) {
      logger.error('Error in optimized search:', error);
      throw error;
    }
  }

  /**
   * Batch invalidate cache when data changes
   */
  async invalidateRelatedCache(
    entityType: 'user' | 'skill' | 'job' | 'analysis',
    entityId?: string
  ): Promise<void> {
    const tags = [entityType];
    
    // Add specific invalidation tags based on entity type
    switch (entityType) {
      case 'user':
        tags.push('user_profile', 'user_skills');
        break;
      case 'skill':
        tags.push('skills_taxonomy', 'skill_matching', 'trends');
        break;
      case 'job':
        tags.push('job_requirements', 'gap_analysis');
        break;
      case 'analysis':
        tags.push('gap_analysis', 'aggregations');
        break;
    }

    await this.cache.invalidateByTags(tags);
    logger.info(`Invalidated cache for ${entityType} ${entityId || 'all'}`);
  }

  /**
   * Get query performance metrics
   */
  getQueryMetrics(): Record<string, QueryPerformanceMetrics[]> {
    return Object.fromEntries(this.queryMetrics);
  }

  /**
   * Clear query metrics
   */
  clearQueryMetrics(): void {
    this.queryMetrics.clear();
  }

  // Private helper methods

  private recordQueryMetrics(
    queryId: string,
    executionTime: number,
    rowsReturned: number,
    cacheHit: boolean,
    optimizationApplied: string[]
  ): void {
    if (!this.queryMetrics.has(queryId)) {
      this.queryMetrics.set(queryId, []);
    }

    const metrics = this.queryMetrics.get(queryId)!;
    metrics.push({
      queryId,
      executionTime,
      rowsReturned,
      cacheHit,
      optimizationApplied,
    });

    // Keep only last 100 metrics per query
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }
  }
}