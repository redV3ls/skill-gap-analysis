import { SkillExtractionService, DocumentParsingResult } from '../services/skillExtraction';
import { logger } from './logger';

export interface ParsedDocument {
  content: string;
  skills: any[];
  metadata: {
    fileType: string;
    fileSize: number;
    processingTime: number;
    wordCount: number;
  };
}

export class DocumentParser {
  private skillExtractor: SkillExtractionService;

  constructor() {
    this.skillExtractor = new SkillExtractionService();
  }

  /**
   * Parse document from base64 string (optimized)
   */
  async parseFromBase64(base64Data: string, fileName: string): Promise<ParsedDocument> {
    const startTime = performance.now();
    
    try {
      // Validate input
      if (!base64Data || !fileName) {
        throw new Error('Base64 data and filename are required');
      }
      
      // Remove data URL prefix if present (optimized)
      const base64Content = base64Data.startsWith('data:') 
        ? base64Data.substring(base64Data.indexOf(',') + 1)
        : base64Data;
      
      const buffer = this.base64ToArrayBuffer(base64Content);
      const fileType = this.getFileTypeFromName(fileName);
      
      // Validate file before processing
      const validation = this.validateDocument(fileName, buffer.byteLength);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      const result = await this.skillExtractor.parseDocument(buffer, fileType);
      
      const totalProcessingTime = performance.now() - startTime;
      logger.debug(`Document parsing completed in ${totalProcessingTime.toFixed(2)}ms`);
      
      return {
        content: result.text,
        skills: result.skills,
        metadata: {
          fileType,
          fileSize: buffer.byteLength,
          processingTime: result.metadata.processingTime,
          wordCount: result.metadata.wordCount
        }
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      logger.error('Document parsing failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fileName,
        processingTime: processingTime.toFixed(2)
      });
      throw new Error(`Failed to parse document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse document from ArrayBuffer
   */
  async parseFromBuffer(buffer: ArrayBuffer, fileType: string): Promise<ParsedDocument> {
    try {
      const result = await this.skillExtractor.parseDocument(buffer, fileType);
      
      return {
        content: result.text,
        skills: result.skills,
        metadata: {
          fileType,
          fileSize: buffer.byteLength,
          processingTime: result.metadata.processingTime,
          wordCount: result.metadata.wordCount
        }
      };
    } catch (error) {
      logger.error('Document parsing failed:', error);
      throw new Error(`Failed to parse document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate document format and size
   */
  validateDocument(fileName: string, fileSize: number): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['pdf', 'docx', 'doc', 'txt'];
    
    if (fileSize > maxSize) {
      return { valid: false, error: 'File size exceeds 10MB limit' };
    }
    
    const fileType = this.getFileTypeFromName(fileName);
    if (!allowedTypes.includes(fileType)) {
      return { valid: false, error: `Unsupported file type: ${fileType}` };
    }
    
    return { valid: true };
  }

  /**
   * Extract skills from plain text (optimized)
   */
  async extractSkillsFromText(text: string): Promise<any[]> {
    const startTime = performance.now();
    
    try {
      // Validate input
      if (!text || text.trim().length === 0) {
        return [];
      }
      
      // Limit text size for performance
      const maxTextLength = 50000; // 50KB limit
      const processedText = text.length > maxTextLength 
        ? text.substring(0, maxTextLength) + '...'
        : text;
      
      if (text.length > maxTextLength) {
        logger.warn(`Text truncated from ${text.length} to ${maxTextLength} characters for performance`);
      }
      
      const skills = await this.skillExtractor.extractSkills(processedText);
      
      const processingTime = performance.now() - startTime;
      logger.debug(`Skill extraction completed in ${processingTime.toFixed(2)}ms, found ${skills.length} skills`);
      
      return skills;
    } catch (error) {
      const processingTime = performance.now() - startTime;
      logger.error('Skill extraction failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        textLength: text.length,
        processingTime: processingTime.toFixed(2)
      });
      throw new Error(`Failed to extract skills: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert base64 to ArrayBuffer (optimized)
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      // Validate base64 string
      if (!base64 || base64.length === 0) {
        throw new Error('Empty base64 string');
      }
      
      const binaryString = atob(base64);
      const length = binaryString.length;
      const bytes = new Uint8Array(length);
      
      // Optimized loop for better performance
      for (let i = 0; i < length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return bytes.buffer;
    } catch (error) {
      logger.error('Base64 conversion failed:', error);
      throw new Error(`Invalid base64 data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file type from filename
   */
  private getFileTypeFromName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension || 'txt';
  }

  /**
   * Clean and normalize extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Replace multiple newlines with single newline
      .trim();
  }

  /**
   * Extract contact information from resume text
   */
  extractContactInfo(text: string): {
    email?: string;
    phone?: string;
    linkedin?: string;
    github?: string;
  } {
    const contactInfo: any = {};
    
    // Email pattern
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      contactInfo.email = emailMatch[0];
    }
    
    // Phone pattern
    const phoneMatch = text.match(/(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
    if (phoneMatch) {
      contactInfo.phone = phoneMatch[0];
    }
    
    // LinkedIn pattern
    const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
    if (linkedinMatch) {
      contactInfo.linkedin = linkedinMatch[0];
    }
    
    // GitHub pattern
    const githubMatch = text.match(/github\.com\/[\w-]+/i);
    if (githubMatch) {
      contactInfo.github = githubMatch[0];
    }
    
    return contactInfo;
  }

  /**
   * Extract education information
   */
  extractEducation(text: string): Array<{
    degree?: string;
    institution?: string;
    year?: string;
    gpa?: string;
  }> {
    const education: any[] = [];
    
    // Common degree patterns
    const degreePatterns = [
      /(?:Bachelor|Master|PhD|B\.S\.|M\.S\.|B\.A\.|M\.A\.|MBA)[\s\w]*(?:in|of)\s+([^,\n]+)/gi,
      /([^,\n]+)\s+(?:Bachelor|Master|PhD|B\.S\.|M\.S\.|B\.A\.|M\.A\.|MBA)/gi
    ];
    
    for (const pattern of degreePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        education.push({
          degree: match[0].trim(),
          // Additional parsing for institution and year would go here
        });
      }
    }
    
    return education;
  }

  /**
   * Extract work experience
   */
  extractWorkExperience(text: string): Array<{
    title?: string;
    company?: string;
    duration?: string;
    description?: string;
  }> {
    const experience: any[] = [];
    
    // More comprehensive job title patterns
    const jobTitlePatterns = [
      /(Senior\s+Software\s+Engineer|Software\s+Engineer|Software\s+Developer|Developer|Programmer|Analyst|Manager|Director|Lead\s+Developer|Junior\s+Developer)[^\n]*/gi,
      /(Full\s+Stack\s+Developer|Frontend\s+Developer|Backend\s+Developer|Web\s+Developer)[^\n]*/gi
    ];
    
    for (const pattern of jobTitlePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const fullMatch = match[0].trim();
        // Extract just the job title part before any additional info
        const titleMatch = fullMatch.match(/^([^|@\n]+?)(?:\s*\||@|$)/);
        const title = titleMatch ? titleMatch[1].trim() : fullMatch;
        
        experience.push({
          title: title,
          // Additional parsing for company, duration, etc. would go here
        });
      }
    }
    
    return experience;
  }
}

export const documentParser = new DocumentParser();