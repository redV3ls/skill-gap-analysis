import { KVNamespace } from '@cloudflare/workers-types';
import { logger } from '../utils/logger';

export interface CacheConfig {
  ttl?: number; // Time to live in seconds
  staleWhileRevalidate?: number; // Additional time to serve stale content while revalidating
}

export class CacheService {
  private kv: KVNamespace;
  private defaultTTL = 3600; // 1 hour default
  
  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Generate cache key with namespace prefix
   */
  private generateKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(namespace: string, key: string): Promise<T | null> {
    try {
      const cacheKey = this.generateKey(namespace, key);
      const cached = await this.kv.get(cacheKey, 'json');
      
      if (cached) {
        logger.info(`Cache hit: ${cacheKey}`);
        return cached as T;
      }
      
      logger.info(`Cache miss: ${cacheKey}`);
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(namespace: string, key: string, value: T, config?: CacheConfig): Promise<void> {
    try {
      const cacheKey = this.generateKey(namespace, key);
      const ttl = config?.ttl || this.defaultTTL;
      
      await this.kv.put(cacheKey, JSON.stringify(value), {
        expirationTtl: ttl
      });
      
      logger.info(`Cache set: ${cacheKey} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(namespace: string, key: string): Promise<void> {
    try {
      const cacheKey = this.generateKey(namespace, key);
      await this.kv.delete(cacheKey);
      logger.info(`Cache delete: ${cacheKey}`);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Clear all cache entries with a given namespace prefix
   */
  async clearNamespace(namespace: string): Promise<void> {
    try {
      const prefix = `${namespace}:`;
      const keys = await this.kv.list({ prefix });
      
      const deletePromises = keys.keys.map(key => this.kv.delete(key.name));
      await Promise.all(deletePromises);
      
      logger.info(`Cache namespace cleared: ${namespace} (${keys.keys.length} keys)`);
    } catch (error) {
      logger.error('Cache clear namespace error:', error);
    }
  }

  /**
   * Cache wrapper for async functions
   */
  async wrap<T>(
    namespace: string,
    key: string,
    fn: () => Promise<T>,
    config?: CacheConfig
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(namespace, key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(namespace, key, result, config);
    return result;
  }

  /**
   * Get multiple values from cache
   */
  async getMany<T>(namespace: string, keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    const promises = keys.map(async (key) => {
      const value = await this.get<T>(namespace, key);
      results.set(key, value);
    });
    
    await Promise.all(promises);
    return results;
  }

  /**
   * Set multiple values in cache
   */
  async setMany<T>(
    namespace: string,
    entries: Array<{ key: string; value: T }>,
    config?: CacheConfig
  ): Promise<void> {
    const promises = entries.map(({ key, value }) =>
      this.set(namespace, key, value, config)
    );
    
    await Promise.all(promises);
  }

  /**
   * Check if key exists in cache
   */
  async has(namespace: string, key: string): Promise<boolean> {
    try {
      const cacheKey = this.generateKey(namespace, key);
      const value = await this.kv.get(cacheKey);
      return value !== null;
    } catch (error) {
      logger.error('Cache has error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getStats(namespace?: string): Promise<{
    totalKeys: number;
    namespaces: { [key: string]: number };
  }> {
    try {
      const allKeys = await this.kv.list();
      const namespaceStats: { [key: string]: number } = {};
      
      for (const key of allKeys.keys) {
        const ns = key.name.split(':')[0];
        namespaceStats[ns] = (namespaceStats[ns] || 0) + 1;
      }
      
      return {
        totalKeys: allKeys.keys.length,
        namespaces: namespaceStats
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return {
        totalKeys: 0,
        namespaces: {}
      };
    }
  }
}

// Cache namespaces for different data types
export const CacheNamespaces = {
  USER_PROFILE: 'user_profile',
  GAP_ANALYSIS: 'gap_analysis',
  TEAM_ANALYSIS: 'team_analysis',
  JOB_DATA: 'job_data',
  SKILL_DATA: 'skill_data',
  TREND_DATA: 'trend_data',
  LEARNING_RESOURCES: 'learning_resources',
  API_RESPONSES: 'api_responses'
} as const;

// Cache TTL configurations (in seconds)
export const CacheTTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 3600, // 1 hour
  LONG: 86400, // 24 hours
  VERY_LONG: 604800 // 7 days
} as const;
