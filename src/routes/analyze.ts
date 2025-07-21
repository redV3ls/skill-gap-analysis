import { Hono } from 'hono';
import { z } from 'zod';
import { Env } from '../index';
import { AuthenticatedContext, requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { validateRequest, gapAnalysisRequestSchema, teamAnalysisRequestSchema } from '../schemas/validation';
import { GapAnalysisService } from '../services/gapAnalysis';
import { SkillMatchingService, UserSkill } from '../services/skillMatching';
import { JobAnalysisService, JobSkillRequirement } from '../services/jobAnalysis';
import { createDatabase } from '../config/database';

const analyze = new Hono<{ Bindings: Env }>();

// Apply authentication to all analyze routes
analyze.use('*', requireAuth);

/**
 * POST /analyze/gap - Individual skill gap analysis
 * Analyzes gaps between user skills and target job requirements
 */
analyze.post('/gap', validateRequest(gapAnalysisRequestSchema), async (c: AuthenticatedContext) => {
  const startTime = Date.now();
  
  try {
    const { user_skills, target_job, analysis_options } = (c.req as any).validatedData;
    
    // Initialize database and services
    const database = createDatabase(c.env.DB);
    const skillMatchingService = new SkillMatchingService(database);
    const gapAnalysisService = new GapAnalysisService(skillMatchingService);
    const jobAnalysisService = new JobAnalysisService();
    
    // Convert user skills to internal format
    const userSkills: UserSkill[] = user_skills.map((skill: any) => ({
      skillId: crypto.randomUUID(), // Generate temporary ID
      skillName: skill.skill,
      skillCategory: 'General', // Will be categorized by the service
      level: skill.level,
      yearsExperience: skill.years_experience || 0,
      confidenceScore: 0.8, // Default confidence
      certifications: skill.certifications || []
    }));
    
    // Analyze job description to extract requirements
    const jobAnalysisResult = await jobAnalysisService.analyzeJobDescription(
      target_job.description,
      target_job.title
    );
    
    const jobRequirements: JobSkillRequirement[] = jobAnalysisResult.skillRequirements;
    
    // Perform gap analysis
    const gapAnalysisResult = await gapAnalysisService.analyzeGaps(userSkills, jobRequirements);
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    
    // Format response according to API design
    const response = {
      analysis_id: crypto.randomUUID(),
      user_id: c.user!.id,
      target_job: {
        title: target_job.title,
        company: target_job.company,
        location: target_job.location
      },
      overall_match: gapAnalysisResult.overallMatchPercentage,
      skill_gaps: gapAnalysisResult.skillGaps.map(gap => ({
        skill_name: gap.skillName,
        category: gap.category,
        current_level: gap.currentLevel,
        required_level: gap.requiredLevel,
        gap_severity: gap.gapSeverity,
        time_to_bridge: gap.timeToCompetency,
        learning_difficulty: gap.learningDifficulty,
        priority: gap.priority,
        importance: gap.importance
      })),
      strengths: gapAnalysisResult.strengths.map(strength => ({
        skill_name: strength.skillName,
        level: strength.level,
        years_experience: strength.yearsExperience,
        category: strength.skillCategory
      })),
      recommendations: gapAnalysisResult.recommendations,
      transferable_opportunities: gapAnalysisResult.transferableOpportunities.map(transfer => ({
        from_skill: transfer.fromSkill.skillName,
        to_skill: transfer.toSkillName,
        transferability_score: transfer.transferabilityScore,
        reasoning: transfer.reasoning
      })),
      metadata: {
        ...gapAnalysisResult.metadata,
        processing_time: processingTime,
        analysis_timestamp: new Date().toISOString(),
        api_version: 'v1'
      }
    };
    
    // Store analysis result for future reference (optional)
    if (analysis_options?.include_recommendations) {
      try {
        await c.env.DB
          .prepare(`
            INSERT INTO gap_analyses (
              id, user_id, target_job_title, overall_match, 
              skill_gaps_count, created_at, analysis_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            response.analysis_id,
            c.user!.id,
            target_job.title,
            response.overall_match,
            response.skill_gaps.length,
            new Date().toISOString(),
            JSON.stringify(response)
          )
          .run();
      } catch (dbError) {
        // Log error but don't fail the request
        console.warn('Failed to store analysis result:', dbError);
      }
    }
    
    return c.json(response, 200);
    
  } catch (error) {
    console.error('Gap analysis error:', error);
    
    if (error instanceof AppError) {
      throw error;
    }
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('validation')) {
        throw new AppError('Invalid input data for gap analysis', 400, 'VALIDATION_ERROR');
      }
      if (error.message.includes('timeout')) {
        throw new AppError('Analysis request timed out', 408, 'TIMEOUT_ERROR');
      }
    }
    
    throw new AppError('Gap analysis failed', 500, 'ANALYSIS_FAILED');
  }
});

/**
 * GET /analyze/gap/:analysisId - Retrieve previous gap analysis
 */
analyze.get('/gap/:analysisId', async (c: AuthenticatedContext) => {
  const analysisId = c.req.param('analysisId');
  
  try {
    const analysis = await c.env.DB
      .prepare('SELECT * FROM gap_analyses WHERE id = ? AND user_id = ?')
      .bind(analysisId, c.user!.id)
      .first() as any;
    
    if (!analysis) {
      throw new AppError('Gap analysis not found', 404, 'ANALYSIS_NOT_FOUND');
    }
    
    const analysisData = JSON.parse(analysis.analysis_data);
    
    return c.json({
      ...analysisData,
      retrieved_at: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Retrieve analysis error:', error);
    throw new AppError('Failed to retrieve gap analysis', 500, 'RETRIEVAL_FAILED');
  }
});

/**
 * GET /analyze/gap/history - Get user's gap analysis history
 */
analyze.get('/gap/history', async (c: AuthenticatedContext) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);
    const offset = (page - 1) * limit;
    
    const analyses = await c.env.DB
      .prepare(`
        SELECT id, target_job_title, overall_match, skill_gaps_count, created_at
        FROM gap_analyses 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `)
      .bind(c.user!.id, limit, offset)
      .all();
    
    const totalCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM gap_analyses WHERE user_id = ?')
      .bind(c.user!.id)
      .first() as any;
    
    return c.json({
      analyses: analyses.results,
      pagination: {
        page,
        limit,
        total: totalCount?.count || 0,
        pages: Math.ceil((totalCount?.count || 0) / limit)
      }
    });
    
  } catch (error) {
    console.error('Get analysis history error:', error);
    throw new AppError('Failed to retrieve analysis history', 500, 'HISTORY_RETRIEVAL_FAILED');
  }
});

/**
 * POST /analyze/team - Team skill gap analysis
 * Analyzes gaps for multiple team members against project requirements
 */
analyze.post('/team', validateRequest(teamAnalysisRequestSchema), async (c: AuthenticatedContext) => {
  const startTime = Date.now();
  
  try {
    const { team_members, project_requirements, analysis_options } = (c.req as any).validatedData;
    
    // Initialize services
    const database = createDatabase(c.env.DB);
    const skillMatchingService = new SkillMatchingService(database);
    const gapAnalysisService = new GapAnalysisService(skillMatchingService);
    const jobAnalysisService = new JobAnalysisService();
    
    // Extract project requirements
    const projectSkillRequirements: JobSkillRequirement[] = await jobAnalysisService.analyzeJobDescription(
      project_requirements.description || `Project: ${project_requirements.name}. Required skills: ${project_requirements.required_skills.join(', ')}`,
      project_requirements.name
    ).then(result => result.skillRequirements);
    
    // Process each team member
    const teamAnalysisResults = [];
    const teamSkillsMap = new Map<string, number>(); // skill -> count of team members who have it
    const teamGapsMap = new Map<string, number>(); // skill -> count of team members who need it
    
    for (const member of team_members) {
      // Convert member skills to internal format
      const memberSkills: UserSkill[] = member.skills.map((skill: any) => ({
        skillId: crypto.randomUUID(),
        skillName: skill.skill,
        skillCategory: 'General',
        level: skill.level,
        yearsExperience: skill.years_experience || 0,
        confidenceScore: 0.8,
        certifications: skill.certifications || []
      }));
      
      // Perform individual gap analysis
      const memberGapAnalysis = await gapAnalysisService.analyzeGaps(memberSkills, projectSkillRequirements);
      
      // Track team-wide skills and gaps
      memberSkills.forEach(skill => {
        const count = teamSkillsMap.get(skill.skillName) || 0;
        teamSkillsMap.set(skill.skillName, count + 1);
      });
      
      memberGapAnalysis.skillGaps.forEach(gap => {
        const count = teamGapsMap.get(gap.skillName) || 0;
        teamGapsMap.set(gap.skillName, count + 1);
      });
      
      teamAnalysisResults.push({
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
      });
    }
    
    // Calculate team-wide statistics
    const teamSize = team_members.length;
    const teamOverallMatch = teamAnalysisResults.reduce((sum, member) => sum + member.overall_match, 0) / teamSize;
    
    // Identify critical team gaps (skills needed by most members)
    const criticalTeamGaps = Array.from(teamGapsMap.entries())
      .filter(([skill, count]) => count >= Math.ceil(teamSize * 0.5)) // 50% or more need this skill
      .map(([skill, count]) => ({
        skill_name: skill,
        members_needing: count,
        percentage_needing: Math.round((count / teamSize) * 100),
        severity: count >= Math.ceil(teamSize * 0.8) ? 'critical' : 'moderate'
      }))
      .sort((a, b) => b.members_needing - a.members_needing);
    
    // Identify team strengths (skills most members have)
    const teamStrengths = Array.from(teamSkillsMap.entries())
      .filter(([skill, count]) => count >= Math.ceil(teamSize * 0.6)) // 60% or more have this skill
      .map(([skill, count]) => ({
        skill_name: skill,
        members_having: count,
        percentage_having: Math.round((count / teamSize) * 100),
        coverage: count >= Math.ceil(teamSize * 0.8) ? 'excellent' : 'good'
      }))
      .sort((a, b) => b.members_having - a.members_having);
    
    // Generate team recommendations
    const teamRecommendations = {
      hiring_priorities: criticalTeamGaps
        .filter(gap => gap.severity === 'critical')
        .slice(0, 5)
        .map(gap => `Consider hiring for ${gap.skill_name} (${gap.percentage_needing}% of team needs this)`),
      
      training_priorities: criticalTeamGaps
        .filter(gap => gap.severity === 'moderate')
        .slice(0, 5)
        .map(gap => `Provide team training for ${gap.skill_name} (${gap.percentage_needing}% of team needs this)`),
      
      knowledge_sharing: teamStrengths
        .slice(0, 3)
        .map(strength => `Leverage team expertise in ${strength.skill_name} (${strength.percentage_having}% coverage)`),
      
      role_optimization: teamAnalysisResults
        .filter(member => member.overall_match < 60)
        .slice(0, 3)
        .map(member => `Consider role adjustment for ${member.member_name} (${member.overall_match}% match)`)
    };
    
    const processingTime = Date.now() - startTime;
    
    // Format response
    const response = {
      analysis_id: crypto.randomUUID(),
      user_id: c.user!.id,
      project: {
        name: project_requirements.name,
        description: project_requirements.description,
        timeline: project_requirements.timeline,
        priority: project_requirements.priority
      },
      team_summary: {
        total_members: teamSize,
        overall_match: Math.round(teamOverallMatch),
        critical_gaps_count: criticalTeamGaps.filter(gap => gap.severity === 'critical').length,
        team_strengths_count: teamStrengths.length
      },
      member_analyses: teamAnalysisResults,
      team_gaps: criticalTeamGaps,
      team_strengths: teamStrengths,
      recommendations: teamRecommendations,
      metadata: {
        processing_time: processingTime,
        analysis_timestamp: new Date().toISOString(),
        api_version: 'v1',
        team_size: teamSize,
        project_skills_analyzed: projectSkillRequirements.length
      }
    };
    
    // Store team analysis result (optional)
    if (analysis_options?.include_recommendations) {
      try {
        await c.env.DB
          .prepare(`
            INSERT INTO team_analyses (
              id, user_id, project_name, team_size, overall_match, 
              critical_gaps_count, created_at, analysis_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            response.analysis_id,
            c.user!.id,
            project_requirements.name,
            teamSize,
            Math.round(teamOverallMatch),
            criticalTeamGaps.filter(gap => gap.severity === 'critical').length,
            new Date().toISOString(),
            JSON.stringify(response)
          )
          .run();
      } catch (dbError) {
        // Log error but don't fail the request
        console.warn('Failed to store team analysis result:', dbError);
      }
    }
    
    return c.json(response, 200);
    
  } catch (error) {
    console.error('Team analysis error:', error);
    
    if (error instanceof AppError) {
      throw error;
    }
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('validation')) {
        throw new AppError('Invalid team analysis data', 400, 'VALIDATION_ERROR');
      }
      if (error.message.includes('timeout')) {
        throw new AppError('Team analysis request timed out', 408, 'TIMEOUT_ERROR');
      }
    }
    
    throw new AppError('Team analysis failed', 500, 'TEAM_ANALYSIS_FAILED');
  }
});

