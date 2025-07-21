import { logger } from '../utils/logger';
import { Database } from '../config/database';

export interface LearningResource {
  id: string;
  title: string;
  description: string;
  provider: string;
  type: 'course' | 'tutorial' | 'book' | 'certification' | 'practice' | 'documentation' | 'video' | 'article';
  url: string;
  skillName: string;
  skillCategory: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  duration: number; // in hours
  rating: number; // 0-5 scale
  reviewCount: number;
  price: number; // 0 for free
  currency: string;
  language: string;
  format: 'online' | 'in-person' | 'hybrid' | 'self-paced' | 'instructor-led';
  prerequisites: string[];
  learningObjectives: string[];
  tags: string[];
  lastUpdated: string;
  popularity: number; // 0-1 scale
  relevanceScore?: number; // Calculated based on user preferences
}

export interface ResourceFilter {
  skillNames?: string[];
  categories?: string[];
  types?: LearningResource['type'][];
  levels?: LearningResource['level'][];
  maxPrice?: number;
  minRating?: number;
  languages?: string[];
  formats?: LearningResource['format'][];
  maxDuration?: number;
  providers?: string[];
  freeOnly?: boolean;
}

export interface UserPreferences {
  learningStyle?: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  timeCommitment?: number; // hours per week
  budgetRange?: 'free' | 'low' | 'medium' | 'high';
  preferredFormats?: LearningResource['format'][];
  preferredProviders?: string[];
  languages?: string[];
  certificationPreference?: boolean;
  difficultyPreference?: 'easy-first' | 'hard-first' | 'balanced';
}

export interface ResourceRecommendation {
  resource: LearningResource;
  relevanceScore: number;
  reasoning: string[];
  matchedCriteria: string[];
  estimatedCompletionTime: number; // in weeks
  fitScore: number; // How well it fits user preferences (0-1)
}

export interface ResourceProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  rateLimit: number; // requests per minute
  supportedTypes: LearningResource['type'][];
  searchCapabilities: {
    bySkill: boolean;
    byLevel: boolean;
    byDuration: boolean;
    byPrice: boolean;
    byRating: boolean;
  };
}

export class LearningResourceIntegrationService {
  private providers: Map<string, ResourceProvider> = new Map();
  private resourceCache: Map<string, LearningResource[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private db: Database) {
    this.initializeProviders();
  }

