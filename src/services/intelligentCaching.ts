import { Env } from '../index';
import { logger } from '../utils/logger';

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number; // Maximum cache size in bytes
  compressionEnabled?: boolean;
  invalidationTags?: string[];
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  averageResponseTime: number;
  cacheSize: number;
  evictions: number;
}

export interface CacheEntry<T = any> {
  data: T | string;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  tags: string[];
  compressed: boolean;
  size: number;
}

export class IntelligentCachingService {
  private env: Env;
  private readonly CACHE_PREFIX = 'cache:';
  private readonly METRICS_KEY = 'cache:metrics';
  private readonly INDEX_KEY = 'cache:index';
  
  // Cache configuration presets
  private readonly CACHE_CONFIGS: Record<string, CacheConfig> = {
    // User data - medium TTL, user-specific invalidation
    user_profile: { ttl: 3600, invalidationTags: ['user'] }, // 1 hour
    user_skills: { ttl: 1800, invalidationTags: ['user', 'skills'] }, // 30 minutes
    
    // Analysis results - longer TTL, invalidate on skill/job changes
    gap_analysis: { ttl: 7200, invalidationTags: ['analysis', 'skills', 'jobs'] }, // 2 hours
    skill_matching: { ttl: 3600, invalidationTags: ['skills', 'matching'] }, // 1 hour
    
    // Reference data - very long TTL, rarely changes
    skills_taxonomy: { ttl: 86400, invalidationTags: ['skills'] }, // 24 hours
    job_requirements: { ttl: 14400, invalidationTags: ['jobs'] }, // 4 hours
    
    // Trends and analytics - medium TTL, scheduled updates
    skill_trends: { ttl: 10800, invalidationTags: ['trends'] }, // 3 hours
    market_forecasts: { ttl: 21600, invalidationTags: ['forecasts'] }, // 6 hours
    industry_trends: { ttl: 14400, invalidationTags: ['trends', 'industry'] }, // 4 hours
    
    // API responses - short TTL for dynamic content
    api_response: { ttl: 300, invalidationTags: ['api'] }, // 5 minutes
    search_results: { ttl: 600, invalidationTags: ['search'] }, // 10 minutes
    
    // Heavy computations - long TTL, computation-specific invalidation
    ml_predictions: { ttl: 43200, invalidationTags: ['ml', 'predictions'] }, // 12 hours
    aggregations: { ttl: 1800, invalidationTags: ['aggregations'] }, // 30 minutes
  };

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Get data from cache with intelligent fallback
   */
  async get<T>(
    key: string,
    cacheType: keyof typeof this.CACHE_CONFIGS = 'api_response'
  ): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      const cacheKey = this.buildCacheKey(key, cacheType);
      const rawEntry = await this.env.CACHE.get(cacheKey, 'json') as CacheEntry<T> | null;
      
      if (!rawEntry) {
        await this.recordCacheMiss(cacheType, Date.now() - startTime);
        return null;
      }

      // Check if entry has expired
      if (this.isExpired(rawEntry)) {
        await this.delete(key, cacheType);
        await this.recordCacheMiss(cacheType, Date.now() - startTime);
        return null;
      }

      // Update access statistics
      await this.updateAccessStats(cacheKey, rawEntry);
      await this.recordCacheHit(cacheType, Date.now() - startTime);

      // Decompress if needed
      const data = rawEntry.compressed ? 
        await this.decompress(rawEntry.data as string) : 
        rawEntry.data;

