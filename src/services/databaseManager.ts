import { D1Database } from '@cloudflare/workers-types';
import { QueryOptimizer } from '../utils/queryOptimizer';
import { CacheService } from './cache';

interface BatchQuery {
  sql: string;
  params?: any[];
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface QueryMetrics {
  totalQueries: number;
  cachedQueries: number;
  batchedQueries: number;
  averageQueryTime: number;
  slowQueries: Array<{
    sql: string;
    duration: number;
    timestamp: Date;
  }>;
}

export class DatabaseManager {
  private db: D1Database;
  private cache: CacheService;
  private optimizer: QueryOptimizer;
  private batchQueue: BatchQuery[] = [];
  private batchTimeout: number | null = null;
  private metrics: QueryMetrics = {
    totalQueries: 0,
    cachedQueries: 0,
    batchedQueries: 0,
    averageQueryTime: 0,
    slowQueries: [],
  };

  // Configuration
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_DELAY_MS = 10;
  private readonly SLOW_QUERY_THRESHOLD_MS = 100;
  private readonly QUERY_CACHE_TTL = 300; // 5 minutes

  constructor(db: D1Database, cache: CacheService) {
    this.db = db;
    this.cache = cache;
    this.optimizer = new QueryOptimizer(db);
  }

  // Execute a single query with caching and optimization
  async query<T = any>(
    sql: string,
    params?: any[],
    options?: { 
      cache?: boolean; 
      ttl?: number;
      optimize?: boolean;
    }
  ): Promise<T> {
    const startTime = Date.now();
    const shouldCache = options?.cache ?? this.isSelectQuery(sql);
    const ttl = options?.ttl ?? this.QUERY_CACHE_TTL;
    const shouldOptimize = options?.optimize ?? true;

    try {
      // Check cache first
      if (shouldCache) {
        const cacheKey = this.generateCacheKey(sql, params);
        const cached = await this.cache.get<T>(cacheKey);
        if (cached) {
          this.metrics.cachedQueries++;
          return cached;
        }
      }

      // Optimize query if needed
      let optimizedSql = sql;
      if (shouldOptimize) {
        optimizedSql = this.optimizer.optimizeQuery(sql);
      }

      // Execute query
      const result = await this.db.prepare(optimizedSql).bind(...(params || [])).all();
      
      // Cache the result
      if (shouldCache && result.success) {
        const cacheKey = this.generateCacheKey(sql, params);
        await this.cache.set(cacheKey, result.results, ttl);
      }

      // Update metrics
      const duration = Date.now() - startTime;
      this.updateMetrics(sql, duration);

      return result.results as T;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // Batch multiple queries for better performance
  async batchQuery<T = any>(sql: string, params?: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ sql, params, resolve, reject });

      // Clear existing timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      // Process batch if it's full
      if (this.batchQueue.length >= this.BATCH_SIZE) {
        this.processBatch();
      } else {
        // Otherwise, set a timeout to process the batch
        this.batchTimeout = setTimeout(() => {
          this.processBatch();
        }, this.BATCH_DELAY_MS) as unknown as number;
      }
    });
  }

  // Execute a transaction
  async transaction<T = any>(
    queries: Array<{ sql: string; params?: any[] }>
  ): Promise<T[]> {
    const startTime = Date.now();

    try {
      // D1 doesn't support true transactions in Workers, but we can batch queries
      const batch = queries.map(q => 
        this.db.prepare(q.sql).bind(...(q.params || []))
      );

      const results = await this.db.batch(batch);
      
      // Update metrics
      const duration = Date.now() - startTime;
      this.metrics.batchedQueries += queries.length;
      queries.forEach(q => this.updateMetrics(q.sql, duration / queries.length));

      return results.map(r => r.results) as T[];
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  }

  // Prepared statement management
  prepare(sql: string) {
    const optimizedSql = this.optimizer.optimizeQuery(sql);
    return this.db.prepare(optimizedSql);
  }

  // Get query metrics
  getMetrics(): QueryMetrics {
    return { ...this.metrics };
  }

  // Clear query cache
  async clearCache(pattern?: string): Promise<void> {
    // If pattern is provided, clear matching keys
    if (pattern) {
      // This would require implementing pattern matching in cache service
      console.log(`Clearing cache for pattern: ${pattern}`);
    } else {
      // Clear all query cache
      console.log('Clearing all query cache');
    }
  }

  // Private methods
  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimeout = null;

    try {
      // Execute all queries in a single batch
      const statements = batch.map(q => 
        this.db.prepare(q.sql).bind(...(q.params || []))
      );

      const results = await this.db.batch(statements);

      // Resolve promises with results
      batch.forEach((query, index) => {
        if (results[index].success) {
          query.resolve(results[index].results);
        } else {
          query.reject(new Error(results[index].error || 'Query failed'));
        }
      });

      this.metrics.batchedQueries += batch.length;
    } catch (error) {
      // Reject all promises on batch error
      batch.forEach(query => query.reject(error));
    }
  }

  private generateCacheKey(sql: string, params?: any[]): string {
    const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    const paramsStr = params ? JSON.stringify(params) : '';
    return `query:${normalizedSql}:${paramsStr}`;
  }

  private isSelectQuery(sql: string): boolean {
    const trimmed = sql.trim().toLowerCase();
    return trimmed.startsWith('select') || trimmed.startsWith('with');
  }

  private updateMetrics(sql: string, duration: number): void {
    this.metrics.totalQueries++;
    
    // Update average query time
    const prevAvg = this.metrics.averageQueryTime;
    const prevTotal = this.metrics.totalQueries - 1;
    this.metrics.averageQueryTime = (prevAvg * prevTotal + duration) / this.metrics.totalQueries;

    // Track slow queries
    if (duration > this.SLOW_QUERY_THRESHOLD_MS) {
      this.metrics.slowQueries.push({
        sql,
        duration,
        timestamp: new Date(),
      });

      // Keep only the last 100 slow queries
      if (this.metrics.slowQueries.length > 100) {
        this.metrics.slowQueries = this.metrics.slowQueries.slice(-100);
      }
    }
  }

  // Query builder helpers
  buildInsertQuery(table: string, data: Record<string, any>): { sql: string; params: any[] } {
    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const params = Object.values(data);
    return { sql, params };
  }

  buildUpdateQuery(
    table: string, 
    data: Record<string, any>, 
    where: Record<string, any>
  ): { sql: string; params: any[] } {
    const setClauses = Object.keys(data).map(col => `${col} = ?`).join(', ');
    const whereClauses = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
    const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(where)];
    return { sql, params };
  }

  buildSelectQuery(
    table: string,
    options?: {
      columns?: string[];
      where?: Record<string, any>;
      orderBy?: string;
      limit?: number;
      offset?: number;
    }
  ): { sql: string; params: any[] } {
    const columns = options?.columns?.join(', ') || '*';
    let sql = `SELECT ${columns} FROM ${table}`;
    const params: any[] = [];

    if (options?.where) {
      const whereClauses = Object.keys(options.where).map(col => `${col} = ?`).join(' AND ');
      sql += ` WHERE ${whereClauses}`;
      params.push(...Object.values(options.where));
    }

    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    if (options?.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    return { sql, params };
  }
}
