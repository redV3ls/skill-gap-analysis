import { logger } from '../utils/logger';
import { GapAnalysisService, GapAnalysisResult, SkillGap } from './gapAnalysis';
import { SkillMatchingService, UserSkill } from './skillMatching';
import { JobAnalysisService, JobSkillRequirement } from './jobAnalysis';

export interface TeamMember {
  id: string;
  name?: string;
  role?: string;
  department?: string;
  skills: UserSkill[];
  salary?: number;
  hourlyRate?: number;
}

export interface ProjectRequirements {
  name: string;
  description?: string;
  required_skills: string[];
  timeline?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  budget?: number;
}

export interface TeamMemberAnalysis {
  member_id: string;
  member_name: string;
  role?: string;
  department?: string;
  overall_match: number;
  skill_gaps: {
    skill_name: string;
    category: string;
    current_level?: string;
    required_level: string;
    gap_severity: 'critical' | 'moderate' | 'minor';
    priority: number;
    time_to_competency: number;
  }[];
  strengths: {
    skill_name: string;
    level: string;
    years_experience?: number;
    category: string;
  }[];
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
}

export interface TeamGap {
  skill_name: string;
  members_needing: number;
  percentage_needing: number;
  severity: 'critical' | 'moderate' | 'minor';
  estimated_training_cost?: number;
  estimated_hiring_cost?: number;
  recommended_solution: 'training' | 'hiring' | 'mixed';
}

export interface TeamStrength {
  skill_name: string;
  members_having: number;
  percentage_having: number;
  coverage: 'excellent' | 'good' | 'adequate';
  expertise_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface BudgetEstimate {
  training_costs: {
    total: number;
    per_skill: Map<string, number>;
    timeline_months: number;
  };
  hiring_costs: {
    total: number;
    per_skill: Map<string, number>;
    positions_needed: number;
  };
  recommended_approach: 'training_focused' | 'hiring_focused' | 'mixed_approach';
  cost_savings: number;
  roi_timeline_months: number;
}

export interface TeamRecommendations {
  hiring_priorities: string[];
  training_priorities: string[];
  knowledge_sharing: string[];
  role_optimization: string[];
  budget_allocation: {
    training_percentage: number;
    hiring_percentage: number;
    total_budget_needed: number;
  };
}

export interface TeamAnalysisResult {
  analysis_id: string;
  project: {
    name: string;
    description?: string;
    timeline?: string;
    priority?: string;
  };
  team_summary: {
    total_members: number;
    overall_match: number;
    critical_gaps_count: number;
    team_strengths_count: number;
    skill_coverage_percentage: number;
  };
  member_analyses: TeamMemberAnalysis[];
  team_gaps: TeamGap[];
  team_strengths: TeamStrength[];
  recommendations: TeamRecommendations;
  budget_estimates: BudgetEstimate;
  metadata: {
    processing_time: number;
    analysis_timestamp: string;
    team_size: number;
    project_skills_analyzed: number;
    analysis_confidence: number;
  };
}

export class TeamAnalysisService {
  private gapAnalysisService: GapAnalysisService;
  private jobAnalysisService: JobAnalysisService;
  
  // Cost estimation constants (in USD)
  private readonly TRAINING_COST_PER_SKILL = 2000; // Average cost per skill training
  private readonly HIRING_COST_BASE = 50000; // Base hiring cost (recruiting, onboarding)
  private readonly SALARY_MULTIPLIER = 1.3; // Total cost multiplier for salary (benefits, etc.)
  private readonly TRAINING_TIME_MONTHS = 3; // Average training time per skill

  constructor(
    gapAnalysisService: GapAnalysisService,
    jobAnalysisService?: JobAnalysisService
  ) {
    this.gapAnalysisService = gapAnalysisService;
    this.jobAnalysisService = jobAnalysisService || new JobAnalysisService();
  }

  /**
   * Perform comprehensive team analysis
   */
  async analyzeTeam(
    teamMembers: TeamMember[],
    projectRequirements: ProjectRequirements
  ): Promise<TeamAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Extract project skill requirements
      const projectSkillRequirements = await this.extractProjectRequirements(projectRequirements);
      
      // Step 2: Analyze each team member individually
      const memberAnalyses = await this.analyzeMembersIndividually(teamMembers, projectSkillRequirements);
      
      // Step 3: Perform team-wide skill aggregation
      const { teamGaps, teamStrengths } = this.aggregateTeamSkills(memberAnalyses, teamMembers.length);
      
      // Step 4: Calculate team statistics
      const teamSummary = this.calculateTeamSummary(memberAnalyses, teamGaps, teamStrengths);
      
