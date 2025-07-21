import { logger } from '../utils/logger';
import { SkillGap } from './gapAnalysis';
import { UserSkill, TransferableSkill } from './skillMatching';
import { SkillsTaxonomyService } from '../db/skillsTaxonomy';
import { Database } from '../config/database';

export interface SkillDependency {
  skillName: string;
  category: string;
  prerequisites: string[]; // Skills that must be learned first
  dependents: string[]; // Skills that depend on this one
  difficulty: 'easy' | 'moderate' | 'hard' | 'very-hard';
  estimatedHours: number; // Time to learn this skill
  confidence: number; // Confidence in dependency mapping
}

export interface LearningStep {
  skillName: string;
  category: string;
  currentLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  targetLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  priority: number; // 1-10 scale
  estimatedHours: number;
  prerequisites: string[]; // Skills that must be completed first
  learningObjectives: string[];
  milestones: string[];
  difficulty: 'easy' | 'moderate' | 'hard' | 'very-hard';
  reasoning: string; // Why this step is important
}

export interface LearningPath {
  pathId: string;
  title: string;
  description: string;
  totalEstimatedHours: number;
  estimatedCompletionWeeks: number;
  difficulty: 'easy' | 'moderate' | 'hard' | 'very-hard';
  steps: LearningStep[];
  parallelTracks: LearningStep[][]; // Steps that can be done in parallel
  criticalPath: string[]; // Skill names in critical path order
  metadata: {
    totalSkills: number;
    prerequisitesMet: number;
    confidenceScore: number;
    lastUpdated: string;
  };
}

export interface LearningPathOptions {
  timeCommitmentHours?: number; // Hours per week available
  learningStyle?: 'visual' | 'auditory' | 'kinesthetic' | 'mixed';
  prioritizeQuickWins?: boolean;
  includeTransferableSkills?: boolean;
  maxPathLength?: number; // Maximum number of steps
  difficultyPreference?: 'easy-first' | 'hard-first' | 'balanced';
}

export class LearningPathGenerationService {
  private skillsTaxonomy: SkillsTaxonomyService;
  private skillDependencies: Map<string, SkillDependency> = new Map();
  private categoryDependencies: Map<string, string[]> = new Map();

  constructor(private db: Database) {
    this.skillsTaxonomy = new SkillsTaxonomyService(db);
    this.initializeSkillDependencies();
    this.initializeCategoryDependencies();
  }

