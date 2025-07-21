import { D1Database } from '@cloudflare/workers-types';
import { logger } from './logger';

export interface QueryMetrics {
  query: string;
  executionTime: number;
  rowsAffected: number;
  cached: boolean;
}

export class QueryOptimizer {
  private db: D1Database;
  private queryCache: Map<string, { result: any; timestamp: number }> = new Map();
  private cacheMaxAge = 60000; // 1 minute default cache
  
  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Execute query with metrics and optional caching
   */
  async executeWithMetrics<T>(
    query: string,
    params: any[] = [],
    options: { cache?: boolean; cacheKey?: string } = {}
  ): Promise<{ result: T; metrics: QueryMetrics }> {
    const startTime = Date.now();
    let cached = false;
    let result: any;

    // Check cache if enabled
    if (options.cache) {
      const cacheKey = options.cacheKey || this.generateCacheKey(query, params);
      const cachedResult = this.queryCache.get(cacheKey);
      
      if (cachedResult && Date.now() - cachedResult.timestamp < this.cacheMaxAge) {
        result = cachedResult.result;
        cached = true;
      }
    }

    // Execute query if not cached
    if (!cached) {
      const stmt = this.db.prepare(query);
      if (params.length > 0) {
        stmt.bind(...params);
      }
      
      result = await stmt.all();

      // Cache result if caching is enabled
      if (options.cache) {
        const cacheKey = options.cacheKey || this.generateCacheKey(query, params);
        this.queryCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }
    }

    const executionTime = Date.now() - startTime;
    const metrics: QueryMetrics = {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      executionTime,
      rowsAffected: result.results?.length || 0,
      cached
    };

    // Log slow queries
    if (executionTime > 100 && !cached) {
      logger.warn(`Slow query detected (${executionTime}ms): ${metrics.query}`);
    }

    return { result: result as T, metrics };
  }

  /**
   * Batch execute multiple queries in a transaction
   */
  async batchExecute(queries: Array<{ query: string; params?: any[] }>): Promise<any[]> {
    const results: any[] = [];
    
    try {
      await this.db.batch(
        queries.map(({ query, params = [] }) => {
          const stmt = this.db.prepare(query);
          if (params.length > 0) {
            stmt.bind(...params);
          }
          return stmt;
        })
      );
    } catch (error) {
      logger.error('Batch execution failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Create optimized indexes based on query patterns
   */
  async analyzeAndOptimize(tableName: string): Promise<string[]> {
    const recommendations: string[] = [];

    try {
      // Get table schema
      const schema = await this.db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all();

      // Get current indexes
      const indexes = await this.db
        .prepare(`PRAGMA index_list(${tableName})`)
        .all();

      // Analyze common query patterns (simplified version)
      // In a real implementation, this would analyze actual query logs
      const columns = schema.results.map((col: any) => col.name);
      
      // Recommend indexes for foreign keys
      columns.forEach((col: string) => {
        if (col.endsWith('_id') || col === 'user_id' || col === 'skill_id') {
          const indexExists = indexes.results.some((idx: any) => 
            idx.name.includes(col)
          );
          
          if (!indexExists) {
            recommendations.push(
              `CREATE INDEX idx_${tableName}_${col} ON ${tableName}(${col});`
            );
          }
        }
      });

      // Recommend composite indexes for common queries
      if (tableName === 'gap_analyses') {
        recommendations.push(
          `CREATE INDEX idx_gap_analyses_user_created ON gap_analyses(user_id, created_at DESC);`
        );
      }

      if (tableName === 'skill_demand_history') {
        recommendations.push(
          `CREATE INDEX idx_skill_demand_date ON skill_demand_history(skill_name, date DESC);`
        );
      }

    } catch (error) {
      logger.error('Query optimization analysis failed:', error);
    }

    return recommendations;
  }

  /**
   * Generate cache key for query
   */
  private generateCacheKey(query: string, params: any[]): string {
    return `${query}:${JSON.stringify(params)}`;
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.queryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.queryCache.size,
      hitRate: 0 // Would need to track hits/misses for accurate rate
    };
  }
}

/**
 * Query builder for common patterns
 */
export class QueryBuilder {
  private table: string;
  private selectColumns: string[] = ['*'];
  private whereConditions: string[] = [];
  private orderByColumns: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private joins: string[] = [];
  private params: any[] = [];

  constructor(table: string) {
    this.table = table;
  }

  select(...columns: string[]): QueryBuilder {
    this.selectColumns = columns;
    return this;
  }

  where(condition: string, value?: any): QueryBuilder {
    this.whereConditions.push(condition);
    if (value !== undefined) {
      this.params.push(value);
    }
    return this;
  }

  join(type: 'INNER' | 'LEFT' | 'RIGHT', table: string, on: string): QueryBuilder {
    this.joins.push(`${type} JOIN ${table} ON ${on}`);
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    this.orderByColumns.push(`${column} ${direction}`);
    return this;
  }

  limit(value: number): QueryBuilder {
    this.limitValue = value;
    return this;
  }

  offset(value: number): QueryBuilder {
    this.offsetValue = value;
    return this;
  }

  build(): { query: string; params: any[] } {
    let query = `SELECT ${this.selectColumns.join(', ')} FROM ${this.table}`;

    if (this.joins.length > 0) {
      query += ' ' + this.joins.join(' ');
    }

    if (this.whereConditions.length > 0) {
      query += ' WHERE ' + this.whereConditions.join(' AND ');
    }

    if (this.orderByColumns.length > 0) {
      query += ' ORDER BY ' + this.orderByColumns.join(', ');
    }

    if (this.limitValue !== undefined) {
      query += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== undefined) {
      query += ` OFFSET ${this.offsetValue}`;
    }

    return { query, params: this.params };
  }
}

/**
 * Connection pool simulator for D1 (manages prepared statements)
 */
export class D1ConnectionPool {
  private statements: Map<string, any> = new Map();
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Get or create prepared statement
   */
  getPreparedStatement(query: string): any {
    let stmt = this.statements.get(query);
    
    if (!stmt) {
      stmt = this.db.prepare(query);
      this.statements.set(query, stmt);
    }

    return stmt;
  }

  /**
   * Clear all prepared statements
   */
  clear(): void {
    this.statements.clear();
  }

  /**
   * Get pool statistics
   */
  getStats(): { preparedStatements: number } {
    return {
      preparedStatements: this.statements.size
    };
  }
}
