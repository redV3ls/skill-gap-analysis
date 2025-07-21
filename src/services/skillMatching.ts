import { logger } from '../utils/logger';
import { SkillsTaxonomyService } from '../db/skillsTaxonomy';
import { Database } from '../config/database';
import { JobSkillRequirement } from './jobAnalysis';

export interface UserSkill {
  skillId: string;
  skillName: string;
  skillCategory: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsExperience?: number;
  confidenceScore?: number;
  certifications?: string[];
}

// JobSkillRequirement is imported from jobAnalysis service

export interface SkillMatch {
  userSkill: UserSkill;
  jobRequirement: JobSkillRequirement;
  matchType: 'exact' | 'synonym' | 'transferable' | 'fuzzy';
  matchScore: number; // 0-1 scale
  levelGap: number; // Negative if user exceeds requirement, positive if gap exists
  experienceGap?: number; // Years gap if applicable
  confidence: number; // Overall confidence in this match
}

export interface TransferableSkill {
  fromSkill: UserSkill;
  toSkillName: string;
  toCategory: string;
  transferabilityScore: number; // 0-1 scale
  reasoning: string;
}

export interface SkillMatchingResult {
  matches: SkillMatch[];
  transferableSkills: TransferableSkill[];
  unmatchedUserSkills: UserSkill[];
  unmatchedJobRequirements: JobSkillRequirement[];
  overallMatchScore: number; // 0-1 scale
}

export class SkillMatchingService {
  private skillsTaxonomy: SkillsTaxonomyService;
  private transferabilityRules: Map<string, Map<string, number>> = new Map();
  private levelWeights: Map<string, number> = new Map();

  constructor(private db: Database) {
    this.skillsTaxonomy = new SkillsTaxonomyService(db);
    this.initializeTransferabilityRules();
    this.initializeLevelWeights();
  }

