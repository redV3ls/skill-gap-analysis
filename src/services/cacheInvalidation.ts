import { Env } from '../index';
import { logger } from '../utils/logger';
import { IntelligentCachingService } from './intelligentCaching';

export interface InvalidationRule {
  id: string;
  name: string;
  description: string;
  triggers: InvalidationTrigger[];
  targets: InvalidationTarget[];
  conditions?: InvalidationCondition[];
  priority: number; // 1-10, higher = more important
  enabled: boolean;
}

export interface InvalidationTrigger {
  type: 'data_change' | 'time_based' | 'manual' | 'event';
  entityType?: string; // user, skill, job, analysis
  operation?: 'create' | 'update' | 'delete';
  schedule?: string; // cron expression for time-based
  eventName?: string; // for event-based triggers
}

export interface InvalidationTarget {
  type: 'tags' | 'keys' | 'pattern';
  value: string | string[];
  cascade?: boolean; // whether to invalidate related caches
}

export interface InvalidationCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: any;
}

export interface InvalidationEvent {
  id: string;
  ruleId: string;
  trigger: InvalidationTrigger;
  timestamp: string;
  entityId?: string;
  entityType?: string;
  operation?: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  invalidatedCount?: number;
  error?: string;
}

export class CacheInvalidationService {
  private env: Env;
  private cache: IntelligentCachingService;
  private rules: Map<string, InvalidationRule> = new Map();
  private readonly RULES_KEY = 'cache_invalidation:rules';
  private readonly EVENTS_KEY = 'cache_invalidation:events';

  constructor(env: Env) {
    this.env = env;
    this.cache = new IntelligentCachingService(env);
    this.initializeDefaultRules();
  }

