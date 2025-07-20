import { SkillExtractionService, ExtractedSkill } from './skillExtraction';
import { logger } from '../utils/logger';

export interface JobSkillRequirement {
  skill: string;
  category: string;
  importance: 'critical' | 'important' | 'nice-to-have';
  minimumLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsRequired?: number;
  confidence: number;
  context: string;
}

export interface JobAnalysisResult {
  jobTitle: string;
  company?: string;
  location?: string;
  industry?: string;
  skillRequirements: JobSkillRequirement[];
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  experienceLevel: 'entry' | 'mid' | 'senior' | 'executive';
  jobType: 'full-time' | 'part-time' | 'contract' | 'internship' | 'remote';
  metadata: {
    wordCount: number;
    processingTime: number;
    totalSkillsFound: number;
    criticalSkillsCount: number;
  };
}

export class JobAnalysisService {
  private skillExtractor: SkillExtractionService;
  private importanceKeywords: Map<string, string[]> = new Map();
  private levelKeywords: Map<string, string[]> = new Map();
  private sectionKeywords: Map<string, string[]> = new Map();

  constructor() {
    this.skillExtractor = new SkillExtractionService();
    this.initializeKeywords();
  }

  /**
   * Analyze job description and extract skill requirements
   */
  async analyzeJobDescription(jobDescription: string, jobTitle?: string): Promise<JobAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Extract basic job information
      const jobInfo = this.extractJobInfo(jobDescription, jobTitle);
      
      // Extract skills from the job description
      const extractedSkills = await this.skillExtractor.extractSkills(jobDescription);
      
      // Analyze skill importance and requirements
      const skillRequirements = this.analyzeSkillRequirements(jobDescription, extractedSkills);
      
      // Determine experience level and job type
      const experienceLevel = this.determineExperienceLevel(jobDescription);
      const jobType = this.determineJobType(jobDescription);
      
      // Extract salary information
      const salaryRange = this.extractSalaryRange(jobDescription);
      
      const processingTime = Date.now() - startTime;
      