  /**
   * Main method to match user skills against job requirements
   */
  async matchSkills(
    userSkills: UserSkill[],
    jobRequirements: JobSkillRequirement[]
  ): Promise<SkillMatchingResult> {
    try {
      const matches: SkillMatch[] = [];
      const transferableSkills: TransferableSkill[] = [];
      const unmatchedUserSkills: UserSkill[] = [...userSkills];
      const unmatchedJobRequirements: JobSkillRequirement[] = [...jobRequirements];

      // Step 1: Find exact matches
      const exactMatches = await this.findExactMatches(userSkills, jobRequirements);
      matches.push(...exactMatches);
      this.removeMatchedItems(exactMatches, unmatchedUserSkills, unmatchedJobRequirements);

      // Step 2: Find synonym matches
      const synonymMatches = await this.findSynonymMatches(unmatchedUserSkills, unmatchedJobRequirements);
      matches.push(...synonymMatches);
      this.removeMatchedItems(synonymMatches, unmatchedUserSkills, unmatchedJobRequirements);

      // Step 3: Find fuzzy matches
      const fuzzyMatches = await this.findFuzzyMatches(unmatchedUserSkills, unmatchedJobRequirements);
      matches.push(...fuzzyMatches);
      this.removeMatchedItems(fuzzyMatches, unmatchedUserSkills, unmatchedJobRequirements);

      // Step 4: Identify transferable skills
      const transferable = this.identifyTransferableSkills(unmatchedUserSkills, unmatchedJobRequirements);
      transferableSkills.push(...transferable);

      // Step 5: Calculate overall match score
      const overallMatchScore = this.calculateOverallMatchScore(matches, jobRequirements);

      return {
        matches,
        transferableSkills,
        unmatchedUserSkills,
        unmatchedJobRequirements,
        overallMatchScore
      };
    } catch (error) {
      logger.error('Error in skill matching:', error);
      throw new Error(`Skill matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find exact skill name matches
   */
  private async findExactMatches(
    userSkills: UserSkill[],
    jobRequirements: JobSkillRequirement[]
  ): Promise<SkillMatch[]> {
    const matches: SkillMatch[] = [];

    for (const userSkill of userSkills) {
      for (const jobReq of jobRequirements) {
        if (this.normalizeSkillName(userSkill.skillName) === this.normalizeSkillName(jobReq.skill)) {
          const match = this.createSkillMatch(userSkill, jobReq, 'exact');
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Find matches through skill synonyms
   */
  private async findSynonymMatches(
    userSkills: UserSkill[],
    jobRequirements: JobSkillRequirement[]
  ): Promise<SkillMatch[]> {
    const matches: SkillMatch[] = [];

    for (const userSkill of userSkills) {
      // Get synonyms for user skill
      const userSkillSynonyms = await this.getSkillSynonyms(userSkill.skillName);
      
      for (const jobReq of jobRequirements) {
        // Check if job requirement matches any synonym
        const normalizedJobSkill = this.normalizeSkillName(jobReq.skill);
        
        if (userSkillSynonyms.some(synonym => 
          this.normalizeSkillName(synonym) === normalizedJobSkill
        )) {
          const match = this.createSkillMatch(userSkill, jobReq, 'synonym');
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Find fuzzy matches using string similarity
   */
  private async findFuzzyMatches(
    userSkills: UserSkill[],
    jobRequirements: JobSkillRequirement[],
    threshold: number = 0.7
  ): Promise<SkillMatch[]> {
    const matches: SkillMatch[] = [];

    for (const userSkill of userSkills) {
      for (const jobReq of jobRequirements) {
        const similarity = this.calculateStringSimilarity(
          userSkill.skillName,
          jobReq.skill
        );

        if (similarity >= threshold) {
          const match = this.createSkillMatch(userSkill, jobReq, 'fuzzy');
          // Adjust match score based on string similarity
          match.matchScore *= similarity;
          match.confidence *= similarity;
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Identify transferable skills based on category relationships
   */
  private identifyTransferableSkills(
    userSkills: UserSkill[],
    jobRequirements: JobSkillRequirement[]
  ): TransferableSkill[] {
    const transferableSkills: TransferableSkill[] = [];

    for (const userSkill of userSkills) {
      for (const jobReq of jobRequirements) {
        const transferabilityScore = this.calculateTransferabilityScore(
          userSkill.skillCategory,
          jobReq.category,
          userSkill.skillName,
          jobReq.skill
        );

        if (transferabilityScore > 0.3) { // Minimum threshold for transferability
          transferableSkills.push({
            fromSkill: userSkill,
            toSkillName: jobReq.skill,
            toCategory: jobReq.category,
            transferabilityScore,
            reasoning: this.generateTransferabilityReasoning(userSkill, jobReq, transferabilityScore)
          });
        }
      }
    }

    // Sort by transferability score
    return transferableSkills.sort((a, b) => b.transferabilityScore - a.transferabilityScore);
  }

  /**
   * Create a skill match object with calculated scores
   */
  private createSkillMatch(
    userSkill: UserSkill,
    jobRequirement: JobSkillRequirement,
    matchType: 'exact' | 'synonym' | 'transferable' | 'fuzzy'
  ): SkillMatch {
    const levelGap = this.calculateLevelGap(userSkill.level, jobRequirement.minimumLevel);
    const experienceGap = this.calculateExperienceGap(
      userSkill.yearsExperience,
      jobRequirement.yearsRequired
    );
    
    const matchScore = this.calculateMatchScore(
      matchType,
      levelGap,
      experienceGap,
      userSkill.confidenceScore || 0.5,
      jobRequirement.confidence
    );

    const confidence = this.calculateMatchConfidence(
      matchType,
      userSkill.confidenceScore || 0.5,
      jobRequirement.confidence
    );

    return {
      userSkill,
      jobRequirement,
      matchType,
      matchScore,
      levelGap,
      experienceGap,
      confidence
    };
  }

  /**
   * Calculate the gap between user skill level and required level
   */
  private calculateLevelGap(
    userLevel: string,
    requiredLevel: string
  ): number {
    const userWeight = this.levelWeights.get(userLevel) || 0;
    const requiredWeight = this.levelWeights.get(requiredLevel) || 0;
    
    return requiredWeight - userWeight; // Positive means gap, negative means exceeds
  }

  /**
   * Calculate experience gap in years
   */
  private calculateExperienceGap(
    userExperience?: number,
    requiredExperience?: number
  ): number | undefined {
    if (userExperience === undefined || requiredExperience === undefined) {
      return undefined;
    }
    
    return Math.max(0, requiredExperience - userExperience);
  }

  /**
   * Calculate overall match score for a skill pair
   */
  private calculateMatchScore(
    matchType: string,
    levelGap: number,
    experienceGap: number | undefined,
    userConfidence: number,
    jobConfidence: number
  ): number {
    let baseScore = 1.0;

    // Adjust base score by match type
    switch (matchType) {
      case 'exact':
        baseScore = 1.0;
        break;
      case 'synonym':
        baseScore = 0.9;
        break;
      case 'fuzzy':
        baseScore = 0.8;
        break;
      case 'transferable':
        baseScore = 0.6;
        break;
    }

    // Penalize for level gaps
    if (levelGap > 0) {
      baseScore *= Math.max(0.3, 1 - (levelGap * 0.2));
    } else if (levelGap < 0) {
      // Bonus for exceeding requirements (but cap it)
      baseScore = Math.min(1.0, baseScore * (1 + Math.abs(levelGap) * 0.1));
    }

    // Penalize for experience gaps
    if (experienceGap !== undefined && experienceGap > 0) {
      const experiencePenalty = Math.min(0.5, experienceGap * 0.1);
      baseScore *= (1 - experiencePenalty);
    }

    // Factor in confidence scores
    const avgConfidence = (userConfidence + jobConfidence) / 2;
    baseScore *= avgConfidence;

    return Math.max(0, Math.min(1, baseScore));
  }

  /**
   * Calculate confidence in the match
   */
  private calculateMatchConfidence(
    matchType: string,
    userConfidence: number,
    jobConfidence: number
  ): number {
    let baseConfidence = (userConfidence + jobConfidence) / 2;

    // Adjust by match type
    switch (matchType) {
      case 'exact':
        baseConfidence *= 1.0;
        break;
      case 'synonym':
        baseConfidence *= 0.9;
        break;
      case 'fuzzy':
        baseConfidence *= 0.7;
        break;
      case 'transferable':
        baseConfidence *= 0.5;
        break;
    }

    return Math.max(0, Math.min(1, baseConfidence));
  }

  /**
   * Calculate transferability score between skill categories
   */
  private calculateTransferabilityScore(
    fromCategory: string,
    toCategory: string,
    fromSkill: string,
    toSkill: string
  ): number {
    // Same category has high transferability
    if (fromCategory === toCategory) {
      return 0.8;
    }

    // Check predefined transferability rules
    const categoryRules = this.transferabilityRules.get(fromCategory);
    if (categoryRules && categoryRules.has(toCategory)) {
      return categoryRules.get(toCategory) || 0;
    }

    // Check for specific skill transferability patterns
    return this.calculateSpecificSkillTransferability(fromSkill, toSkill);
  }

  /**
   * Calculate transferability for specific skill pairs
   */
  private calculateSpecificSkillTransferability(fromSkill: string, toSkill: string): number {
    const from = fromSkill.toLowerCase();
    const to = toSkill.toLowerCase();

    // Programming language transferability
    const programmingLanguages = ['javascript', 'python', 'java', 'c++', 'c#', 'go', 'rust'];
    if (programmingLanguages.some(lang => from.includes(lang)) && 
        programmingLanguages.some(lang => to.includes(lang))) {
      return 0.6;
    }

    // Framework transferability within same ecosystem
    const jsFrameworks = ['react', 'angular', 'vue'];
    if (jsFrameworks.some(fw => from.includes(fw)) && 
        jsFrameworks.some(fw => to.includes(fw))) {
      return 0.7;
    }

    // Database transferability
    const databases = ['mysql', 'postgresql', 'mongodb', 'redis'];
    if (databases.some(db => from.includes(db)) && 
        databases.some(db => to.includes(db))) {
      return 0.5;
    }

    // Cloud platform transferability
    const cloudPlatforms = ['aws', 'azure', 'gcp', 'google cloud'];
    if (cloudPlatforms.some(cloud => from.includes(cloud)) && 
        cloudPlatforms.some(cloud => to.includes(cloud))) {
      return 0.6;
    }

    return 0.1; // Minimal transferability for unrelated skills
  }

  /**
   * Generate reasoning text for transferable skills
   */
  private generateTransferabilityReasoning(
    userSkill: UserSkill,
    jobReq: JobSkillRequirement,
    score: number
  ): string {
    if (userSkill.skillCategory === jobReq.category) {
      return `Both skills are in the ${userSkill.skillCategory} category, making knowledge transfer highly likely.`;
    }

    if (score > 0.6) {
      return `Strong transferability due to similar technical concepts and methodologies.`;
    } else if (score > 0.4) {
      return `Moderate transferability - some foundational knowledge applies.`;
    } else {
      return `Limited transferability - would require significant additional learning.`;
    }
  }

  /**
   * Calculate overall match score for the entire skill set
   */
  private calculateOverallMatchScore(
    matches: SkillMatch[],
    jobRequirements: JobSkillRequirement[]
  ): number {
    if (jobRequirements.length === 0) return 1.0;

    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Weight by importance
    const importanceWeights = {
      'critical': 3,
      'important': 2,
      'nice-to-have': 1
    };

    for (const jobReq of jobRequirements) {
      const weight = importanceWeights[jobReq.importance];
      const match = matches.find(m => m.jobRequirement === jobReq);
      
      if (match) {
        totalWeightedScore += match.matchScore * weight;
      }
      // If no match, score is 0 for this requirement
      
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  }

  /**
   * Get synonyms for a skill name
   */
  private async getSkillSynonyms(skillName: string): Promise<string[]> {
    try {
      // First normalize the skill name to find it in our database
      const normalizedSkills = await this.skillsTaxonomy.normalizeSkillNames({
        skillNames: [skillName],
        fuzzyMatch: true,
        createMissing: false
      });

      if (normalizedSkills.length > 0 && normalizedSkills[0].skillId) {
        const skillWithSynonyms = await this.skillsTaxonomy.getSkill(normalizedSkills[0].skillId);
        if (skillWithSynonyms && skillWithSynonyms.synonyms) {
          return skillWithSynonyms.synonyms.map(s => s.name);
        }
      }

      return [];
    } catch (error) {
      logger.warn(`Could not fetch synonyms for skill: ${skillName}`, error);
      return [];
    }
  }

  /**
   * Calculate string similarity using Jaro-Winkler algorithm
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    // Simple implementation - can be enhanced with more sophisticated algorithms
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(s1, s2);
    return 1 - (distance / Math.max(s1.length, s2.length));
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Normalize skill name for comparison
   */
  private normalizeSkillName(skillName: string): string {
    return skillName.toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Remove matched items from unmatched lists
   */
  private removeMatchedItems(
    matches: SkillMatch[],
    unmatchedUserSkills: UserSkill[],
    unmatchedJobRequirements: JobSkillRequirement[]
  ): void {
    for (const match of matches) {
      const userIndex = unmatchedUserSkills.findIndex(skill => skill === match.userSkill);
      if (userIndex !== -1) {
        unmatchedUserSkills.splice(userIndex, 1);
      }

      const jobIndex = unmatchedJobRequirements.findIndex(req => req === match.jobRequirement);
      if (jobIndex !== -1) {
        unmatchedJobRequirements.splice(jobIndex, 1);
      }
    }
  }

  /**
   * Initialize transferability rules between skill categories
   */
  private initializeTransferabilityRules(): void {
    this.transferabilityRules = new Map([
      ['Programming', new Map([
        ['Frameworks & Libraries', 0.8],
        ['Web Development', 0.7],
        ['Mobile Development', 0.6],
        ['Data Science & Analytics', 0.5],
        ['AI & Machine Learning', 0.5],
        ['Testing & QA', 0.6],
        ['Cloud & DevOps', 0.5]
      ])],
      ['Frameworks & Libraries', new Map([
        ['Programming', 0.7],
        ['Web Development', 0.9],
        ['Mobile Development', 0.6],
        ['Testing & QA', 0.5]
      ])],
      ['Databases', new Map([
        ['Data Science & Analytics', 0.7],
        ['Cloud & DevOps', 0.6],
        ['Programming', 0.5]
      ])],
      ['Cloud & DevOps', new Map([
        ['Networking', 0.7],
        ['Security', 0.6],
        ['Databases', 0.5],
        ['Programming', 0.4]
      ])],
      ['Web Development', new Map([
        ['Mobile Development', 0.6],
        ['Frameworks & Libraries', 0.8],
        ['Programming', 0.7],
        ['Design & UX', 0.4]
      ])],
      ['Data Science & Analytics', new Map([
        ['AI & Machine Learning', 0.8],
        ['Programming', 0.6],
        ['Databases', 0.7]
      ])],
      ['AI & Machine Learning', new Map([
        ['Data Science & Analytics', 0.9],
        ['Programming', 0.7]
      ])]
    ]);
  }

  /**
   * Initialize skill level weights for gap calculation
   */
  private initializeLevelWeights(): void {
    this.levelWeights = new Map([
      ['beginner', 1],
      ['intermediate', 2],
      ['advanced', 3],
      ['expert', 4]
    ]);
  }
}