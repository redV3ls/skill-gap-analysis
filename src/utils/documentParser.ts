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
   * Parse document from base64 string
   */
  async parseFromBase64(base64Data: string, fileName: string): Promise<ParsedDocument> {
    try {
      // Remove data URL prefix if present
      const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = this.base64ToArrayBuffer(base64Content);
      const fileType = this.getFileTypeFromName(fileName);
      
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
   * Extract skills from plain text
   */
  async extractSkillsFromText(text: string): Promise<any[]> {
    try {
      const skills = await this.skillExtractor.extractSkills(text);
      return skills;
    } catch (error) {
      logger.error('Skill extraction failed:', error);
      throw new Error(`Failed to extract skills: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
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