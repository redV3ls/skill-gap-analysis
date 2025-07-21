import { logger } from '../utils/logger';
import { SkillMatchingService, SkillMatchingResult, SkillMatch, UserSkill, TransferableSkill } from './skillMatching';
import { JobSkillRequirement } from './jobAnalysis';

export interface SkillGap {
  skillName: string;
  category: string;
  currentLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  requiredLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  importance: 'critical' | 'important' | 'nice-to-have';
  gapSeverity: 'critical' | 'moderate' | 'minor';
  levelGap: number; // Number of levels to bridge
  experienceGap?: number; // Years of experience gap
  timeToCompetency: number; // Estimated months to reach competency
  learningDifficulty: 'easy' | 'moderate' | 'hard' | 'very-hard';
  priority: number; // 1-10 scale, 10 being highest priority
  confidence: number; // Confidence in the gap assessment
}

export interface GapAnalysisResult {
  overallMatchPercentage: number; // 0-100 scale
  skillGaps: SkillGap[];
  strengths: UserSkill[]; // Skills where user exceeds requirements
  criticalGaps: SkillGap[]; // High-priority gaps that need immediate attention
  quickWins: SkillGap[]; // Easy gaps to close quickly
  longTermGoals: SkillGap[]; // Complex skills requiring significant time investment
  transferableOpportunities: TransferableSkill[]; // Skills that can be leveraged
  recommendations: {
    immediate: string[]; // Actions to take immediately
    shortTerm: string[]; // Actions for next 3-6 months
    longTerm: string[]; // Actions for 6+ months
  };
  metadata: {
    totalSkillsAnalyzed: number;
    gapsIdentified: number;
    strengthsIdentified: number;
    analysisConfidence: number;
    processingTime: number;
  };
}

export class GapAnalysisService {
  private skillMatching: SkillMatchingService;
  private difficultyWeights: Map<string, number> = new Map();
  private timeToCompetencyBase: Map<string, number> = new Map();

  constructor(skillMatchingService: SkillMatchingService) {
    this.skillMatching = skillMatchingService;
    this.initializeDifficultyWeights();
    this.initializeTimeToCompetencyBase();
  }

