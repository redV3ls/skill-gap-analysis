import { RetentionConfig, RetentionPolicy, getRetentionConfig } from '../config/dataRetention';
import { logger } from '../utils/logger';

interface KVNamespace {
  get(key: string, options?: { type?: string; metadata?: boolean }): Promise<any>;
  getWithMetadata(key: string): Promise<{ value: any; metadata: any }>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ 
    keys: Array<{ name: string; metadata?: any }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface PurgeResult {
  policy: string;
  keysScanned: number;
  keysDeleted: number;
  errors: number;
  duration: number;
}

export interface PurgeResults {
  totalKeysScanned: number;
  totalKeysDeleted: number;
  totalErrors: number;
  totalDuration: number;
  policies: PurgeResult[];
  dryRun: boolean;
}

export class DataRetentionService {
  private config: RetentionConfig;
  private env: any;

  constructor(environment: any) {
    this.env = environment;
    this.config = getRetentionConfig(environment);
  }

  async purgeExpiredData(): Promise<PurgeResults> {
    const startTime = Date.now();
    const results: PurgeResults = {
      totalKeysScanned: 0,
      totalKeysDeleted: 0,
      totalErrors: 0,
      totalDuration: 0,
      policies: [],
      dryRun: this.config.dryRun
    };

    for (const policy of this.config.policies) {
      const policyStartTime = Date.now();
      const policyResult: PurgeResult = {
        policy: policy.name,
        keysScanned: 0,
        keysDeleted: 0,
        errors: 0,
        duration: 0
      };

      try {
        const namespace = this.getKVNamespace(policy.kvNamespace);
        if (!namespace) {
          logger.warn(`KV namespace ${policy.kvNamespace} not found for policy ${policy.name}`);
          continue;
        }

        const expiredKeys = await this.getExpiredKeys(namespace, policy);
        policyResult.keysScanned = expiredKeys.scanned;
        policyResult.keysDeleted = expiredKeys.expired.length;

        if (!this.config.dryRun && expiredKeys.expired.length > 0) {
          const purgeErrors = await this.purgeKeys(namespace, expiredKeys.expired, policy);
          policyResult.errors = purgeErrors;
        }

        policyResult.duration = Date.now() - policyStartTime;
        results.policies.push(policyResult);
        
        results.totalKeysScanned += policyResult.keysScanned;
        results.totalKeysDeleted += policyResult.keysDeleted;
        results.totalErrors += policyResult.errors;

        logger.info(`Retention policy ${policy.name} completed`, policyResult);
      } catch (error) {
        logger.error(`Error processing retention policy ${policy.name}`, error);
        policyResult.errors++;
        policyResult.duration = Date.now() - policyStartTime;
        results.policies.push(policyResult);
        results.totalErrors++;
      }
    }

    results.totalDuration = Date.now() - startTime;
    return results;
  }

  private getKVNamespace(name: string): KVNamespace | null {
    // Get KV namespace from environment bindings
    return this.env[name] || null;
  }

  private async getExpiredKeys(namespace: KVNamespace, policy: RetentionPolicy): Promise<{ expired: string[]; scanned: number }> {
    const expiredKeys: string[] = [];
    const currentTime = Date.now();
    const expiryThreshold = currentTime - (policy.retentionDays * 24 * 60 * 60 * 1000);
    let scanned = 0;
    let cursor: string | undefined;
    
    // Handle pagination for large datasets
    do {
      const listResult = await namespace.list({ 
        prefix: policy.keyPattern?.source?.replace(/[\^$]/g, ''),
        limit: 1000,
        cursor
      });

      for (const key of listResult.keys) {
        scanned++;
        
        // Check if key matches pattern if specified
        if (policy.keyPattern && !policy.keyPattern.test(key.name)) {
          continue;
        }

        try {
          // Get metadata to check creation/modification time
          const { metadata } = await namespace.getWithMetadata(key.name);
          const timestamp = metadata?.timestamp || metadata?.created || 0;
          
          if (timestamp && timestamp < expiryThreshold) {
            expiredKeys.push(key.name);
          }
        } catch (error) {
          // If no metadata, check the key name for timestamp patterns
          const timestampMatch = key.name.match(/:(\d{13})/);
          if (timestampMatch) {
            const keyTimestamp = parseInt(timestampMatch[1]);
            if (keyTimestamp < expiryThreshold) {
              expiredKeys.push(key.name);
            }
          }
        }
      }

      cursor = listResult.cursor;
    } while (cursor);

    logger.info(`Scanned ${scanned} keys for policy ${policy.name}, found ${expiredKeys.length} expired`);
    return { expired: expiredKeys, scanned };
  }

  private async purgeKeys(namespace: KVNamespace, keys: string[], policy: RetentionPolicy): Promise<number> {
    const batchSize = this.config.batchSize;
    let errors = 0;
    
    logger.info(`Starting purge of ${keys.length} keys for policy ${policy.name}`);
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      try {
        await Promise.all(batch.map(async (key) => {
          try {
            await namespace.delete(key);
          } catch (error) {
            logger.error(`Failed to delete key ${key}`, error);
            errors++;
          }
        }));
        
        logger.debug(`Deleted batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(keys.length / batchSize)}`);
        
        // Add delay between batches to avoid rate limits
        if (this.config.delayMs > 0 && i + batchSize < keys.length) {
          await new Promise(resolve => setTimeout(resolve, this.config.delayMs));
        }
      } catch (error) {
        logger.error(`Failed to delete batch starting at index ${i}`, error);
        errors += batch.length;
      }
    }
    
    return errors;
  }
}