/**
 * GET /analyze/team/:analysisId - Retrieve previous team analysis
 */
analyze.get('/team/:analysisId', async (c: AuthenticatedContext) => {
  const analysisId = c.req.param('analysisId');
  
  try {
    const analysis = await c.env.DB
      .prepare('SELECT * FROM team_analyses WHERE id = ? AND user_id = ?')
      .bind(analysisId, c.user!.id)
      .first() as any;
    
    if (!analysis) {
      throw new AppError('Team analysis not found', 404, 'TEAM_ANALYSIS_NOT_FOUND');
    }
    
    const analysisData = JSON.parse(analysis.analysis_data);
    
    return c.json({
      ...analysisData,
      retrieved_at: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Retrieve team analysis error:', error);
    throw new AppError('Failed to retrieve team analysis', 500, 'TEAM_ANALYSIS_RETRIEVAL_FAILED');
  }
});

/**
 * GET /analyze/team/history - Get user's team analysis history
 */
analyze.get('/team/history', async (c: AuthenticatedContext) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);
    const offset = (page - 1) * limit;
    
    const analyses = await c.env.DB
      .prepare(`
        SELECT id, project_name, team_size, overall_match, critical_gaps_count, created_at
        FROM team_analyses 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `)
      .bind(c.user!.id, limit, offset)
      .all();
    
    const totalCount = await c.env.DB
      .prepare('SELECT COUNT(*) as count FROM team_analyses WHERE user_id = ?')
      .bind(c.user!.id)
      .first() as any;
    
    return c.json({
      analyses: analyses.results,
      pagination: {
        page,
        limit,
        total: totalCount?.count || 0,
        pages: Math.ceil((totalCount?.count || 0) / limit)
      }
    });
    
  } catch (error) {
    console.error('Get team analysis history error:', error);
    throw new AppError('Failed to retrieve team analysis history', 500, 'TEAM_HISTORY_RETRIEVAL_FAILED');
  }
});

export default analyze;