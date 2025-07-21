export interface RetentionPolicy {
  name: string;
  description: string;
  retentionDays: number;
  kvNamespace: string;
  keyPattern?: RegExp;
  enabled: boolean;
}

export const DATA_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    name: 'skill_assessments',
    description: 'Individual skill assessment records',
    retentionDays: 365, // 1 year
    kvNamespace: 'SKILL_ASSESSMENTS',
    keyPattern: /^assessment:/,
    enabled: true
  },
  {
    name: 'gap_analysis',
    description: 'Gap analysis results',
    retentionDays: 180, // 6 months
    kvNamespace: 'GAP_ANALYSIS',
    keyPattern: /^gap:/,
    enabled: true
  },
  {
    name: 'user_profiles',
    description: 'User profile data',
    retentionDays: 730, // 2 years after last activity
    kvNamespace: 'USER_PROFILES',
    keyPattern: /^user:/,
    enabled: true
  },
  {
    name: 'error_logs',
    description: 'Error tracking logs',
    retentionDays: 90, // 3 months
    kvNamespace: 'ERROR_TRACKING',
    keyPattern: /^error:/,
    enabled: true
  },
  {
    name: 'application_logs',
    description: 'General application logs',
    retentionDays: 30, // 1 month
    kvNamespace: 'LOGS',
    keyPattern: /^log:/,
    enabled: true
  },
  {
    name: 'analytics_data',
    description: 'Usage analytics and metrics',
    retentionDays: 365, // 1 year
    kvNamespace: 'ANALYTICS',
    keyPattern: /^analytics:/,
    enabled: true
  },
  {
    name: 'cache_data',
    description: 'Cached responses and computations',
    retentionDays: 7, // 1 week
    kvNamespace: 'CACHE',
    keyPattern: /^cache:/,
    enabled: true
  },
  {
    name: 'job_queue',
    description: 'Completed job records',
    retentionDays: 30, // 1 month
    kvNamespace: 'JOB_QUEUE',
    keyPattern: /^job:.*:completed$/,
    enabled: true
  },
  {
    name: 'audit_logs',
    description: 'Security and compliance audit logs',
    retentionDays: 2555, // 7 years for compliance
    kvNamespace: 'AUDIT_LOGS',
    keyPattern: /^audit:/,
    enabled: true
  }
];

export const PURGE_BATCH_SIZE = 100;
export const PURGE_DELAY_MS = 100; // Delay between batches to avoid rate limits

export interface RetentionConfig {
  policies: RetentionPolicy[];
  batchSize: number;
  delayMs: number;
  dryRun: boolean;
}

export function getRetentionConfig(env: any): RetentionConfig {
  return {
    policies: DATA_RETENTION_POLICIES.filter(p => p.enabled),
    batchSize: env.RETENTION_BATCH_SIZE || PURGE_BATCH_SIZE,
    delayMs: env.RETENTION_DELAY_MS || PURGE_DELAY_MS,
    dryRun: env.RETENTION_DRY_RUN === 'true'
  };
}
