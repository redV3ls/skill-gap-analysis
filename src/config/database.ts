import { drizzle } from 'drizzle-orm/d1';
import { logger } from '../utils/logger';
import * as schema from '../db/schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(d1: D1Database): Database {
  return drizzle(d1, { schema });
}

export async function testDatabaseConnection(db: Database): Promise<void> {
  try {
    // Simple query to test connection
    await db.select().from(schema.users).limit(1);
    logger.info('✅ Database connection test successful');
  } catch (error) {
    logger.error('❌ Database connection test failed:', error);
    throw error;
  }
}