      return data as T;
    } catch (error) {
      logger.error('Cache get error:', error);
      await this.recordCacheMiss(cacheType, Date.now() - startTime);
      return null;
    }
  }

  /**
   * Set data in cache with intelligent configuration
   */
  async set<T>(
    key: string,
    data: T,
    cacheType: keyof typeof this.CACHE_CONFIGS = 'api_response',
    customConfig?: Partial<CacheConfig>
  ): Promise<void> {
    try {
      const config = { ...this.CACHE_CONFIGS[cacheType], ...customConfig };
      const cacheKey = this.buildCacheKey(key, cacheType);
      
      // Determine if compression is beneficial
      const serializedData = JSON.stringify(data);
      const shouldCompress = config.compressionEnabled !== false && 
                           serializedData.length > 1024; // Compress if > 1KB

      const processedData = shouldCompress ? 
        await this.compress(data) : 
        data;

      const entry: CacheEntry<T | string> = {
        data: processedData as T | string,
        timestamp: Date.now(),
        ttl: config.ttl,
        accessCount: 0,
        lastAccessed: Date.now(),
        tags: config.invalidationTags || [],
        compressed: shouldCompress,
        size: serializedData.length,
      };

      // Store in cache
      await this.env.CACHE.put(
        cacheKey,
        JSON.stringify(entry),
        { expirationTtl: config.ttl }
      );

      // Update cache index for invalidation
      await this.updateCacheIndex(cacheKey, entry.tags);

      logger.debug(`Cached data: ${cacheKey} (${entry.size} bytes, TTL: ${config.ttl}s)`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Delete specific cache entry
   */
  async delete(
    key: string,
    cacheType: keyof typeof this.CACHE_CONFIGS = 'api_response'
  ): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(key, cacheType);
      await this.env.CACHE.delete(cacheKey);
      await this.removeFromCacheIndex(cacheKey);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let invalidatedCount = 0;
    
    try {
      const index = await this.getCacheIndex();
      const keysToInvalidate = new Set<string>();

      // Find all keys that match any of the tags
      for (const [cacheKey, entryTags] of Object.entries(index)) {
        if (tags.some(tag => entryTags.includes(tag))) {
          keysToInvalidate.add(cacheKey);
        }
      }

      // Delete all matching keys
      const deletePromises = Array.from(keysToInvalidate).map(async (key) => {
        await this.env.CACHE.delete(key);
        invalidatedCount++;
      });

      await Promise.all(deletePromises);

      // Update index
      await this.updateCacheIndexAfterInvalidation(Array.from(keysToInvalidate));

      logger.info(`Invalidated ${invalidatedCount} cache entries for tags: ${tags.join(', ')}`);
    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }

    return invalidatedCount;
  }

  /**
   * Get or set pattern with automatic caching
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    cacheType: keyof typeof this.CACHE_CONFIGS = 'api_response',
    customConfig?: Partial<CacheConfig>
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, cacheType);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetchFunction();
    
    // Cache the result
    await this.set(key, data, cacheType, customConfig);
    
    return data;
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmupCache(warmupConfig: {
    userIds?: string[];
    skillCategories?: string[];
    industries?: string[];
  }): Promise<void> {
    logger.info('Starting cache warmup...');
    
    try {
      const promises: Promise<void>[] = [];

      // Warm up user profiles if specified
      if (warmupConfig.userIds) {
        for (const userId of warmupConfig.userIds) {
          promises.push(this.warmupUserData(userId));
        }
      }

      // Warm up skills taxonomy
      if (warmupConfig.skillCategories) {
        for (const category of warmupConfig.skillCategories) {
          promises.push(this.warmupSkillsData(category));
        }
      }

      // Warm up industry trends
      if (warmupConfig.industries) {
        for (const industry of warmupConfig.industries) {
          promises.push(this.warmupIndustryData(industry));
        }
      }

      await Promise.all(promises);
      logger.info('Cache warmup completed');
    } catch (error) {
      logger.error('Cache warmup error:', error);
    }
  }

  /**
   * Get cache metrics and statistics
   */
  async getMetrics(): Promise<CacheMetrics> {
    try {
      const rawMetrics = await this.env.CACHE.get(this.METRICS_KEY, 'json') as any;
      
      if (!rawMetrics) {
        return this.getEmptyMetrics();
      }

      const totalRequests = rawMetrics.hits + rawMetrics.misses;
      
      return {
        hitRate: totalRequests > 0 ? rawMetrics.hits / totalRequests : 0,
        missRate: totalRequests > 0 ? rawMetrics.misses / totalRequests : 0,
        totalRequests,
        totalHits: rawMetrics.hits || 0,
        totalMisses: rawMetrics.misses || 0,
        averageResponseTime: rawMetrics.totalResponseTime / Math.max(totalRequests, 1),
        cacheSize: rawMetrics.cacheSize || 0,
        evictions: rawMetrics.evictions || 0,
      };
    } catch (error) {
      logger.error('Error getting cache metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  /**
   * Clear all cache data
   */
  async clearAll(): Promise<void> {
    try {
      const { keys } = await this.env.CACHE.list({ prefix: this.CACHE_PREFIX });
      
      const deletePromises = keys.map(key => this.env.CACHE.delete(key.name));
      await Promise.all(deletePromises);
      
      // Reset metrics and index
      await this.env.CACHE.delete(this.METRICS_KEY);
      await this.env.CACHE.delete(this.INDEX_KEY);
      
      logger.info(`Cleared ${keys.length} cache entries`);
    } catch (error) {
      logger.error('Error clearing cache:', error);
    }
  }

  /**
   * Optimize cache by removing least recently used entries
   */
  async optimizeCache(maxSizeBytes?: number): Promise<void> {
    try {
      const { keys } = await this.env.CACHE.list({ prefix: this.CACHE_PREFIX });
      const entries: Array<{ key: string; entry: CacheEntry; score: number }> = [];
      
      // Get all entries with their access patterns
      for (const key of keys) {
        const rawEntry = await this.env.CACHE.get(key.name, 'json') as CacheEntry;
        if (rawEntry) {
          // Calculate LRU score (lower = more likely to be evicted)
          const score = this.calculateLRUScore(rawEntry);
          entries.push({ key: key.name, entry: rawEntry, score });
        }
      }

      // Sort by score (lowest first = least recently used)
      entries.sort((a, b) => a.score - b.score);

      let currentSize = entries.reduce((sum, e) => sum + e.entry.size, 0);
      const targetSize = maxSizeBytes || (currentSize * 0.8); // Remove 20% if no target specified
      
      let evicted = 0;
      for (const { key, entry } of entries) {
        if (currentSize <= targetSize) break;
        
        await this.env.CACHE.delete(key);
        currentSize -= entry.size;
        evicted++;
      }

      await this.recordEvictions(evicted);
      logger.info(`Cache optimization completed: evicted ${evicted} entries`);
    } catch (error) {
      logger.error('Cache optimization error:', error);
    }
  }

  // Private helper methods

  private buildCacheKey(key: string, cacheType: string): string {
    return `${this.CACHE_PREFIX}${cacheType}:${key}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > (entry.ttl * 1000);
  }

  private async compress<T>(data: T): Promise<string> {
    // Simple compression using JSON stringification
    // In production, consider using actual compression libraries
    return JSON.stringify(data);
  }

  private async decompress<T>(compressedData: string): Promise<T> {
    return JSON.parse(compressedData);
  }

  private async updateAccessStats(cacheKey: string, entry: CacheEntry): Promise<void> {
    try {
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      
      await this.env.CACHE.put(
        cacheKey,
        JSON.stringify(entry),
        { expirationTtl: entry.ttl }
      );
    } catch (error) {
      // Don't fail the main operation if stats update fails
      logger.warn('Failed to update access stats:', error);
    }
  }

  private async getCacheIndex(): Promise<Record<string, string[]>> {
    try {
      const index = await this.env.CACHE.get(this.INDEX_KEY, 'json') as Record<string, string[]>;
      return index || {};
    } catch (error) {
      logger.warn('Failed to get cache index:', error);
      return {};
    }
  }

  private async updateCacheIndex(cacheKey: string, tags: string[]): Promise<void> {
    try {
      const index = await this.getCacheIndex();
      index[cacheKey] = tags;
      
      await this.env.CACHE.put(
        this.INDEX_KEY,
        JSON.stringify(index),
        { expirationTtl: 86400 * 7 } // Index expires in 7 days
      );
    } catch (error) {
      logger.warn('Failed to update cache index:', error);
    }
  }

  private async removeFromCacheIndex(cacheKey: string): Promise<void> {
    try {
      const index = await this.getCacheIndex();
      delete index[cacheKey];
      
      await this.env.CACHE.put(
        this.INDEX_KEY,
        JSON.stringify(index),
        { expirationTtl: 86400 * 7 }
      );
    } catch (error) {
      logger.warn('Failed to remove from cache index:', error);
    }
  }

  private async updateCacheIndexAfterInvalidation(invalidatedKeys: string[]): Promise<void> {
    try {
      const index = await this.getCacheIndex();
      
      for (const key of invalidatedKeys) {
        delete index[key];
      }
      
      await this.env.CACHE.put(
        this.INDEX_KEY,
        JSON.stringify(index),
        { expirationTtl: 86400 * 7 }
      );
    } catch (error) {
      logger.warn('Failed to update cache index after invalidation:', error);
    }
  }

  private calculateLRUScore(entry: CacheEntry): number {
    const now = Date.now();
    const timeSinceLastAccess = now - entry.lastAccessed;
    const accessFrequency = entry.accessCount / Math.max(1, (now - entry.timestamp) / 3600000); // accesses per hour
    
    // Lower score = more likely to be evicted
    // Factor in recency and frequency
    return timeSinceLastAccess / (accessFrequency + 1);
  }

  private async recordCacheHit(cacheType: string, responseTime: number): Promise<void> {
    await this.updateMetrics('hit', responseTime);
  }

  private async recordCacheMiss(cacheType: string, responseTime: number): Promise<void> {
    await this.updateMetrics('miss', responseTime);
  }

  private async recordEvictions(count: number): Promise<void> {
    try {
      const metrics = await this.env.CACHE.get(this.METRICS_KEY, 'json') as any || {};
      metrics.evictions = (metrics.evictions || 0) + count;
      
      await this.env.CACHE.put(
        this.METRICS_KEY,
        JSON.stringify(metrics),
        { expirationTtl: 86400 * 30 } // Keep metrics for 30 days
      );
    } catch (error) {
      logger.warn('Failed to record evictions:', error);
    }
  }

  private async updateMetrics(type: 'hit' | 'miss', responseTime: number): Promise<void> {
    try {
      const metrics = await this.env.CACHE.get(this.METRICS_KEY, 'json') as any || {
        hits: 0,
        misses: 0,
        totalResponseTime: 0,
        cacheSize: 0,
        evictions: 0,
      };

      if (type === 'hit') {
        metrics.hits++;
      } else {
        metrics.misses++;
      }
      
      metrics.totalResponseTime += responseTime;

      await this.env.CACHE.put(
        this.METRICS_KEY,
        JSON.stringify(metrics),
        { expirationTtl: 86400 * 30 }
      );
    } catch (error) {
      logger.warn('Failed to update cache metrics:', error);
    }
  }

  private getEmptyMetrics(): CacheMetrics {
    return {
      hitRate: 0,
      missRate: 0,
      totalRequests: 0,
      totalHits: 0,
      totalMisses: 0,
      averageResponseTime: 0,
      cacheSize: 0,
      evictions: 0,
    };
  }

  private async warmupUserData(userId: string): Promise<void> {
    // This would typically call actual service methods to populate cache
    // For now, just a placeholder
    logger.debug(`Warming up cache for user: ${userId}`);
  }

  private async warmupSkillsData(category: string): Promise<void> {
    logger.debug(`Warming up cache for skills category: ${category}`);
  }

  private async warmupIndustryData(industry: string): Promise<void> {
    logger.debug(`Warming up cache for industry: ${industry}`);
  }
}