  /**
   * Find learning resources for specific skills with filtering and ranking
   */
  async findResourcesForSkills(
    skillNames: string[],
    userPreferences: UserPreferences = {},
    filters: ResourceFilter = {}
  ): Promise<ResourceRecommendation[]> {
    try {
      logger.info(`Finding resources for skills: ${skillNames.join(', ')}`);

      // Step 1: Gather resources from all providers
      const allResources = await this.gatherResourcesFromProviders(skillNames, filters);

      // Step 2: Apply filters
      const filteredResources = this.applyFilters(allResources, filters);

      // Step 3: Calculate relevance scores based on user preferences
      const scoredResources = this.calculateRelevanceScores(filteredResources, userPreferences, skillNames);

      // Step 4: Rank resources by relevance and quality
      const rankedResources = this.rankResources(scoredResources, userPreferences);

      // Step 5: Generate recommendations with reasoning
      const recommendations = this.generateRecommendations(rankedResources, userPreferences);

      logger.info(`Found ${recommendations.length} resource recommendations`);
      return recommendations;
    } catch (error) {
      logger.error('Error finding learning resources:', error);
      throw new Error(`Resource search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get resources for a specific learning path step
   */
  async getResourcesForLearningStep(
    skillName: string,
    currentLevel: string | undefined,
    targetLevel: string,
    userPreferences: UserPreferences = {}
  ): Promise<ResourceRecommendation[]> {
    const filters: ResourceFilter = {
      skillNames: [skillName],
      levels: this.getLevelsForProgression(currentLevel, targetLevel)
    };

    return this.findResourcesForSkills([skillName], userPreferences, filters);
  }

  /**
   * Search resources by query with advanced filtering
   */
  async searchResources(
    query: string,
    filters: ResourceFilter = {},
    userPreferences: UserPreferences = {}
  ): Promise<ResourceRecommendation[]> {
    try {
      // Extract potential skill names from query
      const skillNames = await this.extractSkillsFromQuery(query);
      
      // Search across all providers
      const searchResults = await this.searchAcrossProviders(query, filters);
      
      // Combine with skill-based results if skills were identified
      let allResources = searchResults;
      if (skillNames.length > 0) {
        const skillResources = await this.gatherResourcesFromProviders(skillNames, filters);
        allResources = [...searchResults, ...skillResources];
      }

      // Remove duplicates
      const uniqueResources = this.removeDuplicateResources(allResources);

      // Apply filters and rank
      const filteredResources = this.applyFilters(uniqueResources, filters);
      const scoredResources = this.calculateRelevanceScores(filteredResources, userPreferences, skillNames);
      const rankedResources = this.rankResources(scoredResources, userPreferences);

      return this.generateRecommendations(rankedResources, userPreferences);
    } catch (error) {
      logger.error('Error searching resources:', error);
      throw new Error(`Resource search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get trending resources for a category or skill
   */
  async getTrendingResources(
    category?: string,
    skillName?: string,
    limit: number = 20
  ): Promise<LearningResource[]> {
    try {
      const filters: ResourceFilter = {};
      
      if (category) {
        filters.categories = [category];
      }
      
      if (skillName) {
        filters.skillNames = [skillName];
      }

      // If no specific skill, get resources for common skills to ensure we have results
      const skillsToSearch = skillName ? [skillName] : ['JavaScript', 'Python', 'React'];
      
      const resources = await this.gatherResourcesFromProviders(
        skillsToSearch,
        filters
      );

      // Apply category filter if specified
      let filteredResources = resources;
      if (category) {
        filteredResources = resources.filter(resource => resource.skillCategory === category);
      }

      // Sort by popularity and recent updates
      return filteredResources
        .sort((a, b) => {
          const popularityScore = b.popularity - a.popularity;
          const recencyScore = new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
          return popularityScore * 0.7 + recencyScore * 0.3;
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting trending resources:', error);
      throw new Error(`Failed to get trending resources: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gather resources from all configured providers
   */
  private async gatherResourcesFromProviders(
    skillNames: string[],
    filters: ResourceFilter
  ): Promise<LearningResource[]> {
    const allResources: LearningResource[] = [];

    for (const [providerName, provider] of this.providers) {
      try {
        const cacheKey = this.generateCacheKey(providerName, skillNames, filters);
        
        // Check cache first
        if (this.isCacheValid(cacheKey)) {
          const cachedResources = this.resourceCache.get(cacheKey);
          if (cachedResources) {
            allResources.push(...cachedResources);
            continue;
          }
        }

        // Fetch from provider
        const providerResources = await this.fetchFromProvider(provider, skillNames, filters);
        
        // Cache the results
        this.resourceCache.set(cacheKey, providerResources);
        this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);
        
        allResources.push(...providerResources);
      } catch (error) {
        logger.warn(`Failed to fetch from provider ${providerName}:`, error);
        // Continue with other providers
      }
    }

    return this.removeDuplicateResources(allResources);
  }

  /**
   * Fetch resources from a specific provider
   */
  private async fetchFromProvider(
    provider: ResourceProvider,
    skillNames: string[],
    filters: ResourceFilter
  ): Promise<LearningResource[]> {
    // This would be implemented for each specific provider
    // For now, return mock data based on the provider
    return this.getMockResourcesForProvider(provider, skillNames, filters);
  }

  /**
   * Search across all providers with a text query
   */
  private async searchAcrossProviders(
    query: string,
    filters: ResourceFilter
  ): Promise<LearningResource[]> {
    const allResults: LearningResource[] = [];

    for (const [providerName, provider] of this.providers) {
      try {
        const results = await this.searchProvider(provider, query, filters);
        allResults.push(...results);
      } catch (error) {
        logger.warn(`Search failed for provider ${providerName}:`, error);
      }
    }

    return this.removeDuplicateResources(allResults);
  }

  /**
   * Search a specific provider with text query
   */
  private async searchProvider(
    provider: ResourceProvider,
    query: string,
    filters: ResourceFilter
  ): Promise<LearningResource[]> {
    // Mock implementation - would integrate with actual provider APIs
    return this.getMockSearchResults(provider, query, filters);
  }

  /**
   * Apply filters to resource list
   */
  private applyFilters(resources: LearningResource[], filters: ResourceFilter): LearningResource[] {
    return resources.filter(resource => {
      // Skill name filter
      if (filters.skillNames && !filters.skillNames.includes(resource.skillName)) {
        return false;
      }

      // Category filter
      if (filters.categories && !filters.categories.includes(resource.skillCategory)) {
        return false;
      }

      // Type filter
      if (filters.types && !filters.types.includes(resource.type)) {
        return false;
      }

      // Level filter
      if (filters.levels && !filters.levels.includes(resource.level)) {
        return false;
      }

      // Price filter
      if (filters.maxPrice !== undefined && resource.price > filters.maxPrice) {
        return false;
      }

      // Free only filter
      if (filters.freeOnly && resource.price > 0) {
        return false;
      }

      // Rating filter
      if (filters.minRating && resource.rating < filters.minRating) {
        return false;
      }

      // Language filter
      if (filters.languages && !filters.languages.includes(resource.language)) {
        return false;
      }

      // Format filter
      if (filters.formats && !filters.formats.includes(resource.format)) {
        return false;
      }

      // Duration filter
      if (filters.maxDuration && resource.duration > filters.maxDuration) {
        return false;
      }

      // Provider filter
      if (filters.providers && !filters.providers.includes(resource.provider)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate relevance scores based on user preferences
   */
  private calculateRelevanceScores(
    resources: LearningResource[],
    userPreferences: UserPreferences,
    targetSkills: string[]
  ): LearningResource[] {
    return resources.map(resource => {
      let score = 0;
      const maxScore = 100;

      // Base score from rating and popularity
      score += (resource.rating / 5) * 20; // 0-20 points
      score += resource.popularity * 15; // 0-15 points

      // Skill relevance
      if (targetSkills.includes(resource.skillName)) {
        score += 25; // 25 points for exact skill match
      }

      // User preference matching
      if (userPreferences.preferredFormats?.includes(resource.format)) {
        score += 10;
      }

      if (userPreferences.preferredProviders?.includes(resource.provider)) {
        score += 5;
      }

      if (userPreferences.languages?.includes(resource.language)) {
        score += 5;
      }

      // Budget preference
      if (userPreferences.budgetRange) {
        const budgetScore = this.calculateBudgetScore(resource.price, userPreferences.budgetRange);
        score += budgetScore * 10;
      }

      // Time commitment
      if (userPreferences.timeCommitment) {
        const timeScore = this.calculateTimeScore(resource.duration, userPreferences.timeCommitment);
        score += timeScore * 10;
      }

      // Certification preference
      if (userPreferences.certificationPreference && resource.type === 'certification') {
        score += 5;
      }

      // Normalize score to 0-1 range
      resource.relevanceScore = Math.min(score / maxScore, 1);
      
      return resource;
    });
  }

  /**
   * Calculate budget compatibility score
   */
  private calculateBudgetScore(price: number, budgetRange: string): number {
    const budgetRanges = {
      'free': { min: 0, max: 0 },
      'low': { min: 0, max: 50 },
      'medium': { min: 0, max: 200 },
      'high': { min: 0, max: 1000 }
    };

    const range = budgetRanges[budgetRange as keyof typeof budgetRanges];
    if (!range) return 0.5;

    if (price >= range.min && price <= range.max) {
      return 1;
    }

    if (price > range.max) {
      return Math.max(0, 1 - (price - range.max) / range.max);
    }

    return 1;
  }

  /**
   * Calculate time commitment compatibility score
   */
  private calculateTimeScore(duration: number, weeklyCommitment: number): number {
    const weeksToComplete = duration / weeklyCommitment;
    
    // Optimal completion time is 2-8 weeks
    if (weeksToComplete >= 2 && weeksToComplete <= 8) {
      return 1;
    }
    
    if (weeksToComplete < 2) {
      return 0.7; // Too short might not be comprehensive
    }
    
    if (weeksToComplete > 8) {
      return Math.max(0.3, 1 - (weeksToComplete - 8) / 20);
    }
    
    return 0.5;
  }

  /**
   * Rank resources by relevance and quality
   */
  private rankResources(
    resources: LearningResource[],
    userPreferences: UserPreferences
  ): LearningResource[] {
    return resources.sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      
      // Primary sort by relevance score
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      
      // Secondary sort by rating
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      
      // Tertiary sort by review count (more reviews = more reliable)
      return b.reviewCount - a.reviewCount;
    });
  }

  /**
   * Generate recommendations with reasoning
   */
  private generateRecommendations(
    rankedResources: LearningResource[],
    userPreferences: UserPreferences
  ): ResourceRecommendation[] {
    return rankedResources.map(resource => {
      const reasoning: string[] = [];
      const matchedCriteria: string[] = [];
      
      // Generate reasoning based on why this resource was recommended
      if (resource.rating >= 4.5) {
        reasoning.push(`Highly rated (${resource.rating}/5) with ${resource.reviewCount} reviews`);
        matchedCriteria.push('high-rating');
      }
      
      if (resource.price === 0) {
        reasoning.push('Free resource');
        matchedCriteria.push('free');
      }
      
      if (userPreferences.preferredFormats?.includes(resource.format)) {
        reasoning.push(`Matches your preferred format (${resource.format})`);
        matchedCriteria.push('format-preference');
      }
      
      if (userPreferences.certificationPreference && resource.type === 'certification') {
        reasoning.push('Provides certification upon completion');
        matchedCriteria.push('certification');
      }
      
      if (resource.popularity > 0.8) {
        reasoning.push('Popular choice among learners');
        matchedCriteria.push('popular');
      }

      // Calculate fit score
      const fitScore = this.calculateFitScore(resource, userPreferences);
      
      // Estimate completion time
      const estimatedCompletionTime = userPreferences.timeCommitment 
        ? Math.ceil(resource.duration / userPreferences.timeCommitment)
        : Math.ceil(resource.duration / 5); // Default 5 hours per week

      return {
        resource,
        relevanceScore: resource.relevanceScore || 0,
        reasoning,
        matchedCriteria,
        estimatedCompletionTime,
        fitScore
      };
    });
  }

  /**
   * Calculate how well a resource fits user preferences
   */
  private calculateFitScore(resource: LearningResource, userPreferences: UserPreferences): number {
    let score = 0;
    let maxScore = 0;

    // Format preference
    maxScore += 20;
    if (userPreferences.preferredFormats?.includes(resource.format)) {
      score += 20;
    }

    // Provider preference
    maxScore += 15;
    if (userPreferences.preferredProviders?.includes(resource.provider)) {
      score += 15;
    }

    // Budget compatibility
    maxScore += 25;
    if (userPreferences.budgetRange) {
      score += this.calculateBudgetScore(resource.price, userPreferences.budgetRange) * 25;
    }

    // Time commitment compatibility
    maxScore += 20;
    if (userPreferences.timeCommitment) {
      score += this.calculateTimeScore(resource.duration, userPreferences.timeCommitment) * 20;
    }

    // Language preference
    maxScore += 10;
    if (userPreferences.languages?.includes(resource.language)) {
      score += 10;
    }

    // Certification preference
    maxScore += 10;
    if (userPreferences.certificationPreference && resource.type === 'certification') {
      score += 10;
    }

    return maxScore > 0 ? score / maxScore : 0.5;
  }

  /**
   * Get appropriate levels for skill progression
   */
  private getLevelsForProgression(
    currentLevel: string | undefined,
    targetLevel: string
  ): LearningResource['level'][] {
    const levelOrder = ['beginner', 'intermediate', 'advanced', 'expert'];
    const currentIndex = currentLevel ? levelOrder.indexOf(currentLevel) : -1;
    const targetIndex = levelOrder.indexOf(targetLevel);

    if (currentIndex === -1) {
      // No current level, start from beginner up to target
      return levelOrder.slice(0, targetIndex + 1) as LearningResource['level'][];
    }

    // Return levels from current to target
    return levelOrder.slice(currentIndex, targetIndex + 1) as LearningResource['level'][];
  }

  /**
   * Extract potential skill names from search query
   */
  private async extractSkillsFromQuery(query: string): Promise<string[]> {
    // Simple implementation - would use NLP in production
    const commonSkills = [
      'JavaScript', 'Python', 'Java', 'React', 'Angular', 'Vue', 'Node.js',
      'Docker', 'Kubernetes', 'AWS', 'Azure', 'SQL', 'MongoDB', 'PostgreSQL',
      'Machine Learning', 'Data Science', 'DevOps', 'Git', 'Linux'
    ];

    const queryLower = query.toLowerCase();
    return commonSkills.filter(skill => 
      queryLower.includes(skill.toLowerCase())
    );
  }

  /**
   * Remove duplicate resources based on URL and title similarity
   */
  private removeDuplicateResources(resources: LearningResource[]): LearningResource[] {
    const seen = new Set<string>();
    const unique: LearningResource[] = [];

    for (const resource of resources) {
      const key = `${resource.url}|${resource.title.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(resource);
      }
    }

    return unique;
  }

  /**
   * Generate cache key for resource queries
   */
  private generateCacheKey(
    providerName: string,
    skillNames: string[],
    filters: ResourceFilter
  ): string {
    const filterKey = JSON.stringify(filters);
    return `${providerName}:${skillNames.join(',')}:${filterKey}`;
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(cacheKey: string): boolean {
    const expiry = this.cacheExpiry.get(cacheKey);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Initialize learning resource providers
   */
  private initializeProviders(): void {
    // Coursera
    this.providers.set('coursera', {
      name: 'Coursera',
      baseUrl: 'https://api.coursera.org',
      rateLimit: 100,
      supportedTypes: ['course', 'certification'],
      searchCapabilities: {
        bySkill: true,
        byLevel: true,
        byDuration: true,
        byPrice: true,
        byRating: true
      }
    });

    // Udemy
    this.providers.set('udemy', {
      name: 'Udemy',
      baseUrl: 'https://www.udemy.com/api-2.0',
      rateLimit: 200,
      supportedTypes: ['course', 'tutorial'],
      searchCapabilities: {
        bySkill: true,
        byLevel: true,
        byDuration: true,
        byPrice: true,
        byRating: true
      }
    });

    // Pluralsight
    this.providers.set('pluralsight', {
      name: 'Pluralsight',
      baseUrl: 'https://app.pluralsight.com/api',
      rateLimit: 150,
      supportedTypes: ['course', 'tutorial', 'practice'],
      searchCapabilities: {
        bySkill: true,
        byLevel: true,
        byDuration: true,
        byPrice: false,
        byRating: true
      }
    });

    // YouTube (for free tutorials)
    this.providers.set('youtube', {
      name: 'YouTube',
      baseUrl: 'https://www.googleapis.com/youtube/v3',
      rateLimit: 10000,
      supportedTypes: ['video', 'tutorial'],
      searchCapabilities: {
        bySkill: true,
        byLevel: false,
        byDuration: true,
        byPrice: false,
        byRating: true
      }
    });

    // FreeCodeCamp
    this.providers.set('freecodecamp', {
      name: 'FreeCodeCamp',
      baseUrl: 'https://api.freecodecamp.org',
      rateLimit: 60,
      supportedTypes: ['course', 'tutorial', 'practice', 'certification'],
      searchCapabilities: {
        bySkill: true,
        byLevel: true,
        byDuration: false,
        byPrice: false,
        byRating: false
      }
    });
  }

  /**
   * Mock resource data for testing and development
   */
  private getMockResourcesForProvider(
    provider: ResourceProvider,
    skillNames: string[],
    filters: ResourceFilter
  ): LearningResource[] {
    const mockResources: LearningResource[] = [];

    for (const skillName of skillNames) {
      // Generate mock resources based on provider and skill
      const baseResources = this.generateMockResourcesForSkill(skillName, provider.name);
      mockResources.push(...baseResources);
    }

    return mockResources;
  }

  /**
   * Generate mock resources for a specific skill
   */
  private generateMockResourcesForSkill(skillName: string, providerName: string): LearningResource[] {
    const resources: LearningResource[] = [];
    const skill = skillName.toLowerCase();

    // Skip empty skill names
    if (!skillName || skillName.trim() === '') {
      return resources;
    }

    // Generate different types of resources based on skill
    if (providerName === 'Coursera') {
      resources.push({
        id: `coursera-${skill}-1`,
        title: `Complete ${skillName} Course`,
        description: `Comprehensive course covering all aspects of ${skillName}`,
        provider: 'Coursera',
        type: 'course',
        url: `https://coursera.org/learn/${skill}`,
        skillName,
        skillCategory: this.getSkillCategory(skillName),
        level: 'intermediate',
        duration: 40,
        rating: 4.6,
        reviewCount: 1250,
        price: 49,
        currency: 'USD',
        language: 'English',
        format: 'online',
        prerequisites: [],
        learningObjectives: [`Master ${skillName} fundamentals`, `Build real-world projects`],
        tags: [skillName.toLowerCase(), 'programming', 'development'],
        lastUpdated: new Date().toISOString(),
        popularity: 0.85
      });
    }

    if (providerName === 'Udemy') {
      resources.push({
        id: `udemy-${skill}-1`,
        title: `${skillName} for Beginners`,
        description: `Learn ${skillName} from scratch with hands-on projects`,
        provider: 'Udemy',
        type: 'course',
        url: `https://udemy.com/course/${skill}-beginners`,
        skillName,
        skillCategory: this.getSkillCategory(skillName),
        level: 'beginner',
        duration: 25,
        rating: 4.3,
        reviewCount: 890,
        price: 29.99,
        currency: 'USD',
        language: 'English',
        format: 'self-paced',
        prerequisites: [],
        learningObjectives: [`Understand ${skillName} basics`, `Create first project`],
        tags: [skillName.toLowerCase(), 'beginner', 'tutorial'],
        lastUpdated: new Date().toISOString(),
        popularity: 0.72
      });
    }

    if (providerName === 'YouTube') {
      resources.push({
        id: `youtube-${skill}-1`,
        title: `${skillName} Tutorial - Full Course`,
        description: `Free comprehensive tutorial on ${skillName}`,
        provider: 'YouTube',
        type: 'video',
        url: `https://youtube.com/watch?v=${skill}tutorial`,
        skillName,
        skillCategory: this.getSkillCategory(skillName),
        level: 'beginner',
        duration: 8,
        rating: 4.1,
        reviewCount: 2340,
        price: 0,
        currency: 'USD',
        language: 'English',
        format: 'online',
        prerequisites: [],
        learningObjectives: [`Learn ${skillName} basics`, `Follow along with examples`],
        tags: [skillName.toLowerCase(), 'free', 'tutorial', 'video'],
        lastUpdated: new Date().toISOString(),
        popularity: 0.91
      });
    }

    return resources;
  }

  /**
   * Mock search results for testing
   */
  private getMockSearchResults(
    provider: ResourceProvider,
    query: string,
    filters: ResourceFilter
  ): LearningResource[] {
    // Simple mock implementation
    const mockResults: LearningResource[] = [];
    
    // Generate some mock results based on query
    const querySkills = query.split(' ').filter(word => word.length > 2);
    
    for (const skill of querySkills.slice(0, 3)) {
      const resources = this.generateMockResourcesForSkill(skill, provider.name);
      mockResults.push(...resources);
    }

    return mockResults;
  }

  /**
   * Get skill category for mock data
   */
  private getSkillCategory(skillName: string): string {
    const skill = skillName.toLowerCase();
    
    if (skill.includes('javascript') || skill.includes('python') || skill.includes('java')) {
      return 'Programming';
    }
    
    if (skill.includes('react') || skill.includes('angular') || skill.includes('vue')) {
      return 'Frameworks & Libraries';
    }
    
    if (skill.includes('docker') || skill.includes('kubernetes') || skill.includes('aws')) {
      return 'Cloud & DevOps';
    }
    
    if (skill.includes('machine learning') || skill.includes('ai')) {
      return 'AI & Machine Learning';
    }
    
    return 'Technology';
  }
}