      return {
        jobTitle: jobInfo.title,
        company: jobInfo.company,
        location: jobInfo.location,
        industry: jobInfo.industry,
        skillRequirements,
        salaryRange,
        experienceLevel,
        jobType,
        metadata: {
          wordCount: jobDescription.split(/\s+/).length,
          processingTime,
          totalSkillsFound: skillRequirements.length,
          criticalSkillsCount: skillRequirements.filter(s => s.importance === 'critical').length
        }
      };
    } catch (error) {
      logger.error('Job analysis failed:', error);
      throw new Error(`Failed to analyze job description: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract basic job information from description
   */
  private extractJobInfo(jobDescription: string, jobTitle?: string): {
    title: string;
    company?: string;
    location?: string;
    industry?: string;
  } {
    const result: any = {
      title: jobTitle || this.extractJobTitle(jobDescription) || 'Unknown Position'
    };

    // Extract company name
    const companyMatch = jobDescription.match(/(?:company|organization|employer):\s*([^\n]+)/i) ||
                        jobDescription.match(/at\s+([A-Z][a-zA-Z\s&]+)(?:\s|,|\.)/);
    if (companyMatch) {
      result.company = companyMatch[1].trim();
    }

    // Extract location
    const locationMatch = jobDescription.match(/(?:location|based in|office in):\s*([^\n]+)/i) ||
                         jobDescription.match(/([A-Z][a-z]+,\s*[A-Z]{2})/);
    if (locationMatch) {
      result.location = locationMatch[1].trim();
    }

    // Extract industry (basic pattern matching)
    const industryKeywords = {
      'Technology': ['software', 'tech', 'IT', 'development', 'programming'],
      'Healthcare': ['healthcare', 'medical', 'hospital', 'clinical'],
      'Finance': ['finance', 'banking', 'investment', 'financial'],
      'Education': ['education', 'university', 'school', 'academic'],
      'Retail': ['retail', 'e-commerce', 'sales', 'customer service']
    };

    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some(keyword => jobDescription.toLowerCase().includes(keyword))) {
        result.industry = industry;
        break;
      }
    }

    return result;
  }

  /**
   * Extract job title from description if not provided
   */
  private extractJobTitle(jobDescription: string): string | null {
    const titlePatterns = [
      /job title:\s*([^\n]+)/i,
      /position:\s*([^\n]+)/i,
      /role:\s*([^\n]+)/i,
      /^([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Manager|Analyst|Specialist|Coordinator))/m
    ];

    for (const pattern of titlePatterns) {
      const match = jobDescription.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Analyze skill requirements and determine importance
   */
  private analyzeSkillRequirements(jobDescription: string, extractedSkills: ExtractedSkill[]): JobSkillRequirement[] {
    const requirements: JobSkillRequirement[] = [];
    const lowerDescription = jobDescription.toLowerCase();

    for (const skill of extractedSkills) {
      const importance = this.determineSkillImportance(jobDescription, skill);
      const minimumLevel = this.determineMinimumLevel(jobDescription, skill);
      const yearsRequired = this.extractRequiredYears(jobDescription, skill);

      requirements.push({
        skill: skill.skill,
        category: skill.category,
        importance,
        minimumLevel,
        yearsRequired,
        confidence: skill.confidence,
        context: skill.context
      });
    }

    // Sort by importance and confidence
    return requirements.sort((a, b) => {
      const importanceOrder = { 'critical': 3, 'important': 2, 'nice-to-have': 1 };
      const importanceDiff = importanceOrder[b.importance] - importanceOrder[a.importance];
      if (importanceDiff !== 0) return importanceDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Determine skill importance based on context
   */
  private determineSkillImportance(jobDescription: string, skill: ExtractedSkill): 'critical' | 'important' | 'nice-to-have' {
    const lowerDescription = jobDescription.toLowerCase();
    const lowerSkill = skill.skill.toLowerCase();
    
    // Find skill mentions and analyze surrounding context
    const skillIndex = lowerDescription.indexOf(lowerSkill);
    if (skillIndex === -1) return 'nice-to-have';

    const contextBefore = lowerDescription.substring(Math.max(0, skillIndex - 100), skillIndex);
    const contextAfter = lowerDescription.substring(skillIndex + lowerSkill.length, Math.min(lowerDescription.length, skillIndex + lowerSkill.length + 100));
    const fullContext = contextBefore + lowerSkill + contextAfter;

    // Critical indicators
    const criticalKeywords = [
      'required', 'must have', 'essential', 'mandatory', 'critical',
      'minimum requirement', 'non-negotiable', 'prerequisite'
    ];

    // Important indicators
    const importantKeywords = [
      'preferred', 'desired', 'strong', 'proficient', 'experience with',
      'knowledge of', 'familiar with', 'working knowledge'
    ];

    // Nice-to-have indicators
    const niceToHaveKeywords = [
      'nice to have', 'bonus', 'plus', 'additional', 'would be great',
      'advantage', 'beneficial', 'helpful'
    ];

    // Check for critical indicators first
    if (criticalKeywords.some(keyword => fullContext.includes(keyword))) {
      return 'critical';
    }

    // Check for nice-to-have indicators
    if (niceToHaveKeywords.some(keyword => fullContext.includes(keyword))) {
      return 'nice-to-have';
    }

    // Check for important indicators or default to important
    if (importantKeywords.some(keyword => fullContext.includes(keyword))) {
      return 'important';
    }

    // Check section context
    const section = this.identifySection(jobDescription, skillIndex);
    if (section === 'requirements' || section === 'qualifications') {
      return 'critical';
    } else if (section === 'preferred' || section === 'nice-to-have') {
      return 'nice-to-have';
    }

    return 'important'; // Default
  }

  /**
   * Determine minimum skill level required
   */
  private determineMinimumLevel(jobDescription: string, skill: ExtractedSkill): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
    const lowerDescription = jobDescription.toLowerCase();
    const lowerSkill = skill.skill.toLowerCase();
    
    const skillIndex = lowerDescription.indexOf(lowerSkill);
    if (skillIndex === -1) return 'intermediate'; // Default

    // Use a smaller context window focused around the skill
    const beforeSkill = lowerDescription.substring(Math.max(0, skillIndex - 20), skillIndex);
    const afterSkill = lowerDescription.substring(skillIndex + lowerSkill.length, Math.min(lowerDescription.length, skillIndex + lowerSkill.length + 20));
    const skillContext = beforeSkill + lowerSkill + afterSkill;

    // Also check the skill's extracted context from the skill extraction service
    const extractedContext = skill.context?.toLowerCase() || '';

    // Look for level indicators that are close to the skill mention
    // Expert level indicators (check first as they're most specific)
    if (beforeSkill.includes('expert') || afterSkill.includes('expert') ||
        extractedContext.includes('expert') || skillContext.includes('mastery') || 
        skillContext.includes('deep expertise')) {
      return 'expert';
    }

    // Advanced level indicators
    if (beforeSkill.includes('advanced') || afterSkill.includes('advanced') ||
        extractedContext.includes('advanced') || skillContext.includes('senior level') || 
        skillContext.includes('extensive experience')) {
      return 'advanced';
    }

    // Beginner level indicators
    if (beforeSkill.includes('basic') || afterSkill.includes('basic') ||
        extractedContext.includes('basic') || beforeSkill.includes('entry level') || 
        afterSkill.includes('entry level') || extractedContext.includes('entry level') ||
        beforeSkill.includes('fundamental') || afterSkill.includes('fundamental') ||
        extractedContext.includes('fundamental')) {
      return 'beginner';
    }

    return 'intermediate'; // Default
  }

  /**
   * Extract required years of experience for a skill
   */
  private extractRequiredYears(jobDescription: string, skill: ExtractedSkill): number | undefined {
    const lowerDescription = jobDescription.toLowerCase();
    const lowerSkill = skill.skill.toLowerCase();
    
    const skillIndex = lowerDescription.indexOf(lowerSkill);
    if (skillIndex === -1) return undefined;

    // Use a smaller context window to avoid picking up other skills' requirements
    const context = lowerDescription.substring(
      Math.max(0, skillIndex - 50),
      Math.min(lowerDescription.length, skillIndex + lowerSkill.length + 50)
    );

    const yearPatterns = [
      // More specific patterns first
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)\s*with/i,
      /minimum\s*(\d+)\+?\s*years?\s*with/i,
      /at\s*least\s*(\d+)\+?\s*years?\s*of/i,
      /(\d+)\+?\s*years?\s*of\s*[\w\s]*?(?:experience|exp)/i,
      /(\d+)\+?\s*years?\s*minimum/i,
      // General patterns
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/i,
      /minimum\s*(?:of\s*)?(\d+)\+?\s*years?/i
    ];

    for (const pattern of yearPatterns) {
      const match = context.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }

    return undefined;
  }

  /**
   * Identify which section of the job description a skill appears in
   */
  private identifySection(jobDescription: string, skillIndex: number): string {
    const beforeText = jobDescription.substring(0, skillIndex).toLowerCase();
    
    // Find the last section header before the skill
    const sectionHeaders = [
      { pattern: /(?:required|requirements|qualifications|must have):/i, type: 'requirements' },
      { pattern: /(?:preferred|nice to have|bonus|plus):/i, type: 'preferred' },
      { pattern: /(?:responsibilities|duties|role):/i, type: 'responsibilities' },
      { pattern: /(?:skills|technical skills):/i, type: 'skills' }
    ];

    let lastSection = 'general';
    let lastIndex = -1;

    for (const header of sectionHeaders) {
      const match = beforeText.match(header.pattern);
      if (match && match.index !== undefined && match.index > lastIndex) {
        lastIndex = match.index;
        lastSection = header.type;
      }
    }

    return lastSection;
  }

  /**
   * Determine overall experience level required for the job
   */
  private determineExperienceLevel(jobDescription: string): 'entry' | 'mid' | 'senior' | 'executive' {
    const lowerDescription = jobDescription.toLowerCase();

    // Executive level indicators
    if (lowerDescription.includes('executive') || lowerDescription.includes('director') ||
        lowerDescription.includes('vp') || lowerDescription.includes('chief')) {
      return 'executive';
    }

    // Senior level indicators
    if (lowerDescription.includes('senior') || lowerDescription.includes('lead') ||
        lowerDescription.includes('principal') || lowerDescription.includes('architect')) {
      return 'senior';
    }

    // Entry level indicators
    if (lowerDescription.includes('entry level') || lowerDescription.includes('junior') ||
        lowerDescription.includes('graduate') || lowerDescription.includes('intern')) {
      return 'entry';
    }

    // Check for years of experience requirements
    const yearsMatch = lowerDescription.match(/(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/);
    if (yearsMatch) {
      const years = parseInt(yearsMatch[1]);
      if (years >= 8) return 'senior';
      if (years >= 3) return 'mid';
      if (years <= 2) return 'entry';
    }

    return 'mid'; // Default
  }

  /**
   * Determine job type from description
   */
  private determineJobType(jobDescription: string): 'full-time' | 'part-time' | 'contract' | 'internship' | 'remote' {
    const lowerDescription = jobDescription.toLowerCase();

    if (lowerDescription.includes('internship') || lowerDescription.includes('intern')) {
      return 'internship';
    }

    if (lowerDescription.includes('contract') || lowerDescription.includes('contractor') ||
        lowerDescription.includes('freelance') || lowerDescription.includes('temporary')) {
      return 'contract';
    }

    if (lowerDescription.includes('part-time') || lowerDescription.includes('part time')) {
      return 'part-time';
    }

    if (lowerDescription.includes('remote') || lowerDescription.includes('work from home') ||
        lowerDescription.includes('distributed')) {
      return 'remote';
    }

    return 'full-time'; // Default
  }

  /**
   * Extract salary range from job description
   */
  private extractSalaryRange(jobDescription: string): { min?: number; max?: number; currency?: string } | undefined {
    const salaryPatterns = [
      /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
      /salary:\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*-\s*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i,
      /(\d{1,3}(?:,\d{3})*)\s*-\s*(\d{1,3}(?:,\d{3})*)\s*(?:USD|dollars?)/i
    ];

    for (const pattern of salaryPatterns) {
      const match = jobDescription.match(pattern);
      if (match) {
        const min = parseInt(match[1].replace(/,/g, ''));
        const max = parseInt(match[2].replace(/,/g, ''));
        return {
          min,
          max,
          currency: 'USD'
        };
      }
    }

    return undefined;
  }

  /**
   * Initialize keyword mappings for analysis
   */
  private initializeKeywords(): void {
    this.importanceKeywords = new Map([
      ['critical', ['required', 'must have', 'essential', 'mandatory', 'critical', 'minimum requirement']],
      ['important', ['preferred', 'desired', 'strong', 'proficient', 'experience with', 'knowledge of']],
      ['nice-to-have', ['nice to have', 'bonus', 'plus', 'additional', 'would be great', 'advantage']]
    ]);

    this.levelKeywords = new Map([
      ['expert', ['expert', 'mastery', 'deep expertise', 'thought leader', 'guru']],
      ['advanced', ['advanced', 'senior level', 'extensive experience', 'lead', 'principal']],
      ['intermediate', ['intermediate', 'solid', 'good understanding', 'working knowledge']],
      ['beginner', ['entry level', 'junior', 'basic', 'fundamental', 'introductory']]
    ]);

    this.sectionKeywords = new Map([
      ['requirements', ['requirements', 'qualifications', 'must have', 'required skills']],
      ['preferred', ['preferred', 'nice to have', 'bonus', 'plus', 'desired']],
      ['responsibilities', ['responsibilities', 'duties', 'role', 'you will']],
      ['skills', ['skills', 'technical skills', 'technologies', 'tools']]
    ]);
  }

  /**
   * Get skill importance statistics from job analysis
   */
  getSkillImportanceStats(skillRequirements: JobSkillRequirement[]): {
    critical: number;
    important: number;
    niceToHave: number;
    totalSkills: number;
  } {
    const stats = {
      critical: 0,
      important: 0,
      niceToHave: 0,
      totalSkills: skillRequirements.length
    };

    for (const skill of skillRequirements) {
      switch (skill.importance) {
        case 'critical':
          stats.critical++;
          break;
        case 'important':
          stats.important++;
          break;
        case 'nice-to-have':
          stats.niceToHave++;
          break;
      }
    }

    return stats;
  }

  /**
   * Filter skills by importance level
   */
  filterSkillsByImportance(skillRequirements: JobSkillRequirement[], importance: 'critical' | 'important' | 'nice-to-have'): JobSkillRequirement[] {
    return skillRequirements.filter(skill => skill.importance === importance);
  }

  /**
   * Get skills by category
   */
  getSkillsByCategory(skillRequirements: JobSkillRequirement[]): Map<string, JobSkillRequirement[]> {
    const categoryMap = new Map<string, JobSkillRequirement[]>();

    for (const skill of skillRequirements) {
      if (!categoryMap.has(skill.category)) {
        categoryMap.set(skill.category, []);
      }
      categoryMap.get(skill.category)!.push(skill);
    }

    return categoryMap;
  }
}

export const jobAnalysisService = new JobAnalysisService();