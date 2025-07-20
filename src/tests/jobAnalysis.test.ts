import { JobAnalysisService, JobSkillRequirement } from '../services/jobAnalysis';

describe('JobAnalysisService', () => {
  let jobAnalysisService: JobAnalysisService;

  beforeEach(() => {
    jobAnalysisService = new JobAnalysisService();
  });

  describe('analyzeJobDescription', () => {
    it('should analyze a complete job description', async () => {
      const jobDescription = `
        Senior Full Stack Developer - TechCorp Inc.
        Location: San Francisco, CA
        
        We are looking for a Senior Full Stack Developer to join our growing team.
        
        Required Skills:
        • 5+ years of experience with JavaScript and TypeScript
        • Expert knowledge of React and Node.js
        • Strong experience with MongoDB and PostgreSQL
        • Experience with AWS cloud platforms
        
        Preferred Skills:
        • Knowledge of Docker and Kubernetes
        • Familiarity with GraphQL
        • Experience with CI/CD pipelines
        
        Salary: $120,000 - $150,000 USD
      `;

      const result = await jobAnalysisService.analyzeJobDescription(jobDescription, 'Senior Full Stack Developer');
      
      expect(result.jobTitle).toBe('Senior Full Stack Developer');
      expect(result.experienceLevel).toBe('senior');
      expect(result.skillRequirements.length).toBeGreaterThan(0);
      expect(result.metadata.totalSkillsFound).toBeGreaterThan(0);
      expect(result.salaryRange?.min).toBe(120000);
      expect(result.salaryRange?.max).toBe(150000);
      expect(result.salaryRange?.currency).toBe('USD');
    });

    it('should identify critical vs nice-to-have skills', async () => {
      const jobDescription = `
        Software Engineer Position
        
        Required:
        • JavaScript programming experience
        • React framework knowledge
        
        Nice to have:
        • Python experience
        • Docker knowledge
      `;

      const result = await jobAnalysisService.analyzeJobDescription(jobDescription);
      
      const criticalSkills = result.skillRequirements.filter(s => s.importance === 'critical');
      const niceToHaveSkills = result.skillRequirements.filter(s => s.importance === 'nice-to-have');
      
      expect(criticalSkills.length).toBeGreaterThan(0);
      expect(niceToHaveSkills.length).toBeGreaterThan(0);
      
      // JavaScript and React should be critical
      expect(criticalSkills.some(s => s.skill.toLowerCase().includes('javascript'))).toBe(true);
      expect(criticalSkills.some(s => s.skill.toLowerCase().includes('react'))).toBe(true);
      
      // Python and Docker should be nice-to-have
      expect(niceToHaveSkills.some(s => s.skill.toLowerCase().includes('python'))).toBe(true);
      expect(niceToHaveSkills.some(s => s.skill.toLowerCase().includes('docker'))).toBe(true);
    });

    it('should determine experience levels correctly', async () => {
      const entryJobDescription = `
        Junior Developer Position
        Entry level position for recent graduates.
        Basic knowledge of JavaScript required.
      `;

      const seniorJobDescription = `
        Senior Software Architect
        8+ years of experience required.
        Lead development teams and make architectural decisions.
      `;

      const entryResult = await jobAnalysisService.analyzeJobDescription(entryJobDescription);
      const seniorResult = await jobAnalysisService.analyzeJobDescription(seniorJobDescription);
      
      expect(entryResult.experienceLevel).toBe('entry');
      expect(seniorResult.experienceLevel).toBe('senior');
    });

    it('should extract years of experience requirements', async () => {
      const jobDescription = `
        Software Developer
        
        Requirements:
        • 5+ years of experience with JavaScript
        • Minimum 3 years with React
        • At least 2 years of Node.js experience
      `;

      const result = await jobAnalysisService.analyzeJobDescription(jobDescription);
      
      const jsSkill = result.skillRequirements.find(s => s.skill.toLowerCase().includes('javascript'));
      const reactSkill = result.skillRequirements.find(s => s.skill.toLowerCase().includes('react'));
      const nodeSkill = result.skillRequirements.find(s => s.skill.toLowerCase().includes('node'));
      
      expect(jsSkill?.yearsRequired).toBe(5);
      expect(reactSkill?.yearsRequired).toBe(3);
      expect(nodeSkill?.yearsRequired).toBe(2);
    });

    it('should determine job types correctly', async () => {
      const remoteJob = `
        Remote Software Developer
        Work from home opportunity.
      `;

      const contractJob = `
        Contract Developer Position
        6-month contract opportunity.
      `;

      const internshipJob = `
        Software Engineering Internship
        Summer internship program.
      `;

      const remoteResult = await jobAnalysisService.analyzeJobDescription(remoteJob);
      const contractResult = await jobAnalysisService.analyzeJobDescription(contractJob);
      const internshipResult = await jobAnalysisService.analyzeJobDescription(internshipJob);
      
      expect(remoteResult.jobType).toBe('remote');
      expect(contractResult.jobType).toBe('contract');
      expect(internshipResult.jobType).toBe('internship');
    });

    it('should extract company and location information', async () => {
      const jobDescription = `
        Software Engineer at TechCorp Inc.
        Location: New York, NY
        
        Join our innovative team at TechCorp Inc.
      `;

      const result = await jobAnalysisService.analyzeJobDescription(jobDescription);
      
      expect(result.company).toContain('TechCorp');
      expect(result.location).toContain('New York');
    });

    it('should handle minimum skill level requirements', async () => {
      const jobDescription = `
        Developer Position
        
        Requirements:
        • Expert knowledge of JavaScript
        • Advanced React skills
        • Basic understanding of Python
        • Entry level SQL knowledge
      `;

      const result = await jobAnalysisService.analyzeJobDescription(jobDescription);
      
      const jsSkill = result.skillRequirements.find(s => s.skill.toLowerCase().includes('javascript'));
      const reactSkill = result.skillRequirements.find(s => s.skill.toLowerCase().includes('react'));
      const pythonSkill = result.skillRequirements.find(s => s.skill.toLowerCase().includes('python'));
      
      expect(jsSkill?.minimumLevel).toBe('expert');
      expect(reactSkill?.minimumLevel).toBe('advanced');
      expect(pythonSkill?.minimumLevel).toBe('beginner');
    });

    it('should categorize skills correctly', async () => {
      const jobDescription = `
        Full Stack Developer
        
        Technical Skills:
        • JavaScript, TypeScript, Python
        • React, Angular, Vue.js
        • MongoDB, PostgreSQL, Redis
        • AWS, Docker, Kubernetes
      `;

      const result = await jobAnalysisService.analyzeJobDescription(jobDescription);
      
      const programmingSkills = result.skillRequirements.filter(s => s.category === 'Programming Languages');
      const webSkills = result.skillRequirements.filter(s => s.category === 'Web Technologies');
      const databaseSkills = result.skillRequirements.filter(s => s.category === 'Databases');
      const cloudSkills = result.skillRequirements.filter(s => s.category === 'Cloud Platforms');
      
      expect(programmingSkills.length).toBeGreaterThan(0);
      expect(webSkills.length).toBeGreaterThan(0);
      expect(databaseSkills.length).toBeGreaterThan(0);
      expect(cloudSkills.length).toBeGreaterThan(0);
    });
  });

  describe('getSkillImportanceStats', () => {
    it('should calculate skill importance statistics', () => {
      const skillRequirements: JobSkillRequirement[] = [
        {
          skill: 'JavaScript',
          category: 'Programming Languages',
          importance: 'critical',
          minimumLevel: 'intermediate',
          confidence: 0.9,
          context: 'Required JavaScript experience'
        },
        {
          skill: 'React',
          category: 'Web Technologies',
          importance: 'critical',
          minimumLevel: 'advanced',
          confidence: 0.8,
          context: 'Strong React skills needed'
        },
        {
          skill: 'Docker',
          category: 'DevOps & Tools',
          importance: 'nice-to-have',
          minimumLevel: 'beginner',
          confidence: 0.6,
          context: 'Docker knowledge is a plus'
        }
      ];

      const stats = jobAnalysisService.getSkillImportanceStats(skillRequirements);
      
      expect(stats.critical).toBe(2);
      expect(stats.important).toBe(0);
      expect(stats.niceToHave).toBe(1);
      expect(stats.totalSkills).toBe(3);
    });
  });

  describe('filterSkillsByImportance', () => {
    it('should filter skills by importance level', () => {
      const skillRequirements: JobSkillRequirement[] = [
        {
          skill: 'JavaScript',
          category: 'Programming Languages',
          importance: 'critical',
          minimumLevel: 'intermediate',
          confidence: 0.9,
          context: 'Required JavaScript experience'
        },
        {
          skill: 'Python',
          category: 'Programming Languages',
          importance: 'nice-to-have',
          minimumLevel: 'beginner',
          confidence: 0.6,
          context: 'Python knowledge is helpful'
        }
      ];

      const criticalSkills = jobAnalysisService.filterSkillsByImportance(skillRequirements, 'critical');
      const niceToHaveSkills = jobAnalysisService.filterSkillsByImportance(skillRequirements, 'nice-to-have');
      
      expect(criticalSkills.length).toBe(1);
      expect(criticalSkills[0].skill).toBe('JavaScript');
      
      expect(niceToHaveSkills.length).toBe(1);
      expect(niceToHaveSkills[0].skill).toBe('Python');
    });
  });

  describe('getSkillsByCategory', () => {
    it('should group skills by category', () => {
      const skillRequirements: JobSkillRequirement[] = [
        {
          skill: 'JavaScript',
          category: 'Programming Languages',
          importance: 'critical',
          minimumLevel: 'intermediate',
          confidence: 0.9,
          context: 'JavaScript required'
        },
        {
          skill: 'Python',
          category: 'Programming Languages',
          importance: 'important',
          minimumLevel: 'beginner',
          confidence: 0.7,
          context: 'Python preferred'
        },
        {
          skill: 'React',
          category: 'Web Technologies',
          importance: 'critical',
          minimumLevel: 'advanced',
          confidence: 0.8,
          context: 'React expertise needed'
        }
      ];

      const categoryMap = jobAnalysisService.getSkillsByCategory(skillRequirements);
      
      expect(categoryMap.has('Programming Languages')).toBe(true);
      expect(categoryMap.has('Web Technologies')).toBe(true);
      
      const programmingSkills = categoryMap.get('Programming Languages');
      const webSkills = categoryMap.get('Web Technologies');
      
      expect(programmingSkills?.length).toBe(2);
      expect(webSkills?.length).toBe(1);
      
      expect(programmingSkills?.some(s => s.skill === 'JavaScript')).toBe(true);
      expect(programmingSkills?.some(s => s.skill === 'Python')).toBe(true);
      expect(webSkills?.some(s => s.skill === 'React')).toBe(true);
    });
  });
});

