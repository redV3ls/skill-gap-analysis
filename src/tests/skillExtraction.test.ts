import { SkillExtractionService, ExtractedSkill } from '../services/skillExtraction';
import { DocumentParser } from '../utils/documentParser';

describe('SkillExtractionService', () => {
  let skillExtractor: SkillExtractionService;

  beforeEach(() => {
    skillExtractor = new SkillExtractionService();
  });

  describe('extractSkills', () => {
    it('should extract programming languages from text', async () => {
      const text = `
        I have 5 years of experience with JavaScript and TypeScript.
        I'm proficient in Python and have worked with Java for 3 years.
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      expect(skills.length).toBeGreaterThan(0);
      
      const jsSkill = skills.find(s => s.skill.toLowerCase().includes('javascript'));
      expect(jsSkill).toBeDefined();
      expect(jsSkill?.category).toBe('Programming Languages');
      expect(jsSkill?.confidence).toBeGreaterThan(0.5);
    });

    it('should infer experience levels correctly', async () => {
      const text = `
        Expert in React with 8 years experience.
        Beginner level Python programming.
        Advanced knowledge of Node.js.
        Intermediate SQL skills.
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      const reactSkill = skills.find(s => s.skill.toLowerCase().includes('react'));
      expect(reactSkill?.experienceLevel).toBe('expert');
      
      const pythonSkill = skills.find(s => s.skill.toLowerCase().includes('python'));
      expect(pythonSkill?.experienceLevel).toBe('beginner');
    });

    it('should extract years of experience', async () => {
      const text = `
        5 years of experience with JavaScript.
        Worked with Python for 3+ years.
        2 yrs experience in React development.
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      const jsSkill = skills.find(s => s.skill.toLowerCase().includes('javascript'));
      expect(jsSkill?.yearsExperience).toBe(5);
      
      const pythonSkill = skills.find(s => s.skill.toLowerCase().includes('python'));
      expect(pythonSkill?.yearsExperience).toBe(3);
    });

    it('should handle technical skills sections', async () => {
      const text = `
        TECHNICAL SKILLS:
        • Programming Languages: JavaScript, Python, Java
        • Frameworks: React, Angular, Express
        • Databases: MongoDB, PostgreSQL
        • Tools: Git, Docker, Jenkins
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      expect(skills.length).toBeGreaterThan(5);
      
      const techSkills = skills.filter(s => s.confidence > 0.7);
      expect(techSkills.length).toBeGreaterThan(3);
    });

    it('should deduplicate similar skills', async () => {
      const text = `
        JavaScript developer with JavaScript experience.
        React expert, proficient in React development.
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      const jsSkills = skills.filter(s => s.skill.toLowerCase().includes('javascript'));
      expect(jsSkills.length).toBe(1);
      
      const reactSkills = skills.filter(s => s.skill.toLowerCase().includes('react'));
      expect(reactSkills.length).toBe(1);
    });

    it('should assign appropriate categories', async () => {
      const text = `
        Programming: JavaScript, Python
        Databases: MongoDB, PostgreSQL
        Cloud: AWS, Azure
        Mobile: React Native, Flutter
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      const jsSkill = skills.find(s => s.skill.toLowerCase().includes('javascript'));
      expect(jsSkill?.category).toBe('Programming Languages');
      
      const mongoSkill = skills.find(s => s.skill.toLowerCase().includes('mongodb'));
      expect(mongoSkill?.category).toBe('Databases');
      
      const awsSkill = skills.find(s => s.skill.toLowerCase().includes('aws'));
      expect(awsSkill?.category).toBe('Cloud Platforms');
    });

    it('should handle edge cases in experience extraction', async () => {
      const text = `
        JavaScript (5+ years)
        Python for 3 years
        2 years of experience with React
        Advanced Java programming
        Expert in Node.js
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      const jsSkill = skills.find(s => s.skill === 'JavaScript');
      expect(jsSkill?.yearsExperience).toBe(5);
      
      const pythonSkill = skills.find(s => s.skill === 'Python');
      expect(pythonSkill?.yearsExperience).toBe(3);
      
      const reactSkill = skills.find(s => s.skill === 'React');
      expect(reactSkill?.yearsExperience).toBe(2);
      
      // Check that experience levels are detected (may vary based on context)
      const javaSkill = skills.find(s => s.skill === 'Java');
      expect(javaSkill?.experienceLevel).toBeDefined();
      expect(['advanced', 'expert']).toContain(javaSkill?.experienceLevel);
      
      const nodeSkill = skills.find(s => s.skill === 'Node.js');
      expect(nodeSkill?.experienceLevel).toBe('expert');
    });

    it('should handle malformed or very long skill names', async () => {
      const text = `
        JavaScript
        VeryLongSkillNameThatShouldBeHandledProperly
        A
        ""
        null
        undefined
      `;

      const skills = await skillExtractor.extractSkills(text);
      
      // Should find JavaScript
      expect(skills.some(s => s.skill === 'JavaScript')).toBe(true);
      
      // Should not include very short or invalid entries
      expect(skills.every(s => s.skill.length >= 2)).toBe(true);
    });
  });

  describe('parseDocument', () => {
    it('should parse plain text documents', async () => {
      const text = 'I am a JavaScript developer with 3 years experience.';
      const buffer = new TextEncoder().encode(text).buffer;

      const result = await skillExtractor.parseDocument(buffer, 'txt');
      
      expect(result.text).toBe(text);
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
    });

    it('should handle unsupported file types', async () => {
      const buffer = new ArrayBuffer(100);
      
      await expect(skillExtractor.parseDocument(buffer, 'xyz'))
        .rejects.toThrow('Unsupported file type: xyz');
    });
  });
});

describe('DocumentParser', () => {
  let documentParser: DocumentParser;

  beforeEach(() => {
    documentParser = new DocumentParser();
  });

  describe('validateDocument', () => {
    it('should validate supported file types', () => {
      const result1 = documentParser.validateDocument('resume.pdf', 1000);
      expect(result1.valid).toBe(true);

      const result2 = documentParser.validateDocument('resume.docx', 1000);
      expect(result2.valid).toBe(true);

      const result3 = documentParser.validateDocument('resume.txt', 1000);
      expect(result3.valid).toBe(true);
    });

    it('should reject unsupported file types', () => {
      const result = documentParser.validateDocument('resume.xyz', 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    it('should reject files that are too large', () => {
      const largeSize = 11 * 1024 * 1024; // 11MB
      const result = documentParser.validateDocument('resume.pdf', largeSize);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File size exceeds');
    });
  });

  describe('extractSkillsFromText', () => {
    it('should extract skills from plain text', async () => {
      const text = `
        Senior Software Engineer with expertise in:
        - JavaScript (5 years)
        - React (3 years)
        - Node.js (4 years)
        - MongoDB (2 years)
      `;

      const skills = await documentParser.extractSkillsFromText(text);
      
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some(s => s.skill.toLowerCase().includes('javascript'))).toBe(true);
      expect(skills.some(s => s.skill.toLowerCase().includes('react'))).toBe(true);
    });
  });

  describe('extractContactInfo', () => {
    it('should extract email addresses', () => {
      const text = 'Contact me at john.doe@example.com for more information.';
      const contactInfo = documentParser.extractContactInfo(text);
      
      expect(contactInfo.email).toBe('john.doe@example.com');
    });

    it('should extract phone numbers', () => {
      const text = 'Phone: (555) 123-4567 or call me anytime.';
      const contactInfo = documentParser.extractContactInfo(text);
      
      expect(contactInfo.phone).toBe('(555) 123-4567');
    });

    it('should extract LinkedIn profiles', () => {
      const text = 'LinkedIn: linkedin.com/in/johndoe';
      const contactInfo = documentParser.extractContactInfo(text);
      
      expect(contactInfo.linkedin).toBe('linkedin.com/in/johndoe');
    });

    it('should extract GitHub profiles', () => {
      const text = 'GitHub: github.com/johndoe';
      const contactInfo = documentParser.extractContactInfo(text);
      
      expect(contactInfo.github).toBe('github.com/johndoe');
    });
  });

  describe('extractEducation', () => {
    it('should extract degree information', () => {
      const text = `
        Education:
        Bachelor of Science in Computer Science
        Master of Business Administration
        PhD in Machine Learning
      `;

      const education = documentParser.extractEducation(text);
      
      expect(education.length).toBeGreaterThan(0);
      expect(education.some(e => e.degree?.includes('Bachelor'))).toBe(true);
      expect(education.some(e => e.degree?.includes('Master'))).toBe(true);
    });
  });

  describe('extractWorkExperience', () => {
    it('should extract job titles', () => {
      const text = `
        Work Experience:
        Senior Software Engineer at Tech Corp
        Software Developer at StartupXYZ
        Lead Developer at BigTech Inc
      `;

      const experience = documentParser.extractWorkExperience(text);
      
      expect(experience.length).toBeGreaterThan(0);
      expect(experience.some(e => e.title?.includes('Senior Software Engineer'))).toBe(true);
      expect(experience.some(e => e.title?.includes('Software Developer'))).toBe(true);
    });
  });

  describe('parseFromBase64', () => {
    it('should parse base64 encoded text documents', async () => {
      const text = 'I am a JavaScript developer with React experience.';
      const base64 = btoa(text);

      const result = await documentParser.parseFromBase64(base64, 'resume.txt');
      
      expect(result.content).toBe(text);
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.metadata.fileType).toBe('txt');
      expect(result.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should handle data URL prefixes', async () => {
      const text = 'JavaScript developer';
      const base64WithPrefix = `data:text/plain;base64,${btoa(text)}`;

      const result = await documentParser.parseFromBase64(base64WithPrefix, 'resume.txt');
      
      expect(result.content).toBe(text);
    });

    it('should handle empty base64 data', async () => {
      await expect(documentParser.parseFromBase64('', 'resume.txt'))
        .rejects.toThrow('Base64 data and filename are required');
    });

    it('should handle invalid base64 data', async () => {
      await expect(documentParser.parseFromBase64('invalid-base64!@#', 'resume.txt'))
        .rejects.toThrow('Invalid base64 data');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large text efficiently', async () => {
      // Create a large text with repeated skill mentions
      const skillText = 'JavaScript Python Java React Angular Vue.js Node.js MongoDB PostgreSQL AWS Docker Kubernetes ';
      const largeText = skillText.repeat(100); // ~7KB of text
      
      const startTime = performance.now();
      const skills = await documentParser.extractSkillsFromText(largeText);
      const endTime = performance.now();
      
      expect(skills.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should truncate very large text for performance', async () => {
      // Create text larger than the 50KB limit
      const largeText = 'JavaScript developer '.repeat(3000); // ~60KB
      
      const skills = await documentParser.extractSkillsFromText(largeText);
      
      expect(skills.length).toBeGreaterThan(0);
      // Should still find skills despite truncation
      expect(skills.some(s => s.skill.toLowerCase().includes('javascript'))).toBe(true);
    });

    it('should return empty array for empty text', async () => {
      const skills = await documentParser.extractSkillsFromText('');
      expect(skills).toEqual([]);
    });

    it('should return empty array for whitespace-only text', async () => {
      const skills = await documentParser.extractSkillsFromText('   \n\t   ');
      expect(skills).toEqual([]);
    });
  });
});

// Mock data for testing
export const mockResumeText = `
John Doe
Software Engineer
Email: john.doe@example.com
Phone: (555) 123-4567
LinkedIn: linkedin.com/in/johndoe

SUMMARY
Experienced software engineer with 5+ years of experience in full-stack development.
Expert in JavaScript, TypeScript, and modern web technologies.

TECHNICAL SKILLS
• Programming Languages: JavaScript (5 years), TypeScript (3 years), Python (2 years)
• Frontend: React (4 years), Angular (2 years), Vue.js (1 year)
• Backend: Node.js (4 years), Express (3 years), Django (1 year)
• Databases: MongoDB (3 years), PostgreSQL (2 years), Redis (1 year)
• Cloud: AWS (2 years), Docker (2 years), Kubernetes (1 year)
• Tools: Git, Jenkins, JIRA, VS Code

EXPERIENCE
Senior Software Engineer | Tech Corp | 2020 - Present
• Led development of microservices architecture using Node.js and Docker
• Implemented CI/CD pipelines with Jenkins and AWS
• Mentored junior developers and conducted code reviews

Software Developer | StartupXYZ | 2018 - 2020
• Developed responsive web applications using React and TypeScript
• Built RESTful APIs with Express and MongoDB
• Collaborated with cross-functional teams in Agile environment

EDUCATION
Bachelor of Science in Computer Science | University of Technology | 2018
GPA: 3.8/4.0

CERTIFICATIONS
• AWS Certified Solutions Architect
• MongoDB Certified Developer
• Scrum Master Certification
`;

export const mockJobDescription = `
Senior Full Stack Developer

We are looking for a Senior Full Stack Developer to join our growing team.

Requirements:
• 5+ years of experience in software development
• Expert knowledge of JavaScript and TypeScript
• Strong experience with React and Node.js
• Experience with cloud platforms (AWS preferred)
• Knowledge of database systems (MongoDB, PostgreSQL)
• Experience with containerization (Docker, Kubernetes)
• Familiarity with CI/CD pipelines
• Strong problem-solving skills
• Excellent communication skills

Nice to have:
• Experience with microservices architecture
• Knowledge of Python or Java
• Experience with GraphQL
• DevOps experience
• Agile/Scrum methodology experience

Responsibilities:
• Design and develop scalable web applications
• Collaborate with cross-functional teams
• Mentor junior developers
• Participate in code reviews
• Contribute to technical architecture decisions
`;