      // Step 5: Generate team recommendations
      const recommendations = this.generateTeamRecommendations(
        teamGaps,
        teamStrengths,
        memberAnalyses,
        projectRequirements
      );
      
      // Step 6: Calculate budget estimates
      const budgetEstimates = this.calculateBudgetEstimates(
        teamGaps,
        teamMembers,
        projectRequirements
      );
      
      // Step 7: Calculate metadata
      const processingTime = Date.now() - startTime;
      const analysisConfidence = this.calculateAnalysisConfidence(memberAnalyses);
      
      return {
        analysis_id: crypto.randomUUID(),
        project: {
          name: projectRequirements.name,
          description: projectRequirements.description,
          timeline: projectRequirements.timeline,
          priority: projectRequirements.priority
        },
        team_summary: teamSummary,
        member_analyses: memberAnalyses,
        team_gaps: teamGaps,
        team_strengths: teamStrengths,
        recommendations,
        budget_estimates: budgetEstimates,
        metadata: {
          processing_time: processingTime,
          analysis_timestamp: new Date().toISOString(),
          team_size: teamMembers.length,
          project_skills_analyzed: projectSkillRequirements.length,
          analysis_confidence: analysisConfidence
        }
      };
      
    } catch (error) {
      logger.error('Team analysis failed:', error);
      throw new Error(`Team analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract and analyze project skill requirements
   */
  private async extractProjectRequirements(projectRequirements: ProjectRequirements): Promise<JobSkillRequirement[]> {
    const description = projectRequirements.description || 
      `Project: ${projectRequirements.name}. Required skills: ${projectRequirements.required_skills.join(', ')}`;
    
    const jobAnalysisResult = await this.jobAnalysisService.analyzeJobDescription(
      description,
      projectRequirements.name
    );
    
    return jobAnalysisResult.skillRequirements;
  }

  /**
   * Analyze each team member individually
   */
  private async analyzeMembersIndividually(
    teamMembers: TeamMember[],
    projectSkillRequirements: JobSkillRequirement[]
  ): Promise<TeamMemberAnalysis[]> {
    const memberAnalyses: TeamMemberAnalysis[] = [];
    
    for (const member of teamMembers) {
      try {
        const memberGapAnalysis = await this.gapAnalysisService.analyzeGaps(
          member.skills,
          projectSkillRequirements
        );
        
        const memberAnalysis: TeamMemberAnalysis = {
          member_id: member.id,
          member_name: member.name || `Member ${member.id}`,
          role: member.role,
          department: member.department,
          overall_match: memberGapAnalysis.overallMatchPercentage,
          skill_gaps: memberGapAnalysis.skillGaps.map(gap => ({
            skill_name: gap.skillName,
            category: gap.category,
            current_level: gap.currentLevel,
            required_level: gap.requiredLevel,
            gap_severity: gap.gapSeverity,
            priority: gap.priority,
            time_to_competency: gap.timeToCompetency
          })),
          strengths: memberGapAnalysis.strengths.map(strength => ({
            skill_name: strength.skillName,
            level: strength.level,
            years_experience: strength.yearsExperience,
            category: strength.skillCategory
          })),
          recommendations: memberGapAnalysis.recommendations
        };
        
        memberAnalyses.push(memberAnalysis);
        
      } catch (error) {
        logger.warn(`Failed to analyze member ${member.id}:`, error);
        // Create a basic analysis for failed member
        memberAnalyses.push({
          member_id: member.id,
          member_name: member.name || `Member ${member.id}`,
          role: member.role,
          department: member.department,
          overall_match: 0,
          skill_gaps: [],
          strengths: [],
          recommendations: { immediate: [], shortTerm: [], longTerm: [] }
        });
      }
    }
    
    return memberAnalyses;
  }

  /**
   * Aggregate team skills and identify collective gaps and strengths
   */
  private aggregateTeamSkills(
    memberAnalyses: TeamMemberAnalysis[],
    teamSize: number
  ): { teamGaps: TeamGap[]; teamStrengths: TeamStrength[] } {
    const skillsMap = new Map<string, number>(); // skill -> count of members who have it
    const gapsMap = new Map<string, { count: number; severities: string[] }>(); // skill -> gap info
    const skillLevelsMap = new Map<string, string[]>(); // skill -> levels of members who have it
    
    // Aggregate skills and gaps from all members
    for (const member of memberAnalyses) {
      // Track member strengths
      member.strengths.forEach(strength => {
        const count = skillsMap.get(strength.skill_name) || 0;
        skillsMap.set(strength.skill_name, count + 1);
        
        const levels = skillLevelsMap.get(strength.skill_name) || [];
        levels.push(strength.level);
        skillLevelsMap.set(strength.skill_name, levels);
      });
      
      // Track member gaps
      member.skill_gaps.forEach(gap => {
        const existing = gapsMap.get(gap.skill_name) || { count: 0, severities: [] };
        existing.count += 1;
        existing.severities.push(gap.gap_severity);
        gapsMap.set(gap.skill_name, existing);
      });
    }
    
    // Generate team gaps (skills needed by significant portion of team)
    const teamGaps: TeamGap[] = Array.from(gapsMap.entries())
      .filter(([skill, info]) => info.count >= Math.ceil(teamSize * 0.3)) // 30% or more need this skill
      .map(([skill, info]) => {
        const percentageNeeding = Math.round((info.count / teamSize) * 100);
        const criticalCount = info.severities.filter(s => s === 'critical').length;
        const severity = this.determineTeamGapSeverity(info.count, teamSize, criticalCount);
        
        return {
          skill_name: skill,
          members_needing: info.count,
          percentage_needing: percentageNeeding,
          severity,
          estimated_training_cost: this.estimateTrainingCost(skill, info.count),
          estimated_hiring_cost: this.estimateHiringCost(skill),
          recommended_solution: this.recommendSolution(info.count, teamSize, severity)
        };
      })
      .sort((a, b) => b.members_needing - a.members_needing);
    
    // Generate team strengths (skills most members have)
    const teamStrengths: TeamStrength[] = Array.from(skillsMap.entries())
      .filter(([skill, count]) => count >= Math.ceil(teamSize * 0.34)) // Lower threshold for small teams (1/3 or more)
      .map(([skill, count]) => {
        const percentageHaving = Math.round((count / teamSize) * 100);
        const coverage = this.determineSkillCoverage(count, teamSize);
        const levels = skillLevelsMap.get(skill) || [];
        const expertiseLevel = this.determineTeamExpertiseLevel(levels);
        
        return {
          skill_name: skill,
          members_having: count,
          percentage_having: percentageHaving,
          coverage,
          expertise_level: expertiseLevel
        };
      })
      .sort((a, b) => b.members_having - a.members_having);
    
    return { teamGaps, teamStrengths };
  }

  /**
   * Calculate team summary statistics
   */
  private calculateTeamSummary(
    memberAnalyses: TeamMemberAnalysis[],
    teamGaps: TeamGap[],
    teamStrengths: TeamStrength[]
  ) {
    const teamSize = memberAnalyses.length;
    const totalMatch = memberAnalyses.reduce((sum, member) => sum + member.overall_match, 0);
    const overallMatch = teamSize > 0 ? Math.round(totalMatch / teamSize) : 0;
    
    const criticalGapsCount = teamGaps.filter(gap => gap.severity === 'critical').length;
    const teamStrengthsCount = teamStrengths.length;
    
    // Calculate skill coverage percentage
    // For small teams, we need to be more flexible about what constitutes "coverage"
    const allSkillsInTeam = new Set();
    memberAnalyses.forEach(member => {
      member.strengths.forEach(strength => allSkillsInTeam.add(strength.skill_name));
    });
    
    const totalSkillsNeeded = new Set([
      ...teamGaps.map(gap => gap.skill_name),
      ...teamStrengths.map(strength => strength.skill_name),
      ...Array.from(allSkillsInTeam)
    ]).size;
    
    const skillsCovered = Math.max(teamStrengths.length, allSkillsInTeam.size);
    const skillCoveragePercentage = totalSkillsNeeded > 0 
      ? Math.round((skillsCovered / totalSkillsNeeded) * 100)
      : (teamSize > 0 ? 50 : 100); // Default to 50% if we have members but no clear skills data
    
    return {
      total_members: teamSize,
      overall_match: overallMatch,
      critical_gaps_count: criticalGapsCount,
      team_strengths_count: teamStrengthsCount,
      skill_coverage_percentage: skillCoveragePercentage
    };
  }

  /**
   * Generate comprehensive team recommendations
   */
  private generateTeamRecommendations(
    teamGaps: TeamGap[],
    teamStrengths: TeamStrength[],
    memberAnalyses: TeamMemberAnalysis[],
    projectRequirements: ProjectRequirements
  ): TeamRecommendations {
    // Hiring priorities (critical gaps that are expensive to train)
    const hiringPriorities = teamGaps
      .filter(gap => gap.severity === 'critical' && gap.recommended_solution !== 'training')
      .slice(0, 5)
      .map(gap => `Hire for ${gap.skill_name} (${gap.percentage_needing}% of team needs this skill)`);
    
    // Training priorities (gaps that can be addressed through training)
    const trainingPriorities = teamGaps
      .filter(gap => gap.recommended_solution !== 'hiring')
      .slice(0, 5)
      .map(gap => `Provide training for ${gap.skill_name} (${gap.percentage_needing}% of team needs this)`);
    
    // Knowledge sharing opportunities
    const knowledgeSharing = teamStrengths
      .filter(strength => strength.coverage !== 'excellent') // Not everyone has it yet
      .slice(0, 3)
      .map(strength => `Leverage ${strength.skill_name} expertise (${strength.percentage_having}% coverage) through mentoring`);
    
    // Role optimization suggestions
    const roleOptimization = memberAnalyses
      .filter(member => member.overall_match < 70) // Increased threshold to catch more members
      .slice(0, 3)
      .map(member => `Consider role adjustment for ${member.member_name} (${member.overall_match}% project match)`);
    
    // Calculate budget allocation
    const totalTrainingCost = teamGaps
      .filter(gap => gap.recommended_solution !== 'hiring')
      .reduce((sum, gap) => sum + (gap.estimated_training_cost || 0), 0);
    
    const totalHiringCost = teamGaps
      .filter(gap => gap.recommended_solution !== 'training')
      .reduce((sum, gap) => sum + (gap.estimated_hiring_cost || 0), 0);
    
    const totalBudget = totalTrainingCost + totalHiringCost;
    const trainingPercentage = totalBudget > 0 ? Math.round((totalTrainingCost / totalBudget) * 100) : 0;
    const hiringPercentage = 100 - trainingPercentage;
    
    return {
      hiring_priorities: hiringPriorities,
      training_priorities: trainingPriorities,
      knowledge_sharing: knowledgeSharing,
      role_optimization: roleOptimization,
      budget_allocation: {
        training_percentage: trainingPercentage,
        hiring_percentage: hiringPercentage,
        total_budget_needed: totalBudget
      }
    };
  }

  /**
   * Calculate detailed budget estimates for training vs hiring
   */
  private calculateBudgetEstimates(
    teamGaps: TeamGap[],
    teamMembers: TeamMember[],
    projectRequirements: ProjectRequirements
  ): BudgetEstimate {
    const trainingCosts = new Map<string, number>();
    const hiringCosts = new Map<string, number>();
    
    let totalTrainingCost = 0;
    let totalHiringCost = 0;
    let positionsNeeded = 0;
    
    for (const gap of teamGaps) {
      const trainingCost = gap.estimated_training_cost || 0;
      const hiringCost = gap.estimated_hiring_cost || 0;
      
      if (gap.recommended_solution === 'training' || gap.recommended_solution === 'mixed') {
        trainingCosts.set(gap.skill_name, trainingCost);
        totalTrainingCost += trainingCost;
      }
      
      if (gap.recommended_solution === 'hiring' || gap.recommended_solution === 'mixed') {
        hiringCosts.set(gap.skill_name, hiringCost);
        totalHiringCost += hiringCost;
        
        if (gap.severity === 'critical') {
          positionsNeeded += Math.ceil(gap.members_needing / 3); // Assume 1 hire per 3 people needing skill
        }
      }
    }
    
    // Determine recommended approach
    const costRatio = totalHiringCost > 0 ? totalTrainingCost / totalHiringCost : 0;
    let recommendedApproach: 'training_focused' | 'hiring_focused' | 'mixed_approach';
    
    if (costRatio < 0.3) {
      recommendedApproach = 'training_focused';
    } else if (costRatio > 2) {
      recommendedApproach = 'hiring_focused';
    } else {
      recommendedApproach = 'mixed_approach';
    }
    
    // Calculate cost savings and ROI
    const alternativeCost = recommendedApproach === 'training_focused' ? totalHiringCost : totalTrainingCost;
    const chosenCost = recommendedApproach === 'training_focused' ? totalTrainingCost : totalHiringCost;
    const costSavings = Math.max(0, alternativeCost - chosenCost);
    
    // ROI timeline (training typically pays off in 6-12 months)
    const roiTimelineMonths = recommendedApproach === 'training_focused' ? 9 : 3;
    
    return {
      training_costs: {
        total: totalTrainingCost,
        per_skill: trainingCosts,
        timeline_months: this.TRAINING_TIME_MONTHS
      },
      hiring_costs: {
        total: totalHiringCost,
        per_skill: hiringCosts,
        positions_needed: positionsNeeded
      },
      recommended_approach: recommendedApproach,
      cost_savings: costSavings,
      roi_timeline_months: roiTimelineMonths
    };
  }

  /**
   * Helper methods for calculations
   */
  private determineTeamGapSeverity(
    membersNeeding: number,
    teamSize: number,
    criticalCount: number
  ): 'critical' | 'moderate' | 'minor' {
    const percentage = membersNeeding / teamSize;
    const criticalPercentage = criticalCount / membersNeeding;
    
    if (percentage >= 0.8 || criticalPercentage >= 0.5) {
      return 'critical';
    } else if (percentage >= 0.5) {
      return 'moderate';
    } else {
      return 'minor';
    }
  }

  private determineSkillCoverage(count: number, teamSize: number): 'excellent' | 'good' | 'adequate' {
    const percentage = count / teamSize;
    if (percentage >= 0.8) return 'excellent';
    if (percentage >= 0.6) return 'good';
    return 'adequate';
  }

  private determineTeamExpertiseLevel(levels: string[]): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const levelWeights = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
    const totalWeight = levels.reduce((sum, level) => sum + (levelWeights[level as keyof typeof levelWeights] || 1), 0);
    const avgWeight = totalWeight / levels.length;
    
    if (avgWeight >= 3.5) return 'expert';
    if (avgWeight >= 2.5) return 'advanced';
    if (avgWeight >= 1.5) return 'intermediate';
    return 'beginner';
  }

  private estimateTrainingCost(skillName: string, membersCount: number): number {
    // Base cost per skill, multiplied by number of members needing training
    const baseCost = this.TRAINING_COST_PER_SKILL;
    
    // Apply skill-specific multipliers
    const skillMultiplier = this.getSkillTrainingMultiplier(skillName);
    
    // Volume discount for multiple people
    const volumeDiscount = membersCount > 5 ? 0.8 : membersCount > 2 ? 0.9 : 1.0;
    
    return Math.round(baseCost * skillMultiplier * membersCount * volumeDiscount);
  }

  private estimateHiringCost(skillName: string): number {
    const baseCost = this.HIRING_COST_BASE;
    const skillMultiplier = this.getSkillHiringMultiplier(skillName);
    
    return Math.round(baseCost * skillMultiplier);
  }

  private getSkillTrainingMultiplier(skillName: string): number {
    const skill = skillName.toLowerCase();
    
    // High-cost training skills
    if (skill.includes('machine learning') || skill.includes('ai') || skill.includes('blockchain')) {
      return 2.0;
    }
    
    // Medium-cost training skills
    if (skill.includes('cloud') || skill.includes('devops') || skill.includes('security')) {
      return 1.5;
    }
    
    // Standard training cost
    return 1.0;
  }

  private getSkillHiringMultiplier(skillName: string): number {
    const skill = skillName.toLowerCase();
    
    // High-demand, expensive skills
    if (skill.includes('machine learning') || skill.includes('ai') || skill.includes('blockchain')) {
      return 2.5;
    }
    
    // Specialized technical skills
    if (skill.includes('cloud') || skill.includes('devops') || skill.includes('security')) {
      return 1.8;
    }
    
    // Standard hiring cost
    return 1.0;
  }

  private recommendSolution(
    membersNeeding: number,
    teamSize: number,
    severity: 'critical' | 'moderate' | 'minor'
  ): 'training' | 'hiring' | 'mixed' {
    const percentage = membersNeeding / teamSize;
    
    // If most of the team needs it and it's critical, consider mixed approach
    if (percentage >= 0.7 && severity === 'critical') {
      return 'mixed';
    }
    
    // If it's critical but only few people need it, hiring might be better
    if (severity === 'critical' && percentage <= 0.3) {
      return 'hiring';
    }
    
    // For most cases, training is more cost-effective
    return 'training';
  }

  private calculateAnalysisConfidence(memberAnalyses: TeamMemberAnalysis[]): number {
    if (memberAnalyses.length === 0) return 0;
    
    // Base confidence on successful member analyses
    const successfulAnalyses = memberAnalyses.filter(member => member.overall_match > 0).length;
    const successRate = successfulAnalyses / memberAnalyses.length;
    
    // Factor in data completeness (members with role and department info)
    const completeProfiles = memberAnalyses.filter(member => member.role && member.department).length;
    const completenessRate = completeProfiles / memberAnalyses.length;
    
    return Math.round((successRate * 0.7 + completenessRate * 0.3) * 100) / 100;
  }
}