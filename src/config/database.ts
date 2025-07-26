import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Create database instance for Cloudflare D1
 */
export function createDatabase(d1: D1Database): Database {
  return drizzle(d1, { schema });
}

/**
 * Database connection helper for services
 */
export class DatabaseManager {
  private static instance: Database | null = null;

  static initialize(d1: D1Database): Database {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = createDatabase(d1);
    }
    return DatabaseManager.instance;
  }

  static getInstance(): Database {
    if (!DatabaseManager.instance) {
      throw new Error('Database not initialized. Call DatabaseManager.initialize() first.');
    }
    return DatabaseManager.instance;
  }

  static reset(): void {
    DatabaseManager.instance = null;
  }
}