// Mock job descriptions for testing
export const mockJobDescriptions = {
  seniorFullStack: `
    Senior Full Stack Developer - TechCorp Inc.
    Location: San Francisco, CA
    Salary: $120,000 - $150,000
    
    We are seeking a Senior Full Stack Developer to join our innovative team.
    
    Required Qualifications:
    • 5+ years of experience with JavaScript and TypeScript
    • Expert knowledge of React and Node.js
    • Strong experience with MongoDB and PostgreSQL
    • Experience with AWS cloud platforms
    • Proficient in Git version control
    
    Preferred Qualifications:
    • Knowledge of Docker and Kubernetes
    • Familiarity with GraphQL
    • Experience with CI/CD pipelines
    • Understanding of microservices architecture
    
    Responsibilities:
    • Design and develop scalable web applications
    • Collaborate with cross-functional teams
    • Mentor junior developers
    • Participate in code reviews
    
    This is a full-time position with excellent benefits and growth opportunities.
  `,

  entryLevelPosition: `
    Junior Software Developer - StartupXYZ
    Location: Austin, TX
    
    Entry level position perfect for recent graduates or career changers.
    
    Requirements:
    • Bachelor's degree in Computer Science or related field
    • Basic knowledge of JavaScript and HTML/CSS
    • Familiarity with React framework
    • Understanding of fundamental programming concepts
    • 0-2 years of professional experience
    
    Nice to have:
    • Internship experience
    • Personal projects or portfolio
    • Knowledge of Python or Java
    
    We offer mentorship, training, and a supportive environment for growth.
  `,

  contractPosition: `
    Contract React Developer - RemoteTech
    
    6-month contract position, remote work available.
    
    Must have:
    • 3+ years of React development experience
    • Strong JavaScript and TypeScript skills
    • Experience with Redux or similar state management
    • Knowledge of modern build tools (Webpack, Babel)
    
    Contract details:
    • $80-100/hour depending on experience
    • Remote work with flexible hours
    • Potential for extension or full-time conversion
  `,

  dataScientistRole: `
    Senior Data Scientist - DataCorp Analytics
    Location: Boston, MA
    
    Join our data science team to build machine learning solutions.
    
    Required Skills:
    • PhD or Master's in Data Science, Statistics, or related field
    • 5+ years of experience with Python and R
    • Expert knowledge of machine learning algorithms
    • Proficient in SQL and database management
    • Experience with TensorFlow or PyTorch
    • Strong statistical analysis skills
    
    Preferred:
    • Experience with big data tools (Spark, Hadoop)
    • Knowledge of cloud platforms (AWS, GCP)
    • Familiarity with MLOps practices
    • Experience with data visualization tools
    
    Salary: $140,000 - $180,000 plus equity
  `
};