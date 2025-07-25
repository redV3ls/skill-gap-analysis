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
    const startTime = performance.now();
    let text: string;

    try {
      const normalizedFileType = fileType.toLowerCase();
      
      switch (normalizedFileType) {
        case 'pdf':
          try {
            text = await this.parsePDF(buffer);
          } catch (error) {
            logger.warn(`PDF parsing not available in Workers environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error('PDF parsing requires external service. Please convert to text format or use a document parsing service.');
          }
          break;
        case 'docx':
        case 'doc':
          try {
            text = await this.parseDOCX(buffer);
          } catch (error) {
            logger.warn(`DOCX parsing not available in Workers environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error('DOCX parsing requires external service. Please convert to text format or use a document parsing service.');
          }
          break;
        case 'txt':
          text = new TextDecoder('utf-8').decode(buffer);
          break;
        default:
          const supportedTypes = ['pdf', 'docx', 'doc', 'txt'];
          throw new Error(`Unsupported file type: ${fileType}. Supported types: ${supportedTypes.join(', ')}`);
      }

      const skills = await this.extractSkills(text);
      const processingTime = Math.round((performance.now() - startTime) * 100) / 100; // Round to 2 decimal places

      return {
        text,
        skills,
        metadata: {
          wordCount: this.countWords(text),
          processingTime,
          documentType: normalizedFileType
        }
      };
    } catch (error) {
      const processingTime = Math.round((performance.now() - startTime) * 100) / 100;
      logger.error('Document parsing failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fileType,
        processingTime,
        bufferSize: buffer.byteLength
      });
      throw error;
    }
  }

  /**
   * Extract skills from text using optimized pattern matching
   */
  async extractSkills(text: string): Promise<ExtractedSkill[]> {
    const startTime = performance.now();
    const skills: ExtractedSkill[] = [];
    
    // Pre-compile regex patterns for better performance
    const compiledPatterns = this.getCompiledPatterns();
    
    // Single pass through text for all skill categories
    for (const [category, patterns] of compiledPatterns.entries()) {
      for (const { keyword, regex } of patterns) {
        let match;
        
        // Reset regex lastIndex for global patterns
        regex.lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
          const matchedText = match[0];
          const matchIndex = match.index;
          
          // Extract context around this specific match (optimized)
          const context = this.extractContextAtIndex(text, matchIndex, matchedText.length, 40);
          const experienceLevel = this.inferExperienceLevel(context, matchedText);
          const yearsExperience = this.extractYearsExperience(context, matchedText);
          
          skills.push({
            skill: keyword, // Use original keyword for consistency
            category,
            confidence: this.calculateConfidence(context, matchedText),
            context,
            experienceLevel,
            yearsExperience
          });
          
          // Prevent infinite loops with global regex
          if (!regex.global) break;
        }
      }
    }

    // Extract skills from technical sections (optimized)
    const techSections = this.extractTechnicalSections(text);
    
    // Process technical sections for additional skills
    for (const section of techSections) {
      const sectionSkills = await this.extractSkillsFromSection(section);
      skills.push(...sectionSkills);
    }

    // Remove duplicates and sort by confidence
    const deduplicatedSkills = this.deduplicateSkills(skills);
    
    const processingTime = performance.now() - startTime;
    logger.debug(`Skill extraction completed in ${processingTime.toFixed(2)}ms, found ${deduplicatedSkills.length} skills`);
    
    return deduplicatedSkills;
  }

  /**
   * Infer experience level from context (optimized)
   */
  private inferExperienceLevel(context: string, skill: string): 'beginner' | 'intermediate' | 'advanced' | 'expert' | undefined {
    const lowerContext = context.toLowerCase();
    const lowerSkill = skill.toLowerCase();
    
    // Look for explicit level mentions in the immediate context
    const skillIndex = lowerContext.indexOf(lowerSkill);
    if (skillIndex === -1) return undefined;
    
    // Use a focused context window around the skill mention
    const windowSize = 30;
    const nearContext = lowerContext.substring(
      Math.max(0, skillIndex - windowSize), 
      skillIndex + lowerSkill.length + windowSize
    );
    
    // Pre-compiled patterns for better performance
    const levelPatterns = {
      beginner: /\b(?:beginner|basic|familiar\s+with|exposure\s+to|beginner\s+level|entry\s+level)\b/,
      expert: /\b(?:expert|lead|senior|architect|master|guru)\b/,
      advanced: /\b(?:advanced|proficient|extensive\s+experience|advanced\s+knowledge|deep\s+understanding)\b/,
      intermediate: /\b(?:intermediate|experienced|solid\s+understanding|competent|working\s+knowledge)\b/
    };
    
    // Check patterns in order of specificity
    for (const [level, pattern] of Object.entries(levelPatterns)) {
      if (pattern.test(nearContext)) {
        return level as 'beginner' | 'intermediate' | 'advanced' | 'expert';
      }
    }
    
    return undefined;
  }

  /**
   * Extract years of experience from context for a specific skill (optimized)
   */
  private extractYearsExperience(context: string, skill?: string): number | undefined {
    const lowerContext = context.toLowerCase();
    const lowerSkill = skill?.toLowerCase();
    
    // Pre-compiled patterns for better performance
    const specificPatterns = {
      before: [
        /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)\s*with\s*$/i,
        /(\d+)\+?\s*yrs?\s*(?:of\s*)?(?:experience|exp)\s*with\s*$/i,
      ],
      after: [
        /^\s*for\s*(\d+)\+?\s*years?/i,
        /^\s*\(\s*(\d+)\+?\s*years?\)/i,
      ]
    };
    
    // If we have a skill, look for patterns close to the skill mention
    if (lowerSkill) {
      const skillIndex = lowerContext.indexOf(lowerSkill);
      if (skillIndex !== -1) {
        const windowSize = 30;
        const beforeSkill = lowerContext.substring(Math.max(0, skillIndex - windowSize), skillIndex);
        const afterSkill = lowerContext.substring(
          skillIndex + lowerSkill.length, 
          Math.min(lowerContext.length, skillIndex + lowerSkill.length + windowSize)
        );
        
        // Check before patterns
        for (const pattern of specificPatterns.before) {
          const match = beforeSkill.match(pattern);
          if (match) {
            const years = parseInt(match[1]);
            return isNaN(years) ? undefined : Math.min(years, 50); // Cap at 50 years for sanity
          }
        }
        
        // Check after patterns
        for (const pattern of specificPatterns.after) {
          const match = afterSkill.match(pattern);
          if (match) {
            const years = parseInt(match[1]);
            return isNaN(years) ? undefined : Math.min(years, 50);
          }
        }
      }
    }
    
    // Fallback to general patterns (ordered by specificity)
    const generalPatterns = [
      /worked\s*with\s*[\w\s]*?for\s*(\d+)\+?\s*years?/i,
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)\s*with/i,
      /(\d+)\+?\s*years?\s*(?:experience|exp)\s*in/i,
      /(\d+)\+?\s*yrs?\s*(?:experience|exp)\s*in/i,
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/i,
      /(\d+)\+?\s*yrs?\s*(?:of\s*)?(?:experience|exp)/i,
      /(\d+)\+?\s*years?\s*working\s*with/i,
      /(\d+)\+?\s*years?\s*(?:in|with)/i
    ];
    
    for (const pattern of generalPatterns) {
      const match = context.match(pattern);
      if (match) {
        const years = parseInt(match[1]);
        return isNaN(years) ? undefined : Math.min(years, 50);
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
   * Extract technical sections from resume text (optimized)
   */
  private extractTechnicalSections(text: string): string[] {
    const sections: string[] = [];
    
    // Pre-compiled regex patterns for better performance
    const sectionPatterns = [
      /technical\s+skills[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i,
      /(?:^|\n)\s*skills[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i,
      /technologies[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i,
      /programming\s+languages[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i,
      /tools\s+and\s+technologies[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i,
      /technical\s+expertise[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i,
      /core\s+competencies[:\s]*([^]*?)(?=\n\n|\n[A-Z][^\n]*:|$)/i
    ];
    
    for (const pattern of sectionPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim()) {
        sections.push(match[1].trim());
      }
    }
    
    return sections;
  }

  /**
   * Extract skills from a specific section (optimized)
   */
  private async extractSkillsFromSection(section: string): Promise<ExtractedSkill[]> {
    const skills: ExtractedSkill[] = [];
    
    if (!section || section.trim().length === 0) {
      return skills;
    }
    
    // Split by common delimiters (optimized regex)
    const items = section
      .split(/[,;•\n\r]+/)
      .map(item => item.trim())
      .filter(item => item.length > 2); // Filter out very short items
    
    // Process items in batches for better performance
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      for (const item of batch) {
        // Check if item matches known skills
        const matchedSkill = this.findMatchingSkill(item);
        if (matchedSkill) {
          const experienceLevel = this.inferExperienceLevel(item, matchedSkill.skill);
          const yearsExperience = this.extractYearsExperience(item, matchedSkill.skill);
          
          skills.push({
            skill: matchedSkill.skill,
            category: matchedSkill.category,
            confidence: 0.8, // Higher confidence for skills in dedicated sections
            context: item,
            experienceLevel,
            yearsExperience
          });
        }
      }
    }
    
    return skills;
  }

  /**
   * Find matching skill from keywords (optimized)
   */
  private findMatchingSkill(text: string): { skill: string; category: string } | null {
    const normalizedText = text.toLowerCase().trim();
    
    // Skip very short or very long text
    if (normalizedText.length < 2 || normalizedText.length > 50) {
      return null;
    }
    
    // Use more efficient matching
    for (const [category, keywords] of this.skillKeywords.entries()) {
      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        
        // Exact match first (most reliable)
        if (normalizedText === lowerKeyword) {
          return { skill: keyword, category };
        }
        
        // Word boundary match
        const wordBoundaryRegex = new RegExp(`\\b${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (wordBoundaryRegex.test(normalizedText)) {
          return { skill: keyword, category };
        }
        
        // Partial match (less reliable, only for longer keywords)
        if (lowerKeyword.length > 4 && (
          normalizedText.includes(lowerKeyword) || 
          lowerKeyword.includes(normalizedText)
        )) {
          return { skill: keyword, category };
        }
      }
    }
    
    return null;
  }

  /**
   * Remove duplicate skills and sort by confidence (optimized)
   */
  private deduplicateSkills(skills: ExtractedSkill[]): ExtractedSkill[] {
    if (skills.length === 0) return skills;
    
    const skillMap = new Map<string, ExtractedSkill>();
    
    // Process skills and keep the best match for each skill
    for (const skill of skills) {
      const key = skill.skill.toLowerCase().trim();
      
      // Skip invalid skills
      if (!key || key.length < 2) continue;
      
      const existing = skillMap.get(key);
      
      if (!existing) {
        skillMap.set(key, skill);
      } else {
        // Keep the skill with higher confidence, or better experience data
        const shouldReplace = skill.confidence > existing.confidence ||
          (skill.confidence === existing.confidence && skill.yearsExperience && !existing.yearsExperience) ||
          (skill.confidence === existing.confidence && skill.experienceLevel && !existing.experienceLevel);
        
        if (shouldReplace) {
          skillMap.set(key, skill);
        }
      }
    }
    
    // Sort by confidence (descending) and then by skill name for consistency
    return Array.from(skillMap.values()).sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return a.skill.localeCompare(b.skill);
    });
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

  /**
   * Get pre-compiled regex patterns for better performance
   */
  private getCompiledPatterns(): Map<string, Array<{ keyword: string; regex: RegExp }>> {
    const compiledPatterns = new Map<string, Array<{ keyword: string; regex: RegExp }>>();
    
    for (const [category, keywords] of this.skillKeywords.entries()) {
      const patterns: Array<{ keyword: string; regex: RegExp }> = [];
      
      for (const keyword of keywords) {
        // Escape special regex characters
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Create word boundary regex for exact matches
        const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
        patterns.push({ keyword, regex });
      }
      
      compiledPatterns.set(category, patterns);
    }
    
    return compiledPatterns;
  }

  /**
   * Optimized word counting
   */
  private countWords(text: string): number {
    if (!text || text.trim().length === 0) return 0;
    
    // More efficient word counting using match
    const matches = text.trim().match(/\S+/g);
    return matches ? matches.length : 0;
  }

  /**
   * Optimized file type validation
   */
  private validateFileType(fileType: string): { valid: boolean; error?: string } {
    const supportedTypes = new Set(['pdf', 'docx', 'doc', 'txt']);
    const normalizedType = fileType.toLowerCase();
    
    if (!supportedTypes.has(normalizedType)) {
      return {
        valid: false,
        error: `Unsupported file type: ${fileType}. Supported types: ${Array.from(supportedTypes).join(', ')}`
      };
    }
    
    return { valid: true };
  }
}