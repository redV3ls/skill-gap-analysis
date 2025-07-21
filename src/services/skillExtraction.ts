// Document parsing in Workers environment
// For production, use external services or pre-processed text
// Text processing for Workers environment
// Using built-in string methods instead of external NLP libraries
import { logger } from '../utils/logger';

export interface ExtractedSkill {
  skill: string;
  category: string;
  confidence: number;
  context: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsExperience?: number;
}

export interface DocumentParsingResult {
  text: string;
  skills: ExtractedSkill[];
  metadata: {
    wordCount: number;
    processingTime: number;
    documentType: string;
  };
}

export class SkillExtractionService {
  private skillKeywords: Map<string, string[]> = new Map();
  private experiencePatterns: RegExp[] = [];
  
  constructor() {
    this.initializeSkillKeywords();
    this.initializeExperiencePatterns();
  }

  /**
   * Parse PDF document and extract text
   * In Workers, this would use an external API service
   */
  async parsePDF(buffer: ArrayBuffer): Promise<string> {
    // In production, you would:
    // 1. Upload to a document parsing service API
    // 2. Or use Cloudflare R2 + Workers AI
    // 3. Or require pre-processed text from client
    throw new Error('PDF parsing requires external service in Workers environment');
  }

  /**
   * Parse DOCX document and extract text
   * In Workers, this would use an external API service
   */
  async parseDOCX(buffer: ArrayBuffer): Promise<string> {
    // In production, you would:
    // 1. Upload to a document parsing service API
    // 2. Or use Cloudflare R2 + Workers AI
    // 3. Or require pre-processed text from client
    throw new Error('DOCX parsing requires external service in Workers environment');
  }

  /**
   * Parse document based on file type
   */
  async parseDocument(buffer: ArrayBuffer, fileType: string): Promise<DocumentParsingResult> {
    const startTime = Date.now();
    let text: string;

    try {
      switch (fileType.toLowerCase()) {
        case 'pdf':
          text = await this.parsePDF(buffer);
          break;
        case 'docx':
        case 'doc':
          text = await this.parseDOCX(buffer);
          break;
        case 'txt':
          text = new TextDecoder().decode(buffer);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      const skills = await this.extractSkills(text);
      const processingTime = Date.now() - startTime;

      return {
        text,
        skills,
        metadata: {
          wordCount: text.split(/\s+/).length,
          processingTime,
          documentType: fileType
        }
      };
    } catch (error) {
      logger.error('Document parsing failed:', error);
      throw error;
    }
  }

  /**
   * Extract skills from text using NLP and pattern matching
   */
  async extractSkills(text: string): Promise<ExtractedSkill[]> {
    const skills: ExtractedSkill[] = [];
    const normalizedText = text.toLowerCase();
    
    // Extract technical skills using keyword matching
    for (const [category, keywords] of this.skillKeywords.entries()) {
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          const matchedText = match[0];
          const matchIndex = match.index;
          
          // Extract context around this specific match
          const context = this.extractContextAtIndex(text, matchIndex, matchedText.length);
          const experienceLevel = this.inferExperienceLevel(context, matchedText);
          const yearsExperience = this.extractYearsExperience(context, matchedText);
          
          skills.push({
            skill: matchedText,
            category,
            confidence: this.calculateConfidence(context, matchedText),
            context,
            experienceLevel,
            yearsExperience
          });
        }
      }
    }

    // Extract skills from technical sections
    const techSections = this.extractTechnicalSections(text);
    
    // Process technical sections for additional skills
    for (const section of techSections) {
      const sectionSkills = await this.extractSkillsFromSection(section);
      skills.push(...sectionSkills);
    }