  /**
   * Perform comprehensive gap analysis
   */
  async analyzeGaps(
    userSkills: UserSkill[],
    jobRequirements: JobSkillRequirement[]
  ): Promise<GapAnalysisResult> {
    const startTime = Date.now();

    try {
      // Step 1: Get skill matching results
      const matchingResult = await this.skillMatching.matchSkills(userSkills, jobRequirements);

      // Step 2: Calculate overall match percentage
      const overallMatchPercentage = Math.round(matchingResult.overallMatchScore * 100);

      // Step 3: Identify skill gaps
      const skillGaps = this.identifySkillGaps(matchingResult, jobRequirements);

      // Step 4: Identify strengths (where user exceeds requirements)
      const strengths = this.identifyStrengths(matchingResult.matches);

      // Step 5: Prioritize and categorize gaps
      const prioritizedGaps = this.prioritizeGaps(skillGaps);
      const { criticalGaps, quickWins, longTermGoals } = this.categorizeGaps(prioritizedGaps);

      // Step 6: Generate recommendations
      const recommendations = this.generateRecommendations(
        criticalGaps,
        quickWins,
        longTermGoals,
        matchingResult.transferableSkills
      );

      // Step 7: Calculate metadata
      const processingTime = Date.now() - startTime;
      const analysisConfidence = this.calculateAnalysisConfidence(matchingResult, skillGaps);

      return {
        overallMatchPercentage,
        skillGaps: prioritizedGaps,
        strengths,
        criticalGaps,
        quickWins,
        longTermGoals,
        transferableOpportunities: matchingResult.transferableSkills,
        recommendations,
        metadata: {
          totalSkillsAnalyzed: userSkills.length + jobRequirements.length,
          gapsIdentified: skillGaps.length,
          strengthsIdentified: strengths.length,
          analysisConfidence,
          processingTime
        }
      };
    } catch (error) {
      logger.error('Error in gap analysis:', error);
      throw new Error(`Gap analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Identify skill gaps from matching results
   */
  private identifySkillGaps(
    matchingResult: SkillMatchingResult,
    jobRequirements: JobSkillRequirement[]
  ): SkillGap[] {
    const gaps: SkillGap[] = [];

    // Process matched skills with gaps
    for (const match of matchingResult.matches) {
      if (match.levelGap > 0 || (match.experienceGap && match.experienceGap > 0)) {
        const gap = this.createSkillGap(match);
        gaps.push(gap);
      }
    }

    // Process completely unmatched job requirements
    for (const unmatchedReq of matchingResult.unmatchedJobRequirements) {
      const gap = this.createSkillGapFromRequirement(unmatchedReq);
      gaps.push(gap);
    }

    return gaps;
  }

  /**
   * Create skill gap from a matched skill with deficiencies
   */
  private createSkillGap(match: SkillMatch): SkillGap {
    const levelGap = Math.max(0, match.levelGap);
    const experienceGap = match.experienceGap && match.experienceGap > 0 ? match.experienceGap : undefined;
    
    const gapSeverity = this.calculateGapSeverity(
      match.jobRequirement.importance,
      levelGap,
      experienceGap
    );

    const learningDifficulty = this.calculateLearningDifficulty(
      match.jobRequirement.category,
      match.jobRequirement.skill,
      levelGap
    );

    const timeToCompetency = this.calculateTimeToCompetency(
      match.jobRequirement.category,
      match.jobRequirement.skill,
      levelGap,
      experienceGap,
      match.userSkill.level
    );

    const priority = this.calculatePriority(
      match.jobRequirement.importance,
      gapSeverity,
      learningDifficulty,
      timeToCompetency
    );

    return {
      skillName: match.jobRequirement.skill,
      category: match.jobRequirement.category,
      currentLevel: match.userSkill.level,
      requiredLevel: match.jobRequirement.minimumLevel,
      importance: match.jobRequirement.importance,
      gapSeverity,
      levelGap,
      experienceGap,
      timeToCompetency,
      learningDifficulty,
      priority,
      confidence: match.confidence
    };
  }

  /**
   * Create skill gap from completely missing requirement
   */
  private createSkillGapFromRequirement(requirement: JobSkillRequirement): SkillGap {
    const levelGap = this.getLevelWeight(requirement.minimumLevel);
    const experienceGap = requirement.yearsRequired;

    const gapSeverity = this.calculateGapSeverity(
      requirement.importance,
      levelGap,
      experienceGap
    );

    const learningDifficulty = this.calculateLearningDifficulty(
      requirement.category,
      requirement.skill,
      levelGap
    );

    const timeToCompetency = this.calculateTimeToCompetency(
      requirement.category,
      requirement.skill,
      levelGap,
      experienceGap
    );

    const priority = this.calculatePriority(
      requirement.importance,
      gapSeverity,
      learningDifficulty,
      timeToCompetency
    );

    return {
      skillName: requirement.skill,
      category: requirement.category,
      currentLevel: undefined, // User doesn't have this skill
      requiredLevel: requirement.minimumLevel,
      importance: requirement.importance,
      gapSeverity,
      levelGap,
      experienceGap,
      timeToCompetency,
      learningDifficulty,
      priority,
      confidence: requirement.confidence
    };
  }

  /**
   * Calculate gap severity based on importance and gap size
   */
  private calculateGapSeverity(
    importance: 'critical' | 'important' | 'nice-to-have',
    levelGap: number,
    experienceGap?: number
  ): 'critical' | 'moderate' | 'minor' {
    // Critical importance always results in at least moderate severity
    if (importance === 'critical') {
      return levelGap >= 2 || (experienceGap && experienceGap >= 3) ? 'critical' : 'moderate';
    }

    // Important skills
    if (importance === 'important') {
      if (levelGap >= 3 || (experienceGap && experienceGap >= 5)) {
        return 'critical';
      }
      if (levelGap >= 2 || (experienceGap && experienceGap >= 2)) {
        return 'moderate';
      }
      return 'minor';
    }

    // Nice-to-have skills
    if (levelGap >= 3 || (experienceGap && experienceGap >= 5)) {
      return 'moderate';
    }
    return 'minor';
  }

  /**
   * Calculate learning difficulty for a skill
   */
  private calculateLearningDifficulty(
    category: string,
    skillName: string,
    levelGap: number
  ): 'easy' | 'moderate' | 'hard' | 'very-hard' {
    const baseDifficulty = this.difficultyWeights.get(category) || 0.5;
    const skillSpecificDifficulty = this.getSkillSpecificDifficulty(skillName);
    
    // Combine base difficulty with skill-specific and level gap factors
    const totalDifficulty = (baseDifficulty + skillSpecificDifficulty) / 2 + (levelGap * 0.1);

    if (totalDifficulty >= 0.8) return 'very-hard';
    if (totalDifficulty >= 0.6) return 'hard';
    if (totalDifficulty >= 0.4) return 'moderate';
    return 'easy';
  }

  /**
   * Get skill-specific difficulty multiplier
   */
  private getSkillSpecificDifficulty(skillName: string): number {
    const skill = skillName.toLowerCase();

    // Very hard skills
    if (skill.includes('machine learning') || skill.includes('ai') || 
        skill.includes('blockchain') || skill.includes('quantum')) {
      return 0.9;
    }

    // Hard skills
    if (skill.includes('kubernetes') || skill.includes('terraform') || 
        skill.includes('rust') || skill.includes('assembly')) {
      return 0.7;
    }

    // Moderate skills
    if (skill.includes('react') || skill.includes('angular') || 
        skill.includes('python') || skill.includes('java')) {
      return 0.5;
    }

    // Easy skills
    if (skill.includes('html') || skill.includes('css') || 
        skill.includes('git') || skill.includes('agile')) {
      return 0.3;
    }

    return 0.5; // Default moderate difficulty
  }

  /**
   * Calculate estimated time to reach competency
   */
  private calculateTimeToCompetency(
    category: string,
    skillName: string,
    levelGap: number,
    experienceGap?: number,
    currentLevel?: string
  ): number {
    const baseTime = this.timeToCompetencyBase.get(category) || 6; // months
    const skillSpecificMultiplier = this.getSkillTimeMultiplier(skillName);
    
    // Calculate time based on level gap
    let timeForLevels = baseTime * levelGap * skillSpecificMultiplier;
    
    // If user has no current level, add extra time for fundamentals
    if (!currentLevel) {
      timeForLevels += baseTime * 0.5;
    }

    // Add time for experience gap (assuming 6 months per year of experience)
    const timeForExperience = experienceGap ? experienceGap * 6 : 0;

    // Take the maximum of level-based and experience-based time
    const totalTime = Math.max(timeForLevels, timeForExperience);

    // Apply learning efficiency factors
    return Math.round(Math.max(1, totalTime)); // Minimum 1 month
  }

  /**
   * Get skill-specific time multiplier
   */
  private getSkillTimeMultiplier(skillName: string): number {
    const skill = skillName.toLowerCase();

    // Skills that take longer to master
    if (skill.includes('machine learning') || skill.includes('ai') || 
        skill.includes('data science') || skill.includes('blockchain')) {
      return 1.5;
    }

    // Complex frameworks and platforms
    if (skill.includes('kubernetes') || skill.includes('aws') || 
        skill.includes('azure') || skill.includes('terraform')) {
      return 1.3;
    }

    // Standard programming skills
    if (skill.includes('programming') || skill.includes('development')) {
      return 1.0;
    }

    // Tools and simpler skills
    if (skill.includes('git') || skill.includes('agile') || 
        skill.includes('project management')) {
      return 0.7;
    }

    return 1.0; // Default multiplier
  }

  /**
   * Calculate priority score for a skill gap
   */
  private calculatePriority(
    importance: 'critical' | 'important' | 'nice-to-have',
    severity: 'critical' | 'moderate' | 'minor',
    difficulty: 'easy' | 'moderate' | 'hard' | 'very-hard',
    timeToCompetency: number
  ): number {
    // Base priority from importance
    const importanceScore = {
      'critical': 8,
      'important': 6,
      'nice-to-have': 3
    }[importance];

    // Severity modifier
    const severityModifier = {
      'critical': 2,
      'moderate': 1,
      'minor': 0
    }[severity];

    // Difficulty penalty (easier skills get higher priority for quick wins)
    const difficultyPenalty = {
      'easy': 0,
      'moderate': -0.5,
      'hard': -1,
      'very-hard': -1.5
    }[difficulty];

    // Time penalty (quicker skills get slight priority boost)
    const timePenalty = Math.min(2, timeToCompetency / 6); // Penalty increases with time

    const priority = importanceScore + severityModifier + difficultyPenalty - timePenalty;
    
    // Ensure priority is between 1 and 10
    return Math.max(1, Math.min(10, Math.round(priority)));
  }

  /**
   * Identify user strengths (skills where they exceed requirements)
   */
  private identifyStrengths(matches: SkillMatch[]): UserSkill[] {
    return matches
      .filter(match => match.levelGap < 0) // User exceeds requirement
      .map(match => match.userSkill)
      .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  }

  /**
   * Prioritize gaps by priority score
   */
  private prioritizeGaps(gaps: SkillGap[]): SkillGap[] {
    return gaps.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Categorize gaps into critical, quick wins, and long-term goals
   */
  private categorizeGaps(gaps: SkillGap[]): {
    criticalGaps: SkillGap[];
    quickWins: SkillGap[];
    longTermGoals: SkillGap[];
  } {
    const criticalGaps = gaps.filter(gap => 
      gap.gapSeverity === 'critical' || gap.importance === 'critical'
    );

    const quickWins = gaps.filter(gap => 
      gap.learningDifficulty === 'easy' && 
      gap.timeToCompetency <= 3 &&
      gap.gapSeverity !== 'critical'
    );

    const longTermGoals = gaps.filter(gap => 
      gap.timeToCompetency > 6 || 
      gap.learningDifficulty === 'very-hard'
    );

    return { criticalGaps, quickWins, longTermGoals };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    criticalGaps: SkillGap[],
    quickWins: SkillGap[],
    longTermGoals: SkillGap[],
    transferableSkills: TransferableSkill[]
  ): {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  } {
    const immediate: string[] = [];
    const shortTerm: string[] = [];
    const longTerm: string[] = [];

    // Immediate actions (critical gaps and quick wins)
    if (criticalGaps.length > 0) {
      const topCritical = criticalGaps.slice(0, 3);
      immediate.push(
        `Focus immediately on critical skills: ${topCritical.map(g => g.skillName).join(', ')}`
      );
    }

    if (quickWins.length > 0) {
      const topQuickWins = quickWins.slice(0, 2);
      immediate.push(
        `Start with quick wins to build momentum: ${topQuickWins.map(g => g.skillName).join(', ')}`
      );
    }

    // Leverage transferable skills
    if (transferableSkills.length > 0) {
      const topTransferable = transferableSkills.slice(0, 2);
      immediate.push(
        `Leverage existing skills: Use your ${topTransferable.map(t => t.fromSkill.skillName).join(', ')} experience to learn ${topTransferable.map(t => t.toSkillName).join(', ')}`
      );
    }

    // Short-term actions (3-6 months)
    const mediumPriorityGaps = criticalGaps.concat(quickWins)
      .filter(gap => gap.timeToCompetency <= 6)
      .slice(0, 5);

    if (mediumPriorityGaps.length > 0) {
      shortTerm.push(
        `Develop intermediate skills over next 3-6 months: ${mediumPriorityGaps.map(g => g.skillName).join(', ')}`
      );
    }

    // Long-term actions (6+ months)
    if (longTermGoals.length > 0) {
      const topLongTerm = longTermGoals.slice(0, 3);
      longTerm.push(
        `Plan long-term skill development: ${topLongTerm.map(g => g.skillName).join(', ')}`
      );
    }

    // Add specific learning recommendations
    this.addSpecificLearningRecommendations(criticalGaps, quickWins, immediate, shortTerm);

    return { immediate, shortTerm, longTerm };
  }

  /**
   * Add specific learning recommendations based on skill types
   */
  private addSpecificLearningRecommendations(
    criticalGaps: SkillGap[],
    quickWins: SkillGap[],
    immediate: string[],
    shortTerm: string[]
  ): void {
    const programmingGaps = criticalGaps.concat(quickWins)
      .filter(gap => gap.category === 'Programming');
    
    if (programmingGaps.length > 0) {
      immediate.push('Consider hands-on coding bootcamps or intensive courses for programming skills');
    }

    const cloudGaps = criticalGaps.concat(quickWins)
      .filter(gap => gap.category === 'Cloud & DevOps');
    
    if (cloudGaps.length > 0) {
      shortTerm.push('Pursue cloud certifications (AWS, Azure, GCP) for credibility in cloud technologies');
    }

    const frameworkGaps = criticalGaps.concat(quickWins)
      .filter(gap => gap.category === 'Frameworks & Libraries');
    
    if (frameworkGaps.length > 0) {
      immediate.push('Build practical projects using the required frameworks to gain hands-on experience');
    }
  }

  /**
   * Calculate overall confidence in the analysis
   */
  private calculateAnalysisConfidence(
    matchingResult: SkillMatchingResult,
    gaps: SkillGap[]
  ): number {
    if (gaps.length === 0) return 1.0;

    // Average confidence from all matches and gaps
    const matchConfidences = matchingResult.matches.map(m => m.confidence);
    const gapConfidences = gaps.map(g => g.confidence);
    
    const allConfidences = matchConfidences.concat(gapConfidences);
    const avgConfidence = allConfidences.reduce((sum, conf) => sum + conf, 0) / allConfidences.length;

    // Factor in data completeness
    const dataCompletenessScore = this.calculateDataCompletenessScore(matchingResult);
    
    return Math.min(1.0, avgConfidence * dataCompletenessScore);
  }

  /**
   * Calculate data completeness score
   */
  private calculateDataCompletenessScore(matchingResult: SkillMatchingResult): number {
    const totalSkills = matchingResult.matches.length + 
                       matchingResult.unmatchedUserSkills.length + 
                       matchingResult.unmatchedJobRequirements.length;
    
    if (totalSkills === 0) return 1.0;

    // Higher score when we have more matches (better data quality)
    const matchRatio = matchingResult.matches.length / totalSkills;
    return 0.7 + (matchRatio * 0.3); // Base 70% + up to 30% based on match ratio
  }

  /**
   * Get numeric weight for skill level
   */
  private getLevelWeight(level: string): number {
    const weights = {
      'beginner': 1,
      'intermediate': 2,
      'advanced': 3,
      'expert': 4
    };
    return weights[level as keyof typeof weights] || 1;
  }

  /**
   * Initialize difficulty weights for different skill categories
   */
  private initializeDifficultyWeights(): void {
    this.difficultyWeights = new Map([
      ['Programming', 0.6],
      ['Frameworks & Libraries', 0.5],
      ['Databases', 0.4],
      ['Cloud & DevOps', 0.7],
      ['AI & Machine Learning', 0.9],
      ['Data Science & Analytics', 0.8],
      ['Security', 0.7],
      ['Mobile Development', 0.6],
      ['Web Development', 0.4],
      ['Design & UX', 0.5],
      ['Project Management', 0.3],
      ['Soft Skills', 0.2],
      ['Tools & Software', 0.3],
      ['Testing & QA', 0.4],
      ['Networking', 0.6],
      ['Hardware', 0.8]
    ]);
  }

  /**
   * Initialize base time to competency for different categories (in months)
   */
  private initializeTimeToCompetencyBase(): void {
    this.timeToCompetencyBase = new Map([
      ['Programming', 8],
      ['Frameworks & Libraries', 4],
      ['Databases', 6],
      ['Cloud & DevOps', 10],
      ['AI & Machine Learning', 12],
      ['Data Science & Analytics', 10],
      ['Security', 8],
      ['Mobile Development', 6],
      ['Web Development', 4],
      ['Design & UX', 6],
      ['Project Management', 3],
      ['Soft Skills', 2],
      ['Tools & Software', 3],
      ['Testing & QA', 4],
      ['Networking', 8],
      ['Hardware', 10]
    ]);
  }
}