  /**
   * Generate optimized learning path from skill gaps
   */
  async generateLearningPath(
    skillGaps: SkillGap[],
    userSkills: UserSkill[],
    transferableSkills: TransferableSkill[] = [],
    options: LearningPathOptions = {}
  ): Promise<LearningPath> {
    try {
      const pathId = this.generatePathId();
      
      // Step 1: Analyze skill dependencies
      const dependencies = await this.analyzeSkillDependencies(skillGaps);
      
      // Step 2: Identify prerequisites that user already has
      const prerequisitesMet = this.identifyMetPrerequisites(dependencies, userSkills);
      
      // Step 3: Create learning steps from gaps
      const learningSteps = this.createLearningSteps(skillGaps, dependencies, options);
      
      // Step 4: Optimize learning sequence
      const optimizedSequence = this.optimizeLearningSequence(
        learningSteps,
        dependencies,
        transferableSkills,
        options
      );
      
      // Step 5: Identify parallel learning tracks
      const parallelTracks = this.identifyParallelTracks(optimizedSequence, dependencies);
      
      // Step 6: Calculate critical path
      const criticalPath = this.calculateCriticalPath(optimizedSequence, dependencies);
      
      // Step 7: Calculate path metadata
      const metadata = this.calculatePathMetadata(optimizedSequence, prerequisitesMet);
      
      const learningPath: LearningPath = {
        pathId,
        title: this.generatePathTitle(skillGaps),
        description: this.generatePathDescription(skillGaps, optimizedSequence.length),
        totalEstimatedHours: optimizedSequence.reduce((sum, step) => sum + step.estimatedHours, 0),
        estimatedCompletionWeeks: this.calculateCompletionWeeks(optimizedSequence, options.timeCommitmentHours || 10),
        difficulty: this.calculateOverallDifficulty(optimizedSequence),
        steps: optimizedSequence,
        parallelTracks,
        criticalPath,
        metadata
      };

      logger.info(`Learning path generated successfully: ${pathId}`);
      return learningPath;
    } catch (error) {
      logger.error('Error generating learning path:', error);
      throw new Error(`Learning path generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze dependencies between skills in the gap list
   */
  private async analyzeSkillDependencies(skillGaps: SkillGap[]): Promise<Map<string, SkillDependency>> {
    const dependencies = new Map<string, SkillDependency>();
    
    for (const gap of skillGaps) {
      // Get or create dependency info for this skill
      let dependency = this.skillDependencies.get(gap.skillName);
      
      if (!dependency) {
        // Create dependency based on skill analysis
        dependency = await this.createSkillDependency(gap);
        this.skillDependencies.set(gap.skillName, dependency);
      }
      
      dependencies.set(gap.skillName, dependency);
    }
    
    // Update dependencies based on the specific skill gaps in this analysis
    this.updateDependenciesForGaps(dependencies, skillGaps);
    
    return dependencies;
  }

  /**
   * Create skill dependency information
   */
  private async createSkillDependency(gap: SkillGap): Promise<SkillDependency> {
    const prerequisites = this.identifyPrerequisites(gap.skillName, gap.category);
    const dependents = this.identifyDependents(gap.skillName, gap.category);
    const estimatedHours = this.estimateSkillLearningHours(gap);
    
    return {
      skillName: gap.skillName,
      category: gap.category,
      prerequisites,
      dependents,
      difficulty: gap.learningDifficulty,
      estimatedHours,
      confidence: 0.8 // Default confidence
    };
  }

  /**
   * Identify prerequisite skills for a given skill
   */
  private identifyPrerequisites(skillName: string, category: string): string[] {
    const skill = skillName.toLowerCase();
    const prerequisites: string[] = [];
    
    // Programming language prerequisites
    if (skill.includes('react') || skill.includes('angular') || skill.includes('vue')) {
      prerequisites.push('JavaScript', 'HTML', 'CSS');
    }
    
    if (skill.includes('django') || skill.includes('flask')) {
      prerequisites.push('Python');
    }
    
    if (skill.includes('spring')) {
      prerequisites.push('Java');
    }
    
    if (skill.includes('rails')) {
      prerequisites.push('Ruby');
    }
    
    // Advanced concepts
    if (skill.includes('machine learning') || skill.includes('deep learning')) {
      prerequisites.push('Python', 'Statistics', 'Linear Algebra');
    }
    
    if (skill.includes('kubernetes')) {
      prerequisites.push('Docker', 'Linux');
    }
    
    if (skill.includes('terraform')) {
      prerequisites.push('Cloud Computing', 'Infrastructure');
    }
    
    // Database prerequisites
    if (skill.includes('advanced sql') || skill.includes('database optimization')) {
      prerequisites.push('SQL');
    }
    
    // Category-based prerequisites
    const categoryPrereqs = this.categoryDependencies.get(category);
    if (categoryPrereqs) {
      prerequisites.push(...categoryPrereqs);
    }
    
    return [...new Set(prerequisites)]; // Remove duplicates
  }

  /**
   * Identify skills that depend on this skill
   */
  private identifyDependents(skillName: string, category: string): string[] {
    const skill = skillName.toLowerCase();
    const dependents: string[] = [];
    
    // Foundational skills have many dependents
    if (skill.includes('javascript')) {
      dependents.push('React', 'Angular', 'Vue', 'Node.js');
    }
    
    if (skill.includes('python')) {
      dependents.push('Django', 'Flask', 'Machine Learning', 'Data Science');
    }
    
    if (skill.includes('java')) {
      dependents.push('Spring', 'Android Development');
    }
    
    if (skill.includes('sql')) {
      dependents.push('Database Administration', 'Data Analysis');
    }
    
    if (skill.includes('docker')) {
      dependents.push('Kubernetes', 'DevOps');
    }
    
    return dependents;
  }

  /**
   * Estimate learning hours for a skill based on gap information
   */
  private estimateSkillLearningHours(gap: SkillGap): number {
    const baseHours = {
      'easy': 20,
      'moderate': 40,
      'hard': 80,
      'very-hard': 160
    }[gap.learningDifficulty];
    
    // Adjust based on level gap
    const levelMultiplier = gap.levelGap * 0.5 + 1;
    
    // Adjust based on category
    const categoryMultiplier = this.getCategoryLearningMultiplier(gap.category);
    
    return Math.round(baseHours * levelMultiplier * categoryMultiplier);
  }

  /**
   * Get learning time multiplier for different categories
   */
  private getCategoryLearningMultiplier(category: string): number {
    const multipliers: Record<string, number> = {
      'Programming': 1.2,
      'Frameworks & Libraries': 0.8,
      'Databases': 1.0,
      'Cloud & DevOps': 1.3,
      'AI & Machine Learning': 1.5,
      'Data Science & Analytics': 1.4,
      'Security': 1.2,
      'Mobile Development': 1.1,
      'Web Development': 0.9,
      'Design & UX': 1.0,
      'Project Management': 0.7,
      'Soft Skills': 0.5,
      'Tools & Software': 0.6,
      'Testing & QA': 0.8,
      'Networking': 1.1,
      'Hardware': 1.3
    };
    
    return multipliers[category] || 1.0;
  }

  /**
   * Identify prerequisites that the user already has
   */
  private identifyMetPrerequisites(
    dependencies: Map<string, SkillDependency>,
    userSkills: UserSkill[]
  ): number {
    const userSkillNames = new Set(userSkills.map(skill => skill.skillName));
    let metCount = 0;
    
    for (const dependency of dependencies.values()) {
      for (const prerequisite of dependency.prerequisites) {
        if (userSkillNames.has(prerequisite)) {
          metCount++;
        }
      }
    }
    
    return metCount;
  }

  /**
   * Create learning steps from skill gaps
   */
  private createLearningSteps(
    skillGaps: SkillGap[],
    dependencies: Map<string, SkillDependency>,
    options: LearningPathOptions
  ): LearningStep[] {
    const steps: LearningStep[] = [];
    
    for (const gap of skillGaps) {
      const dependency = dependencies.get(gap.skillName);
      if (!dependency) continue;
      
      const step: LearningStep = {
        skillName: gap.skillName,
        category: gap.category,
        currentLevel: gap.currentLevel,
        targetLevel: gap.requiredLevel,
        priority: gap.priority,
        estimatedHours: dependency.estimatedHours,
        prerequisites: dependency.prerequisites,
        learningObjectives: this.generateLearningObjectives(gap),
        milestones: this.generateMilestones(gap),
        difficulty: gap.learningDifficulty,
        reasoning: this.generateStepReasoning(gap)
      };
      
      steps.push(step);
    }
    
    return steps;
  }

  /**
   * Generate learning objectives for a skill gap
   */
  private generateLearningObjectives(gap: SkillGap): string[] {
    const objectives: string[] = [];
    const skill = gap.skillName.toLowerCase();
    
    // Generic objectives based on level
    if (!gap.currentLevel) {
      objectives.push(`Understand fundamental concepts of ${gap.skillName}`);
      objectives.push(`Set up development environment for ${gap.skillName}`);
    }
    
    if (gap.requiredLevel === 'intermediate' || gap.requiredLevel === 'advanced' || gap.requiredLevel === 'expert') {
      objectives.push(`Apply ${gap.skillName} in practical projects`);
      objectives.push(`Understand best practices and common patterns`);
    }
    
    if (gap.requiredLevel === 'advanced' || gap.requiredLevel === 'expert') {
      objectives.push(`Optimize and troubleshoot ${gap.skillName} implementations`);
      objectives.push(`Mentor others in ${gap.skillName}`);
    }
    
    // Skill-specific objectives
    if (skill.includes('programming') || skill.includes('language')) {
      objectives.push('Write clean, maintainable code');
      objectives.push('Debug and test code effectively');
    }
    
    if (skill.includes('framework') || skill.includes('library')) {
      objectives.push('Build complete applications using the framework');
      objectives.push('Understand framework architecture and patterns');
    }
    
    return objectives;
  }

  /**
   * Generate milestones for tracking progress
   */
  private generateMilestones(gap: SkillGap): string[] {
    const milestones: string[] = [];
    const skill = gap.skillName;
    
    // Basic milestones
    milestones.push(`Complete introduction to ${skill}`);
    milestones.push(`Build first project using ${skill}`);
    
    if (gap.requiredLevel !== 'beginner') {
      milestones.push(`Complete intermediate ${skill} course or tutorial`);
      milestones.push(`Build portfolio project demonstrating ${skill}`);
    }
    
    if (gap.requiredLevel === 'advanced' || gap.requiredLevel === 'expert') {
      milestones.push(`Contribute to open source project using ${skill}`);
      milestones.push(`Obtain certification in ${skill} (if available)`);
    }
    
    return milestones;
  }

  /**
   * Generate reasoning for why this step is important
   */
  private generateStepReasoning(gap: SkillGap): string {
    const importance = gap.importance;
    const severity = gap.gapSeverity;
    
    if (importance === 'critical' && severity === 'critical') {
      return `This skill is critical for the target role and represents a significant gap that must be addressed immediately.`;
    }
    
    if (importance === 'critical') {
      return `This skill is essential for the target role and should be prioritized in your learning plan.`;
    }
    
    if (severity === 'critical') {
      return `While not the most critical skill, the gap is significant and will require focused effort to bridge.`;
    }
    
    if (gap.timeToCompetency <= 3) {
      return `This skill can be learned relatively quickly and will provide immediate value.`;
    }
    
    return `This skill will enhance your qualifications for the target role and is worth investing time to develop.`;
  }

  /**
   * Optimize the learning sequence based on dependencies and preferences
   */
  private optimizeLearningSequence(
    steps: LearningStep[],
    dependencies: Map<string, SkillDependency>,
    transferableSkills: TransferableSkill[],
    options: LearningPathOptions
  ): LearningStep[] {
    // Create a copy to avoid mutating the original
    let optimizedSteps = [...steps];
    
    // Step 1: Sort by dependencies (topological sort)
    optimizedSteps = this.topologicalSort(optimizedSteps, dependencies);
    
    // Step 2: Apply user preferences
    if (options.prioritizeQuickWins) {
      optimizedSteps = this.prioritizeQuickWins(optimizedSteps);
    }
    
    if (options.difficultyPreference === 'easy-first') {
      optimizedSteps = this.sortByDifficulty(optimizedSteps, 'ascending');
    } else if (options.difficultyPreference === 'hard-first') {
      optimizedSteps = this.sortByDifficulty(optimizedSteps, 'descending');
    }
    
    // Step 3: Consider transferable skills
    if (options.includeTransferableSkills && transferableSkills.length > 0) {
      optimizedSteps = this.incorporateTransferableSkills(optimizedSteps, transferableSkills);
    }
    
    // Step 4: Limit path length if specified
    if (options.maxPathLength && optimizedSteps.length > options.maxPathLength) {
      optimizedSteps = this.limitPathLength(optimizedSteps, options.maxPathLength);
    }
    
    return optimizedSteps;
  }

  /**
   * Perform topological sort to respect skill dependencies
   */
  private topologicalSort(
    steps: LearningStep[],
    dependencies: Map<string, SkillDependency>
  ): LearningStep[] {
    const sorted: LearningStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (step: LearningStep) => {
      if (visiting.has(step.skillName)) {
        // Circular dependency detected, skip for now
        return;
      }
      
      if (visited.has(step.skillName)) {
        return;
      }
      
      visiting.add(step.skillName);
      
      // Visit prerequisites first
      const dependency = dependencies.get(step.skillName);
      if (dependency) {
        for (const prereq of dependency.prerequisites) {
          const prereqStep = steps.find(s => s.skillName === prereq);
          if (prereqStep) {
            visit(prereqStep);
          }
        }
      }
      
      visiting.delete(step.skillName);
      visited.add(step.skillName);
      sorted.push(step);
    };
    
    // Visit all steps
    for (const step of steps) {
      visit(step);
    }
    
    return sorted;
  }

  /**
   * Prioritize quick wins (easy skills with high impact)
   */
  private prioritizeQuickWins(steps: LearningStep[]): LearningStep[] {
    return steps.sort((a, b) => {
      // Calculate quick win score (high priority + low time investment)
      const scoreA = a.priority / a.estimatedHours;
      const scoreB = b.priority / b.estimatedHours;
      
      return scoreB - scoreA;
    });
  }

  /**
   * Sort steps by difficulty
   */
  private sortByDifficulty(steps: LearningStep[], order: 'ascending' | 'descending'): LearningStep[] {
    const difficultyOrder = {
      'easy': 1,
      'moderate': 2,
      'hard': 3,
      'very-hard': 4
    };
    
    return steps.sort((a, b) => {
      const diffA = difficultyOrder[a.difficulty];
      const diffB = difficultyOrder[b.difficulty];
      
      return order === 'ascending' ? diffA - diffB : diffB - diffA;
    });
  }

  /**
   * Incorporate transferable skills into the learning path
   */
  private incorporateTransferableSkills(
    steps: LearningStep[],
    transferableSkills: TransferableSkill[]
  ): LearningStep[] {
    // Boost priority for skills that have transferable components
    const transferableSkillNames = new Set(transferableSkills.map(t => t.toSkillName));
    
    return steps.map(step => {
      if (transferableSkillNames.has(step.skillName)) {
        // Reduce estimated hours due to transferable knowledge
        const transferable = transferableSkills.find(t => t.toSkillName === step.skillName);
        if (transferable) {
          step.estimatedHours = Math.round(step.estimatedHours * (1 - transferable.transferabilityScore * 0.3));
          step.reasoning += ` Your existing ${transferable.fromSkill.skillName} knowledge will accelerate learning.`;
        }
      }
      return step;
    });
  }

  /**
   * Limit path length to specified maximum
   */
  private limitPathLength(steps: LearningStep[], maxLength: number): LearningStep[] {
    // Sort by priority and take top N
    return steps
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxLength);
  }

  /**
   * Identify skills that can be learned in parallel
   */
  private identifyParallelTracks(
    steps: LearningStep[],
    dependencies: Map<string, SkillDependency>
  ): LearningStep[][] {
    const tracks: LearningStep[][] = [];
    const processed = new Set<string>();
    
    for (const step of steps) {
      if (processed.has(step.skillName)) continue;
      
      const track: LearningStep[] = [step];
      processed.add(step.skillName);
      
      // Find other steps that can be learned in parallel
      for (const otherStep of steps) {
        if (processed.has(otherStep.skillName)) continue;
        
        if (this.canLearnInParallel(step, otherStep, dependencies)) {
          track.push(otherStep);
          processed.add(otherStep.skillName);
        }
      }
      
      tracks.push(track);
    }
    
    return tracks.filter(track => track.length > 1); // Only return tracks with multiple skills
  }

  /**
   * Check if two skills can be learned in parallel
   */
  private canLearnInParallel(
    step1: LearningStep,
    step2: LearningStep,
    dependencies: Map<string, SkillDependency>
  ): boolean {
    const dep1 = dependencies.get(step1.skillName);
    const dep2 = dependencies.get(step2.skillName);
    
    if (!dep1 || !dep2) return false;
    
    // Can't learn in parallel if one depends on the other
    if (dep1.prerequisites.includes(step2.skillName) || 
        dep2.prerequisites.includes(step1.skillName)) {
      return false;
    }
    
    // Can learn in parallel if they're in different categories
    // and don't share too many prerequisites
    if (step1.category !== step2.category) {
      const sharedPrereqs = dep1.prerequisites.filter(p => dep2.prerequisites.includes(p));
      return sharedPrereqs.length <= 1; // Allow at most 1 shared prerequisite
    }
    
    return false;
  }

  /**
   * Calculate the critical path through the learning sequence
   */
  private calculateCriticalPath(
    steps: LearningStep[],
    dependencies: Map<string, SkillDependency>
  ): string[] {
    // Find the longest path through the dependency graph
    const criticalPath: string[] = [];
    const visited = new Set<string>();
    
    const findLongestPath = (skillName: string, currentPath: string[]): string[] => {
      if (visited.has(skillName)) return currentPath;
      
      visited.add(skillName);
      const dependency = dependencies.get(skillName);
      
      if (!dependency || dependency.dependents.length === 0) {
        return [...currentPath, skillName];
      }
      
      let longestPath = [...currentPath, skillName];
      
      for (const dependent of dependency.dependents) {
        const dependentStep = steps.find(s => s.skillName === dependent);
        if (dependentStep) {
          const path = findLongestPath(dependent, [...currentPath, skillName]);
          if (path.length > longestPath.length) {
            longestPath = path;
          }
        }
      }
      
      visited.delete(skillName);
      return longestPath;
    };
    
    // Find starting points (skills with no prerequisites in our set)
    const startingSkills = steps.filter(step => {
      const dependency = dependencies.get(step.skillName);
      return !dependency || dependency.prerequisites.length === 0;
    });
    
    let longestOverallPath: string[] = [];
    
    for (const startingSkill of startingSkills) {
      const path = findLongestPath(startingSkill.skillName, []);
      if (path.length > longestOverallPath.length) {
        longestOverallPath = path;
      }
    }
    
    return longestOverallPath;
  }

  /**
   * Calculate path metadata
   */
  private calculatePathMetadata(
    steps: LearningStep[],
    prerequisitesMet: number
  ): LearningPath['metadata'] {
    const totalPrerequisites = steps.reduce((sum, step) => sum + step.prerequisites.length, 0);
    const avgConfidence = steps.reduce((sum, step) => sum + 0.8, 0) / steps.length; // Default confidence
    
    return {
      totalSkills: steps.length,
      prerequisitesMet,
      confidenceScore: avgConfidence,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Generate a descriptive title for the learning path
   */
  private generatePathTitle(skillGaps: SkillGap[]): string {
    const categories = [...new Set(skillGaps.map(gap => gap.category))];
    
    if (categories.length === 1) {
      return `${categories[0]} Learning Path`;
    } else if (categories.length <= 3) {
      return `${categories.join(' & ')} Learning Path`;
    } else {
      return `Multi-Skill Development Path`;
    }
  }

  /**
   * Generate a description for the learning path
   */
  private generatePathDescription(skillGaps: SkillGap[], stepCount: number): string {
    const criticalSkills = skillGaps.filter(gap => gap.importance === 'critical').length;
    const categories = [...new Set(skillGaps.map(gap => gap.category))];
    
    let description = `A structured learning path with ${stepCount} steps to bridge your skill gaps`;
    
    if (criticalSkills > 0) {
      description += `, focusing on ${criticalSkills} critical skills`;
    }
    
    if (categories.length > 1) {
      description += ` across ${categories.length} categories: ${categories.join(', ')}`;
    }
    
    description += '. The path is optimized based on skill dependencies and learning efficiency.';
    
    return description;
  }

  /**
   * Calculate estimated completion time in weeks
   */
  private calculateCompletionWeeks(steps: LearningStep[], hoursPerWeek: number): number {
    const totalHours = steps.reduce((sum, step) => sum + step.estimatedHours, 0);
    return Math.ceil(totalHours / hoursPerWeek);
  }

  /**
   * Calculate overall difficulty of the learning path
   */
  private calculateOverallDifficulty(steps: LearningStep[]): 'easy' | 'moderate' | 'hard' | 'very-hard' {
    const difficultyScores = {
      'easy': 1,
      'moderate': 2,
      'hard': 3,
      'very-hard': 4
    };
    
    const avgScore = steps.reduce((sum, step) => sum + difficultyScores[step.difficulty], 0) / steps.length;
    
    if (avgScore >= 3.5) return 'very-hard';
    if (avgScore >= 2.5) return 'hard';
    if (avgScore >= 1.5) return 'moderate';
    return 'easy';
  }

  /**
   * Generate unique path ID
   */
  private generatePathId(): string {
    return `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update dependencies based on specific gaps in this analysis
   */
  private updateDependenciesForGaps(
    dependencies: Map<string, SkillDependency>,
    skillGaps: SkillGap[]
  ): void {
    const gapSkillNames = new Set(skillGaps.map(gap => gap.skillName));
    
    // Filter prerequisites to only include skills that are also gaps
    for (const [skillName, dependency] of dependencies) {
      dependency.prerequisites = dependency.prerequisites.filter(prereq => 
        gapSkillNames.has(prereq)
      );
      
      dependency.dependents = dependency.dependents.filter(dependent => 
        gapSkillNames.has(dependent)
      );
    }
  }

  /**
   * Initialize predefined skill dependencies
   */
  private initializeSkillDependencies(): void {
    // This would typically be loaded from a database or configuration file
    // For now, we'll initialize with some common patterns
    
    const commonDependencies = [
      {
        skillName: 'React',
        category: 'Frameworks & Libraries',
        prerequisites: ['JavaScript', 'HTML', 'CSS'],
        dependents: ['Next.js', 'React Native'],
        difficulty: 'moderate' as const,
        estimatedHours: 60,
        confidence: 0.9
      },
      {
        skillName: 'Machine Learning',
        category: 'AI & Machine Learning',
        prerequisites: ['Python', 'Statistics', 'Linear Algebra'],
        dependents: ['Deep Learning', 'Computer Vision'],
        difficulty: 'very-hard' as const,
        estimatedHours: 200,
        confidence: 0.8
      },
      {
        skillName: 'Kubernetes',
        category: 'Cloud & DevOps',
        prerequisites: ['Docker', 'Linux', 'Networking'],
        dependents: ['Service Mesh', 'GitOps'],
        difficulty: 'hard' as const,
        estimatedHours: 120,
        confidence: 0.85
      }
    ];
    
    for (const dep of commonDependencies) {
      this.skillDependencies.set(dep.skillName, dep);
    }
  }

  /**
   * Initialize category-level dependencies
   */
  private initializeCategoryDependencies(): void {
    this.categoryDependencies = new Map([
      ['Frameworks & Libraries', ['Programming']],
      ['AI & Machine Learning', ['Programming', 'Statistics']],
      ['Cloud & DevOps', ['Linux', 'Networking']],
      ['Mobile Development', ['Programming']],
      ['Data Science & Analytics', ['Programming', 'Statistics']],
      ['Security', ['Networking', 'Programming']],
      ['Testing & QA', ['Programming']]
    ]);
  }
}