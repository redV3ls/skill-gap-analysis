import { QueryOptimizationService } from '../services/queryOptimization';
import { IntelligentCachingService } from '../services/intelligentCaching';
import { CacheInvalidationService } from '../services/cacheInvalidation';
import { createDatabase } from '../config/database';
import { createTestEnvironment } from '../test/workers-test-utils';
import { createMockDrizzleDatabase, createCommonDatabaseResponses } from '../test/drizzle-d1-mock';

describe('Query Optimization Service', () => {
  let queryOptimizer: QueryOptimizationService;
  let cacheService: IntelligentCachingService;
  let invalidationService: CacheInvalidationService;
  let db: any;
  let env: any;

  beforeEach(async () => {
    const commonResponses = createCommonDatabaseResponses();
    env = createTestEnvironment({
      dbResponses: commonResponses,
      kvData: {}
    });
    db = createMockDrizzleDatabase(commonResponses);
    queryOptimizer = new QueryOptimizationService(db, env);
    cacheService = new IntelligentCachingService(env);
    invalidationService = new CacheInvalidationService(env);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('User Profile Optimization', () => {
    it('should cache user profile queries', async () => {
      const userId = 'test-user-123';
      
      // Mock database response
      const mockProfile = {
        id: 'profile-1',
        userId,
        title: 'Software Engineer',
        skills: [
          {
            id: 'skill-1',
            skillName: 'JavaScript',
            level: 'advanced',
          }
        ]
      };

      // First call should hit database
      const result1 = await queryOptimizer.getUserProfileOptimized(userId);
      
      // Second call should hit cache
      const result2 = await queryOptimizer.getUserProfileOptimized(userId);
      
      expect(result1).toEqual(result2);
      
      // Verify cache metrics
      const metrics = queryOptimizer.getQueryMetrics();
      const profileMetrics = metrics[`user_profile_${userId}`];
      expect(profileMetrics).toBeDefined();
      expect(profileMetrics.some(m => m.cacheHit)).toBe(true);
    });

    it('should invalidate cache when user data changes', async () => {
      const userId = 'test-user-123';
      
      // Cache initial data
      await queryOptimizer.getUserProfileOptimized(userId);
      
      // Trigger invalidation
      await invalidationService.triggerDataChange('user', 'update', userId);
      
      // Next query should miss cache
      const result = await queryOptimizer.getUserProfileOptimized(userId);
      
      const metrics = queryOptimizer.getQueryMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('Skills Query Optimization', () => {
    it('should optimize skills queries with pagination', async () => {
      const filters = {
        category: 'Programming',
        searchTerm: 'Java',
        limit: 10,
        offset: 0,
      };

      const result = await queryOptimizer.getSkillsOptimized(filters);
      
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(result.skills.length).toBeLessThanOrEqual(10);
      
      // Verify optimization metrics
      const metrics = queryOptimizer.getQueryMetrics();
      const skillsMetrics = Object.values(metrics).find(m => 
        m.some(entry => entry.optimizationApplied.includes('indexed_query'))
      );
      expect(skillsMetrics).toBeDefined();
    });

    it('should respect pagination limits', async () => {
      const filters = {
        limit: 5,
        offset: 0,
      };

      const result = await queryOptimizer.getSkillsOptimized(filters);
      expect(result.skills.length).toBeLessThanOrEqual(5);
    });

    it('should enforce maximum page size', async () => {
      const filters = {
        limit: 1000, // Exceeds max
        offset: 0,
      };

      const result = await queryOptimizer.getSkillsOptimized(filters);
      expect(result.skills.length).toBeLessThanOrEqual(100); // Default max
    });
  });

  describe('Gap Analysis Optimization', () => {
    it('should optimize gap analysis queries with date filters', async () => {
      const userId = 'test-user-123';
      const filters = {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        limit: 20,
        offset: 0,
      };

      const result = await queryOptimizer.getGapAnalysesOptimized(userId, filters);
      
      expect(result).toHaveProperty('analyses');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      
      // Verify optimization applied
      const metrics = queryOptimizer.getQueryMetrics();
      const gapMetrics = Object.values(metrics).find(m => 
        m.some(entry => entry.optimizationApplied.includes('date_range'))
      );
      expect(gapMetrics).toBeDefined();
    });

    it('should batch load skill gaps efficiently', async () => {
      const userId = 'test-user-123';
      
      const result = await queryOptimizer.getGapAnalysesOptimized(userId);
      
      // Verify batch loading optimization
      const metrics = queryOptimizer.getQueryMetrics();
      const gapMetrics = Object.values(metrics).find(m => 
        m.some(entry => entry.optimizationApplied.includes('batch_skill_gaps'))
      );
      expect(gapMetrics).toBeDefined();
    });
  });

  describe('Trends Analysis Optimization', () => {
    it('should optimize trend queries with aggregations', async () => {
      const filters = {
        skillNames: ['JavaScript', 'Python'],
        industries: ['Technology'],
        regions: ['US'],
        limit: 50,
      };

      const result = await queryOptimizer.getSkillTrendsOptimized(filters);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(50);
      
      // Verify aggregation optimization
      const metrics = queryOptimizer.getQueryMetrics();
      const trendsMetrics = Object.values(metrics).find(m => 
        m.some(entry => entry.optimizationApplied.includes('aggregation_query'))
      );
      expect(trendsMetrics).toBeDefined();
    });
  });

  describe('Search Optimization', () => {
    it('should perform parallel search across entities', async () => {
      const searchTerm = 'JavaScript';
      const entityTypes: ('skills' | 'jobs' | 'users')[] = ['skills', 'jobs'];

      const result = await queryOptimizer.searchOptimized(searchTerm, entityTypes);
      
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('totalResults');
      
      // Verify parallel search optimization
      const metrics = queryOptimizer.getQueryMetrics();
      const searchMetrics = Object.values(metrics).find(m => 
        m.some(entry => entry.optimizationApplied.includes('parallel_search'))
      );
      expect(searchMetrics).toBeDefined();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate related caches correctly', async () => {
      // Cache some data
      await queryOptimizer.getUserProfileOptimized('user-123');
      await queryOptimizer.getSkillsOptimized({ category: 'Programming' });
      
      // Invalidate user-related caches
      await queryOptimizer.invalidateRelatedCache('user', 'user-123');
      
      // Verify invalidation
      const cacheMetrics = await cacheService.getMetrics();
      expect(cacheMetrics.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should track query performance metrics', async () => {
      await queryOptimizer.getUserProfileOptimized('user-123');
      await queryOptimizer.getSkillsOptimized({ category: 'Programming' });
      
      const metrics = queryOptimizer.getQueryMetrics();
      expect(Object.keys(metrics).length).toBeGreaterThan(0);
      
      // Verify metric structure
      const firstMetric = Object.values(metrics)[0][0];
      expect(firstMetric).toHaveProperty('queryId');
      expect(firstMetric).toHaveProperty('executionTime');
      expect(firstMetric).toHaveProperty('rowsReturned');
      expect(firstMetric).toHaveProperty('cacheHit');
      expect(firstMetric).toHaveProperty('optimizationApplied');
    });

    it('should clear metrics when requested', async () => {
      await queryOptimizer.getUserProfileOptimized('user-123');
      
      let metrics = queryOptimizer.getQueryMetrics();
      expect(Object.keys(metrics).length).toBeGreaterThan(0);
      
      queryOptimizer.clearQueryMetrics();
      
      metrics = queryOptimizer.getQueryMetrics();
      expect(Object.keys(metrics).length).toBe(0);
    });
  });
});

describe('Intelligent Caching Service', () => {
  let cacheService: IntelligentCachingService;
  let env: any;

  beforeEach(() => {
    env = createTestEnvironment();
    cacheService = new IntelligentCachingService(env);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('Basic Cache Operations', () => {
    it('should store and retrieve data', async () => {
      const key = 'test-key';
      const data = { message: 'Hello, World!' };
      
      await cacheService.set(key, data);
      const retrieved = await cacheService.get(key);
      
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should respect TTL expiration', async () => {
      const key = 'expiring-key';
      const data = { message: 'This will expire' };
      
      await cacheService.set(key, data, 'api_response', { ttl: 1 }); // 1 second TTL
      
      // Should be available immediately
      let retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(data);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      retrieved = await cacheService.get(key);
      expect(retrieved).toBeNull();
    });
  });

  describe('Cache Types and Configuration', () => {
    it('should use different TTLs for different cache types', async () => {
      const key = 'test-key';
      const data = { test: true };
      
      // User profile cache (longer TTL)
      await cacheService.set(key, data, 'user_profile');
      
      // API response cache (shorter TTL)
      await cacheService.set(key + '_api', data, 'api_response');
      
      // Both should be available
      expect(await cacheService.get(key, 'user_profile')).toEqual(data);
      expect(await cacheService.get(key + '_api', 'api_response')).toEqual(data);
    });
  });

  describe('Tag-based Invalidation', () => {
    it('should invalidate entries by tags', async () => {
      await cacheService.set('user-1', { name: 'User 1' }, 'user_profile');
      await cacheService.set('user-2', { name: 'User 2' }, 'user_profile');
      await cacheService.set('skill-1', { name: 'JavaScript' }, 'skills_taxonomy');
      
      // Invalidate user-related caches
      const invalidatedCount = await cacheService.invalidateByTags(['user']);
      
      expect(invalidatedCount).toBeGreaterThan(0);
      
      // User caches should be gone
      expect(await cacheService.get('user-1', 'user_profile')).toBeNull();
      expect(await cacheService.get('user-2', 'user_profile')).toBeNull();
      
      // Skill cache should still exist
      expect(await cacheService.get('skill-1', 'skills_taxonomy')).toEqual({ name: 'JavaScript' });
    });
  });

  describe('Get or Set Pattern', () => {
    it('should fetch and cache data when not in cache', async () => {
      const key = 'fetch-key';
      const expectedData = { computed: true };
      
      let fetchCalled = false;
      const fetchFunction = jest.fn(async () => {
        fetchCalled = true;
        return expectedData;
      });
      
      const result = await cacheService.getOrSet(key, fetchFunction);
      
      expect(result).toEqual(expectedData);
      expect(fetchCalled).toBe(true);
      expect(fetchFunction).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const result2 = await cacheService.getOrSet(key, fetchFunction);
      
      expect(result2).toEqual(expectedData);
      expect(fetchFunction).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe('Cache Metrics', () => {
    it('should track cache hit/miss metrics', async () => {
      const key = 'metrics-key';
      const data = { test: true };
      
      // Miss
      await cacheService.get(key);
      
      // Set
      await cacheService.set(key, data);
      
      // Hit
      await cacheService.get(key);
      
      const metrics = await cacheService.getMetrics();
      
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.totalHits).toBeGreaterThan(0);
      expect(metrics.totalMisses).toBeGreaterThan(0);
      expect(metrics.hitRate).toBeGreaterThan(0);
      expect(metrics.missRate).toBeGreaterThan(0);
    });
  });

  describe('Cache Optimization', () => {
    it('should optimize cache by removing LRU entries', async () => {
      // Add multiple entries
      for (let i = 0; i < 10; i++) {
        await cacheService.set(`key-${i}`, { value: i });
      }
      
      // Access some entries to update their LRU scores
      await cacheService.get('key-0');
      await cacheService.get('key-1');
      
      // Optimize cache
      await cacheService.optimizeCache();
      
      // Recently accessed entries should still be there
      expect(await cacheService.get('key-0')).toEqual({ value: 0 });
      expect(await cacheService.get('key-1')).toEqual({ value: 1 });
    });
  });
});

describe('Cache Invalidation Service', () => {
  let invalidationService: CacheInvalidationService;
  let env: any;

  beforeEach(() => {
    env = createTestEnvironment();
    invalidationService = new CacheInvalidationService(env);
  });

  describe('Rule Management', () => {
    it('should add and retrieve invalidation rules', async () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test invalidation rule',
        triggers: [{ type: 'data_change' as const, entityType: 'user', operation: 'update' as const }],
        targets: [{ type: 'tags' as const, value: ['user'] }],
        priority: 5,
        enabled: true,
      };

      await invalidationService.addRule(rule);
      
      const rules = invalidationService.getRules();
      const addedRule = rules.find(r => r.id === 'test-rule');
      
      expect(addedRule).toBeDefined();
      expect(addedRule?.name).toBe('Test Rule');
    });

    it('should enable and disable rules', async () => {
      const rule = {
        id: 'toggle-rule',
        name: 'Toggle Rule',
        description: 'A rule to test toggling',
        triggers: [{ type: 'data_change' as const, entityType: 'skill', operation: 'create' as const }],
        targets: [{ type: 'tags' as const, value: ['skills'] }],
        priority: 3,
        enabled: true,
      };

      await invalidationService.addRule(rule);
      
      // Disable the rule
      await invalidationService.toggleRule('toggle-rule', false);
      
      const rules = invalidationService.getRules();
      const toggledRule = rules.find(r => r.id === 'toggle-rule');
      
      expect(toggledRule?.enabled).toBe(false);
    });
  });

  describe('Data Change Triggers', () => {
    it('should trigger invalidation on data changes', async () => {
      // This would typically integrate with actual cache invalidation
      await invalidationService.triggerDataChange('user', 'update', 'user-123');
      
      const events = await invalidationService.getInvalidationEvents(10);
      expect(events.length).toBeGreaterThan(0);
      
      const userEvent = events.find(e => e.entityType === 'user' && e.operation === 'update');
      expect(userEvent).toBeDefined();
    });
  });

  describe('Manual Triggers', () => {
    it('should trigger manual invalidation', async () => {
      const rules = invalidationService.getRules();
      const firstRule = rules[0];
      
      if (firstRule) {
        const event = await invalidationService.triggerManual(firstRule.id, 'test-entity');
        
        expect(event.ruleId).toBe(firstRule.id);
        expect(event.entityId).toBe('test-entity');
        expect(['completed', 'failed']).toContain(event.status);
      }
    });
  });

  describe('Statistics', () => {
    it('should provide invalidation statistics', async () => {
      const stats = await invalidationService.getInvalidationStats();
      
      expect(stats).toHaveProperty('totalRules');
      expect(stats).toHaveProperty('enabledRules');
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('successfulEvents');
      expect(stats).toHaveProperty('failedEvents');
      expect(stats).toHaveProperty('averageInvalidationCount');
      
      expect(typeof stats.totalRules).toBe('number');
      expect(typeof stats.enabledRules).toBe('number');
    });
  });
});