  /**
   * Initialize default invalidation rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: InvalidationRule[] = [
      {
        id: 'user_profile_changes',
        name: 'User Profile Changes',
        description: 'Invalidate user-related caches when profile data changes',
        triggers: [
          { type: 'data_change', entityType: 'user', operation: 'update' },
          { type: 'data_change', entityType: 'user_profile', operation: 'update' },
          { type: 'data_change', entityType: 'user_skills', operation: 'create' },
          { type: 'data_change', entityType: 'user_skills', operation: 'update' },
          { type: 'data_change', entityType: 'user_skills', operation: 'delete' },
        ],
        targets: [
          { type: 'tags', value: ['user', 'user_profile', 'user_skills'], cascade: true },
        ],
        priority: 8,
        enabled: true,
      },
      {
        id: 'skills_taxonomy_changes',
        name: 'Skills Taxonomy Changes',
        description: 'Invalidate skill-related caches when taxonomy changes',
        triggers: [
          { type: 'data_change', entityType: 'skills', operation: 'create' },
          { type: 'data_change', entityType: 'skills', operation: 'update' },
          { type: 'data_change', entityType: 'skills', operation: 'delete' },
          { type: 'data_change', entityType: 'skill_synonyms', operation: 'create' },
          { type: 'data_change', entityType: 'skill_synonyms', operation: 'delete' },
        ],
        targets: [
          { type: 'tags', value: ['skills', 'skills_taxonomy', 'skill_matching'], cascade: true },
        ],
        priority: 9,
        enabled: true,
      },
      {
        id: 'job_requirements_changes',
        name: 'Job Requirements Changes',
        description: 'Invalidate job and analysis caches when job data changes',
        triggers: [
          { type: 'data_change', entityType: 'jobs', operation: 'create' },
          { type: 'data_change', entityType: 'jobs', operation: 'update' },
          { type: 'data_change', entityType: 'jobs', operation: 'delete' },
          { type: 'data_change', entityType: 'job_skills', operation: 'create' },
          { type: 'data_change', entityType: 'job_skills', operation: 'update' },
          { type: 'data_change', entityType: 'job_skills', operation: 'delete' },
        ],
        targets: [
          { type: 'tags', value: ['jobs', 'job_requirements', 'gap_analysis'], cascade: true },
        ],
        priority: 7,
        enabled: true,
      },
      {
        id: 'trends_data_refresh',
        name: 'Trends Data Refresh',
        description: 'Refresh trends caches on schedule and data updates',
        triggers: [
          { type: 'time_based', schedule: '0 */6 * * *' }, // Every 6 hours
          { type: 'data_change', entityType: 'skill_demand_history', operation: 'create' },
          { type: 'data_change', entityType: 'emerging_skills', operation: 'update' },
          { type: 'data_change', entityType: 'market_forecasts', operation: 'create' },
        ],
        targets: [
          { type: 'tags', value: ['trends', 'forecasts', 'industry', 'market_forecasts'], cascade: false },
        ],
        priority: 5,
        enabled: true,
      },
      {
        id: 'analysis_results_cleanup',
        name: 'Analysis Results Cleanup',
        description: 'Clean up old analysis caches and refresh current ones',
        triggers: [
          { type: 'time_based', schedule: '0 2 * * *' }, // Daily at 2 AM
          { type: 'data_change', entityType: 'gap_analyses', operation: 'create' },
        ],
        targets: [
          { type: 'tags', value: ['gap_analysis', 'analysis'], cascade: true },
        ],
        priority: 6,
        enabled: true,
      },
      {
        id: 'api_cache_refresh',
        name: 'API Cache Refresh',
        description: 'Refresh short-lived API response caches',
        triggers: [
          { type: 'time_based', schedule: '*/15 * * * *' }, // Every 15 minutes
        ],
        targets: [
          { type: 'tags', value: ['api', 'search'], cascade: false },
        ],
        priority: 3,
        enabled: true,
      },
      {
        id: 'performance_optimization',
        name: 'Performance Optimization',
        description: 'Optimize cache performance by removing stale entries',
        triggers: [
          { type: 'time_based', schedule: '0 1 * * *' }, // Daily at 1 AM
        ],
        targets: [
          { type: 'pattern', value: 'cache:*', cascade: false },
        ],
        priority: 2,
        enabled: true,
      },
    ];

    defaultRules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Add or update an invalidation rule
   */
  async addRule(rule: InvalidationRule): Promise<void> {
    try {
      this.rules.set(rule.id, rule);
      await this.persistRules();
      logger.info(`Added invalidation rule: ${rule.name}`);
    } catch (error) {
      logger.error('Error adding invalidation rule:', error);
      throw error;
    }
  }

  /**
   * Remove an invalidation rule
   */
  async removeRule(ruleId: string): Promise<void> {
    try {
      if (this.rules.delete(ruleId)) {
        await this.persistRules();
        logger.info(`Removed invalidation rule: ${ruleId}`);
      }
    } catch (error) {
      logger.error('Error removing invalidation rule:', error);
      throw error;
    }
  }

  /**
   * Enable or disable a rule
   */
  async toggleRule(ruleId: string, enabled: boolean): Promise<void> {
    try {
      const rule = this.rules.get(ruleId);
      if (rule) {
        rule.enabled = enabled;
        await this.persistRules();
        logger.info(`${enabled ? 'Enabled' : 'Disabled'} invalidation rule: ${rule.name}`);
      }
    } catch (error) {
      logger.error('Error toggling invalidation rule:', error);
      throw error;
    }
  }

  /**
   * Trigger invalidation based on data changes
   */
  async triggerDataChange(
    entityType: string,
    operation: 'create' | 'update' | 'delete',
    entityId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const matchingRules = this.findMatchingRules({
        type: 'data_change',
        entityType,
        operation,
      });

      for (const rule of matchingRules) {
        if (rule.enabled && this.evaluateConditions(rule.conditions, metadata)) {
          await this.executeInvalidation(rule, {
            entityType,
            operation,
            entityId,
            metadata,
          });
        }
      }
    } catch (error) {
      logger.error('Error triggering data change invalidation:', error);
    }
  }

  /**
   * Trigger manual invalidation
   */
  async triggerManual(
    ruleId: string,
    entityId?: string,
    metadata?: Record<string, any>
  ): Promise<InvalidationEvent> {
    try {
      const rule = this.rules.get(ruleId);
      if (!rule) {
        throw new Error(`Invalidation rule not found: ${ruleId}`);
      }

      if (!rule.enabled) {
        throw new Error(`Invalidation rule is disabled: ${rule.name}`);
      }

      return await this.executeInvalidation(rule, {
        entityId,
        metadata,
        manual: true,
      });
    } catch (error) {
      logger.error('Error triggering manual invalidation:', error);
      throw error;
    }
  }

  /**
   * Process scheduled invalidations (called by cron job)
   */
  async processScheduledInvalidations(): Promise<void> {
    try {
      const now = new Date();
      const scheduledRules = Array.from(this.rules.values()).filter(rule => 
        rule.enabled && 
        rule.triggers.some(trigger => 
          trigger.type === 'time_based' && 
          trigger.schedule &&
          this.shouldRunScheduledTask(trigger.schedule, now)
        )
      );

      for (const rule of scheduledRules) {
        await this.executeInvalidation(rule, {
          scheduled: true,
          timestamp: now.toISOString(),
        });
      }
    } catch (error) {
      logger.error('Error processing scheduled invalidations:', error);
    }
  }

  /**
   * Get invalidation events history
   */
  async getInvalidationEvents(
    limit: number = 100,
    ruleId?: string
  ): Promise<InvalidationEvent[]> {
    try {
      const eventsData = await this.env.CACHE.get(this.EVENTS_KEY, 'json') as InvalidationEvent[] || [];
      
      let filteredEvents = eventsData;
      if (ruleId) {
        filteredEvents = eventsData.filter(event => event.ruleId === ruleId);
      }

      return filteredEvents
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting invalidation events:', error);
      return [];
    }
  }

  /**
   * Get all invalidation rules
   */
  getRules(): InvalidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get invalidation statistics
   */
  async getInvalidationStats(): Promise<{
    totalRules: number;
    enabledRules: number;
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    averageInvalidationCount: number;
  }> {
    try {
      const events = await this.getInvalidationEvents(1000);
      const successfulEvents = events.filter(e => e.status === 'completed');
      const failedEvents = events.filter(e => e.status === 'failed');
      
      const totalInvalidations = successfulEvents.reduce((sum, e) => sum + (e.invalidatedCount || 0), 0);
      const averageInvalidationCount = successfulEvents.length > 0 ? 
        totalInvalidations / successfulEvents.length : 0;

      return {
        totalRules: this.rules.size,
        enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
        totalEvents: events.length,
        successfulEvents: successfulEvents.length,
        failedEvents: failedEvents.length,
        averageInvalidationCount,
      };
    } catch (error) {
      logger.error('Error getting invalidation stats:', error);
      return {
        totalRules: 0,
        enabledRules: 0,
        totalEvents: 0,
        successfulEvents: 0,
        failedEvents: 0,
        averageInvalidationCount: 0,
      };
    }
  }

  // Private helper methods

  private findMatchingRules(trigger: InvalidationTrigger): InvalidationRule[] {
    return Array.from(this.rules.values()).filter(rule =>
      rule.triggers.some(ruleTrigger =>
        ruleTrigger.type === trigger.type &&
        (!trigger.entityType || ruleTrigger.entityType === trigger.entityType) &&
        (!trigger.operation || ruleTrigger.operation === trigger.operation)
      )
    ).sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  private evaluateConditions(
    conditions: InvalidationCondition[] | undefined,
    metadata: Record<string, any> | undefined
  ): boolean {
    if (!conditions || conditions.length === 0) {
      return true;
    }

    if (!metadata) {
      return false;
    }

    return conditions.every(condition => {
      const fieldValue = metadata[condition.field];
      
      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value;
        case 'not_equals':
          return fieldValue !== condition.value;
        case 'contains':
          return typeof fieldValue === 'string' && fieldValue.includes(condition.value);
        case 'greater_than':
          return typeof fieldValue === 'number' && fieldValue > condition.value;
        case 'less_than':
          return typeof fieldValue === 'number' && fieldValue < condition.value;
        default:
          return false;
      }
    });
  }

  private async executeInvalidation(
    rule: InvalidationRule,
    context: Record<string, any>
  ): Promise<InvalidationEvent> {
    const event: InvalidationEvent = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      trigger: rule.triggers[0], // Use first trigger for event logging
      timestamp: new Date().toISOString(),
      entityId: context.entityId,
      entityType: context.entityType,
      operation: context.operation,
      metadata: context.metadata,
      status: 'processing',
    };

    try {
      let totalInvalidated = 0;

      for (const target of rule.targets) {
        const invalidatedCount = await this.executeInvalidationTarget(target);
        totalInvalidated += invalidatedCount;
      }

      event.status = 'completed';
      event.invalidatedCount = totalInvalidated;

      logger.info(`Invalidation completed: ${rule.name} (${totalInvalidated} entries)`);
    } catch (error) {
      event.status = 'failed';
      event.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Invalidation failed: ${rule.name}`, error);
    }

    await this.recordInvalidationEvent(event);
    return event;
  }

  private async executeInvalidationTarget(target: InvalidationTarget): Promise<number> {
    switch (target.type) {
      case 'tags':
        const tags = Array.isArray(target.value) ? target.value : [target.value];
        return await this.cache.invalidateByTags(tags);
      
      case 'keys':
        const keys = Array.isArray(target.value) ? target.value : [target.value];
        for (const key of keys) {
          await this.env.CACHE.delete(key);
        }
        return keys.length;
      
      case 'pattern':
        return await this.invalidateByPattern(target.value as string);
      
      default:
        logger.warn(`Unknown invalidation target type: ${target.type}`);
        return 0;
    }
  }

  private async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const { keys } = await this.env.CACHE.list({ prefix: pattern.replace('*', '') });
      
      const deletePromises = keys.map(key => this.env.CACHE.delete(key.name));
      await Promise.all(deletePromises);
      
      return keys.length;
    } catch (error) {
      logger.error('Error invalidating by pattern:', error);
      return 0;
    }
  }

  private shouldRunScheduledTask(cronExpression: string, now: Date): boolean {
    // Simple cron evaluation - in production, use a proper cron library
    // For now, just check if it's time based on basic patterns
    
    // Every 15 minutes: */15 * * * *
    if (cronExpression === '*/15 * * * *') {
      return now.getMinutes() % 15 === 0;
    }
    
    // Every 6 hours: 0 */6 * * *
    if (cronExpression === '0 */6 * * *') {
      return now.getMinutes() === 0 && now.getHours() % 6 === 0;
    }
    
    // Daily at 1 AM: 0 1 * * *
    if (cronExpression === '0 1 * * *') {
      return now.getHours() === 1 && now.getMinutes() === 0;
    }
    
    // Daily at 2 AM: 0 2 * * *
    if (cronExpression === '0 2 * * *') {
      return now.getHours() === 2 && now.getMinutes() === 0;
    }
    
    return false;
  }

  private async persistRules(): Promise<void> {
    try {
      const rulesArray = Array.from(this.rules.values());
      await this.env.CACHE.put(
        this.RULES_KEY,
        JSON.stringify(rulesArray),
        { expirationTtl: 86400 * 30 } // 30 days
      );
    } catch (error) {
      logger.error('Error persisting invalidation rules:', error);
    }
  }

  private async recordInvalidationEvent(event: InvalidationEvent): Promise<void> {
    try {
      const existingEvents = await this.env.CACHE.get(this.EVENTS_KEY, 'json') as InvalidationEvent[] || [];
      
      // Keep only last 1000 events
      const updatedEvents = [event, ...existingEvents].slice(0, 1000);
      
      await this.env.CACHE.put(
        this.EVENTS_KEY,
        JSON.stringify(updatedEvents),
        { expirationTtl: 86400 * 7 } // 7 days
      );
    } catch (error) {
      logger.error('Error recording invalidation event:', error);
    }
  }
}