    // Remove duplicates and sort by confidence
    return this.deduplicateSkills(skills);
  }

  /**
   * Infer experience level from context
   */
  private inferExperienceLevel(context: string, skill: string): 'beginner' | 'intermediate' | 'advanced' | 'expert' | undefined {
    const lowerContext = context.toLowerCase();
    const lowerSkill = skill.toLowerCase();
    
    // Look for explicit level mentions in the immediate context (smaller window)
    const skillIndex = lowerContext.indexOf(lowerSkill);
    if (skillIndex !== -1) {
      // Use a smaller context window to avoid picking up other skills' levels
      const nearContext = lowerContext.substring(Math.max(0, skillIndex - 30), skillIndex + lowerSkill.length + 30);
      
      // Beginner level indicators (check first as they're more specific)
      if (nearContext.includes('beginner') || nearContext.includes('basic') ||
          nearContext.includes('familiar with') || nearContext.includes('exposure to') ||
          nearContext.includes('beginner level')) {
        return 'beginner';
      }
      
      // Expert level indicators
      if (nearContext.includes('expert') || nearContext.includes('lead') || 
          nearContext.includes('senior') || nearContext.includes('architect')) {
        return 'expert';
      }
      
      // Advanced level indicators
      if (nearContext.includes('advanced') || nearContext.includes('proficient') ||
          nearContext.includes('extensive experience') || nearContext.includes('advanced knowledge')) {
        return 'advanced';
      }
      
      // Intermediate level indicators
      if (nearContext.includes('intermediate') || nearContext.includes('experienced') ||
          nearContext.includes('solid understanding') || nearContext.includes('intermediate sql')) {
        return 'intermediate';
      }
    }
    
    return undefined;
  }

  /**
   * Extract years of experience from context for a specific skill
   */
  private extractYearsExperience(context: string, skill?: string): number | undefined {
    const lowerContext = context.toLowerCase();
    const lowerSkill = skill?.toLowerCase();
    
    // If we have a skill, look for patterns that are close to the skill mention
    if (lowerSkill) {
      const skillIndex = lowerContext.indexOf(lowerSkill);
      if (skillIndex !== -1) {
        // Look in a smaller window around the skill
        const beforeSkill = lowerContext.substring(Math.max(0, skillIndex - 30), skillIndex);
        const afterSkill = lowerContext.substring(skillIndex + lowerSkill.length, Math.min(lowerContext.length, skillIndex + lowerSkill.length + 30));
        
        // Patterns that come before the skill
        const beforePatterns = [
          /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)\s*with\s*$/i,
          /(\d+)\+?\s*yrs?\s*(?:of\s*)?(?:experience|exp)\s*with\s*$/i,
        ];
        
        // Patterns that come after the skill
        const afterPatterns = [
          /^\s*for\s*(\d+)\+?\s*years?/i,
          /^\s*\(\s*(\d+)\+?\s*years?\)/i,
        ];
        
        // Check before patterns
        for (const pattern of beforePatterns) {
          const match = beforeSkill.match(pattern);
          if (match) {
            return parseInt(match[1]);
          }
        }
        
        // Check after patterns
        for (const pattern of afterPatterns) {
          const match = afterSkill.match(pattern);
          if (match) {
            return parseInt(match[1]);
          }
        }
      }
    }
    
    // Fallback to general patterns
    const yearPatterns = [
      // "worked with X for N years" - most specific for this context
      /worked\s*with\s*[\w\s]*?for\s*(\d+)\+?\s*years?/i,
      // "N years of experience with X"
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)\s*with/i,
      // "N years experience in X"
      /(\d+)\+?\s*years?\s*(?:experience|exp)\s*in/i,
      // "N yrs experience in X"
      /(\d+)\+?\s*yrs?\s*(?:experience|exp)\s*in/i,
      // General patterns (less specific)
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/i,
      /(\d+)\+?\s*yrs?\s*(?:of\s*)?(?:experience|exp)/i,
      /(\d+)\+?\s*years?\s*working\s*with/i,
      /(\d+)\+?\s*years?\s*(?:in|with)/i
    ];
    
    // Look for the most specific pattern first
    for (const pattern of yearPatterns) {
      const match = context.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    return undefined;
  }

  /**
   * Extract context around a skill mention
   */
  private extractContext(text: string, skill: string, contextLength: number = 100): string {
    const index = text.toLowerCase().indexOf(skill.toLowerCase());
    if (index === -1) return '';
    
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + skill.length + contextLength);
    
    return text.substring(start, end);
  }

  /**
   * Extract context around a skill mention at a specific index
   */
  private extractContextAtIndex(text: string, index: number, skillLength: number, contextLength: number = 40): string {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + skillLength + contextLength);
    
    return text.substring(start, end);
  }

  /**
   * Calculate confidence score for skill extraction
   */
  private calculateConfidence(context: string, skill: string): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence if in technical section
    if (this.isTechnicalSection(context)) {
      confidence += 0.3;
    }
    
    // Increase confidence if has experience indicators
    if (this.hasExperienceIndicators(context)) {
      confidence += 0.2;
    }
    
    // Increase confidence if skill is capitalized properly
    if (skill === skill.toUpperCase() || this.isProperlyCapitalized(skill)) {
      confidence += 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Check if context is in a technical section
   */
  private isTechnicalSection(context: string): boolean {
    const technicalSectionKeywords = [
      'technical skills', 'technologies', 'programming languages',
      'frameworks', 'tools', 'software', 'platforms'
    ];
    
    const lowerContext = context.toLowerCase();
    return technicalSectionKeywords.some(keyword => lowerContext.includes(keyword));
  }

  /**
   * Check if context has experience indicators
   */
  private hasExperienceIndicators(context: string): boolean {
    const experienceKeywords = [
      'years', 'experience', 'worked with', 'used', 'developed',
      'implemented', 'proficient', 'expert', 'advanced'
    ];
    
    const lowerContext = context.toLowerCase();
    return experienceKeywords.some(keyword => lowerContext.includes(keyword));
  }

  /**
   * Check if skill name is properly capitalized
   */
  private isProperlyCapitalized(skill: string): boolean {
    // Common proper capitalizations for tech skills
    const properCapitalizations = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#',
      'React', 'Angular', 'Vue', 'Node.js', 'MongoDB', 'PostgreSQL'
    ];
    
    return properCapitalizations.includes(skill);
  }

  /**
   * Extract technical sections from resume text
   */
  private extractTechnicalSections(text: string): string[] {
    const sections: string[] = [];
    const sectionHeaders = [
      'technical skills', 'skills', 'technologies', 'programming languages',
      'tools and technologies', 'technical expertise', 'core competencies'
    ];
    
    for (const header of sectionHeaders) {
      const regex = new RegExp(`${header}[:\\s]*([\\s\\S]*?)(?=\\n\\n|\\n[A-Z][^\\n]*:|$)`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        sections.push(match[1].trim());
      }
    }
    
    return sections;
  }

  /**
   * Extract skills from a specific section
   */
  private async extractSkillsFromSection(section: string): Promise<ExtractedSkill[]> {
    const skills: ExtractedSkill[] = [];
    
    // Split by common delimiters
    const items = section.split(/[,;•\n\r]/).map(item => item.trim()).filter(item => item.length > 0);
    
    for (const item of items) {
      // Check if item matches known skills
      const matchedSkill = this.findMatchingSkill(item);
      if (matchedSkill) {
        skills.push({
          skill: matchedSkill.skill,
          category: matchedSkill.category,
          confidence: 0.8, // Higher confidence for skills in dedicated sections
          context: item,
          experienceLevel: this.inferExperienceLevel(item, matchedSkill.skill)
        });
      }
    }
    
    return skills;
  }

  /**
   * Find matching skill from keywords
   */
  private findMatchingSkill(text: string): { skill: string; category: string } | null {
    const normalizedText = text.toLowerCase().trim();
    
    for (const [category, keywords] of this.skillKeywords.entries()) {
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword.toLowerCase()) || 
            keyword.toLowerCase().includes(normalizedText)) {
          return { skill: keyword, category };
        }
      }
    }
    
    return null;
  }

  /**
   * Remove duplicate skills and sort by confidence
   */
  private deduplicateSkills(skills: ExtractedSkill[]): ExtractedSkill[] {
    const skillMap = new Map<string, ExtractedSkill>();
    
    for (const skill of skills) {
      const key = skill.skill.toLowerCase();
      const existing = skillMap.get(key);
      
      if (!existing || skill.confidence > existing.confidence) {
        skillMap.set(key, skill);
      }
    }
    
    return Array.from(skillMap.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Initialize skill keywords database
   */
  private initializeSkillKeywords(): void {
    this.skillKeywords = new Map([
      ['Programming Languages', [
        'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust',
        'PHP', 'Ruby', 'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Perl'
      ]],
      ['Web Technologies', [
        'HTML', 'CSS', 'React', 'Angular', 'Vue.js', 'Node.js', 'Express',
        'Next.js', 'Nuxt.js', 'Svelte', 'jQuery', 'Bootstrap', 'Tailwind CSS'
      ]],
      ['Databases', [
        'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle',
        'SQL Server', 'Cassandra', 'DynamoDB', 'Elasticsearch'
      ]],
      ['Cloud Platforms', [
        'AWS', 'Azure', 'Google Cloud', 'Heroku', 'DigitalOcean',
        'Cloudflare', 'Vercel', 'Netlify'
      ]],
      ['DevOps & Tools', [
        'Docker', 'Kubernetes', 'Jenkins', 'Git', 'GitHub', 'GitLab',
        'CI/CD', 'Terraform', 'Ansible', 'Nginx', 'Apache'
      ]],
      ['Mobile Development', [
        'React Native', 'Flutter', 'iOS', 'Android', 'Xamarin', 'Ionic'
      ]],
      ['Data Science & ML', [
        'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch',
        'Pandas', 'NumPy', 'Scikit-learn', 'Jupyter', 'Tableau', 'Power BI'
      ]]
    ]);
  }

  /**
   * Initialize experience level patterns
   */
  private initializeExperiencePatterns(): void {
    this.experiencePatterns = [
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/i,
      /(\d+)\+?\s*yrs?\s*(?:of\s*)?(?:experience|exp)/i,
      /(beginner|novice|entry.level)/i,
      /(intermediate|mid.level)/i,
      /(advanced|senior|expert|lead)/i
    ];
  }
}