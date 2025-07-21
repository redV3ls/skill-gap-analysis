import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GapAnalysisService, SkillGap } from '../services/gapAnalysis';
import { SkillMatchingService, UserSkill, SkillMatch, SkillMatchingResult, TransferableSkill } from '../services/skillMatching';
import { JobSkillRequirement } from '../services/jobAnalysis';

// Mock the dependencies
jest.mock('../utils/logger');

describe('GapAnalysisService', () => {
  let gapAnalysisService: GapAnalysisService;
  let mockSkillMatchingService: any;

  const mockUserSkills: UserSkill[] = [
    {
      skillId: '1',
      skillName: 'JavaScript',
      skillCategory: 'Programming',
      level: 'intermediate',
      yearsExperience: 3,
      confidenceScore: 0.8
    },
    {
      skillId: '2',
      skillName: 'React',
      skillCategory: 'Frameworks & Libraries',
      level: 'beginner',
      yearsExperience: 1,
      confidenceScore: 0.6
    },
    {
      skillId: '3',
      skillName: 'Python',
      skillCategory: 'Programming',
      level: 'advanced',
      yearsExperience: 5,
      confidenceScore: 0.9
    }
  ];

  const mockJobRequirements: JobSkillRequirement[] = [
    {
      skill: 'JavaScript',
      category: 'Programming',
      importance: 'critical',
      minimumLevel: 'advanced',
      yearsRequired: 5,
      confidence: 0.9,
      context: 'Required for frontend development'
    },
    {
      skill: 'React',
      category: 'Frameworks & Libraries',
      importance: 'critical',
      minimumLevel: 'intermediate',
      yearsRequired: 3,
      confidence: 0.8,
      context: 'Primary framework for UI development'
    },
    {
      skill: 'Node.js',
      category: 'Programming',
      importance: 'important',
      minimumLevel: 'intermediate',
      yearsRequired: 2,
      confidence: 0.8,
      context: 'Backend development experience'
    },
    {
      skill: 'TypeScript',
      category: 'Programming',
      importance: 'nice-to-have',
      minimumLevel: 'beginner',
      confidence: 0.7,
      context: 'Type safety and better development experience'
    }
  ];

  const mockMatches: SkillMatch[] = [
    {
      userSkill: mockUserSkills[0], // JavaScript
      jobRequirement: mockJobRequirements[0],
      matchType: 'exact',
      matchScore: 0.7,
      levelGap: 1, // intermediate -> advanced
      experienceGap: 2, // 3 years -> 5 years
      confidence: 0.85
    },
    {
      userSkill: mockUserSkills[1], // React
      jobRequirement: mockJobRequirements[1],
      matchType: 'exact',
      matchScore: 0.6,
      levelGap: 1, // beginner -> intermediate
      experienceGap: 2, // 1 year -> 3 years
      confidence: 0.7
    }
  ];

  const mockTransferableSkills: TransferableSkill[] = [
    {
      fromSkill: mockUserSkills[2], // Python
      toSkillName: 'Node.js',
      toCategory: 'Programming',
      transferabilityScore: 0.6,
      reasoning: 'Both are programming languages with similar concepts'
    }
  ];

  const mockMatchingResult: SkillMatchingResult = {
    matches: mockMatches,
    transferableSkills: mockTransferableSkills,
    unmatchedUserSkills: [mockUserSkills[2]], // Python
    unmatchedJobRequirements: [mockJobRequirements[2], mockJobRequirements[3]], // Node.js, TypeScript
    overallMatchScore: 0.65
  };

  beforeEach(() => {
    // Create a mock skill matching service
    mockSkillMatchingService = {
      matchSkills: jest.fn()
    } as any;

    // Set up default mock return value
    (mockSkillMatchingService.matchSkills as jest.Mock).mockResolvedValue(mockMatchingResult);

    gapAnalysisService = new GapAnalysisService(mockSkillMatchingService);
  });

  describe('analyzeGaps', () => {
    it('should perform comprehensive gap analysis', async () => {
      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      expect(result.overallMatchPercentage).toBe(65); // 0.65 * 100
      expect(result.skillGaps).toBeDefined();
      expect(result.strengths).toBeDefined();
      expect(result.criticalGaps).toBeDefined();
      expect(result.quickWins).toBeDefined();
      expect(result.longTermGoals).toBeDefined();
      expect(result.transferableOpportunities).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should identify skill gaps correctly', async () => {
      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      // Should identify gaps for JavaScript and React (matched but with gaps)
      // Plus Node.js and TypeScript (unmatched requirements)
      expect(result.skillGaps.length).toBe(4);

      const jsGap = result.skillGaps.find(gap => gap.skillName === 'JavaScript');
      expect(jsGap).toBeDefined();
      expect(jsGap?.currentLevel).toBe('intermediate');
      expect(jsGap?.requiredLevel).toBe('advanced');
      expect(jsGap?.levelGap).toBe(1);
      expect(jsGap?.experienceGap).toBe(2);
    });

    it('should identify strengths correctly', async () => {
      // Mock a scenario where user exceeds requirements
      const strengthMatch: SkillMatch = {
        userSkill: mockUserSkills[2], // Python advanced
        jobRequirement: {
          skill: 'Python',
          category: 'Programming',
          importance: 'important',
          minimumLevel: 'intermediate',
          confidence: 0.8,
          context: 'Backend development experience'
        },
        matchType: 'exact',
        matchScore: 0.9,
        levelGap: -1, // User exceeds requirement
        confidence: 0.9
      };

      const mockResultWithStrength: SkillMatchingResult = {
        ...mockMatchingResult,
        matches: [...mockMatches, strengthMatch]
      };

      (mockSkillMatchingService.matchSkills as jest.Mock).mockResolvedValue(mockResultWithStrength);

      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      expect(result.strengths.length).toBe(1);
      expect(result.strengths[0].skillName).toBe('Python');
    });

    it('should categorize gaps correctly', async () => {
      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      // Critical gaps should include critical importance skills
      const criticalGapNames = result.criticalGaps.map(gap => gap.skillName);
      expect(criticalGapNames).toContain('JavaScript');
      expect(criticalGapNames).toContain('React');

      // Should have some categorization
      expect(result.quickWins.length + result.longTermGoals.length + result.criticalGaps.length)
        .toBeGreaterThan(0);
    });

    it('should generate actionable recommendations', async () => {
      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      expect(result.recommendations.immediate.length).toBeGreaterThan(0);
      expect(result.recommendations.shortTerm.length).toBeGreaterThan(0);
      expect(result.recommendations.longTerm.length).toBeGreaterThan(0);

      // Should mention critical skills in immediate recommendations
      const immediateText = result.recommendations.immediate.join(' ');
      expect(immediateText.toLowerCase()).toContain('critical');
    });

    it('should calculate metadata correctly', async () => {
      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      expect(result.metadata.totalSkillsAnalyzed).toBe(7); // 3 user + 4 job requirements
      expect(result.metadata.gapsIdentified).toBeGreaterThan(0);
      expect(result.metadata.analysisConfidence).toBeGreaterThan(0);
      expect(result.metadata.analysisConfidence).toBeLessThanOrEqual(1);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
    });
  });

  describe('gap severity calculations', () => {
    it('should calculate critical severity for critical importance with large gaps', () => {
      const severity = gapAnalysisService['calculateGapSeverity']('critical', 2, 3);
      expect(severity).toBe('critical');
    });

    it('should calculate moderate severity for critical importance with small gaps', () => {
      const severity = gapAnalysisService['calculateGapSeverity']('critical', 1, 1);
      expect(severity).toBe('moderate');
    });

    it('should calculate minor severity for nice-to-have skills with small gaps', () => {
      const severity = gapAnalysisService['calculateGapSeverity']('nice-to-have', 1, 1);
      expect(severity).toBe('minor');
    });

    it('should escalate severity for large gaps regardless of importance', () => {
      const severity = gapAnalysisService['calculateGapSeverity']('nice-to-have', 3, 5);
      expect(severity).toBe('moderate');
    });
  });

  describe('learning difficulty calculations', () => {
    it('should return higher difficulty for complex categories', () => {
      const aiDifficulty = gapAnalysisService['calculateLearningDifficulty']('AI & Machine Learning', 'TensorFlow', 2);
      const webDifficulty = gapAnalysisService['calculateLearningDifficulty']('Web Development', 'HTML', 2);
      
      expect(aiDifficulty).toBe('very-hard');
      expect(webDifficulty).toBe('moderate');
    });

    it('should factor in level gap for difficulty', () => {
      const smallGapDifficulty = gapAnalysisService['calculateLearningDifficulty']('Programming', 'JavaScript', 1);
      const largeGapDifficulty = gapAnalysisService['calculateLearningDifficulty']('Programming', 'JavaScript', 3);
      
      // Larger gap should result in higher difficulty
      const difficultyOrder = ['easy', 'moderate', 'hard', 'very-hard'];
      const smallIndex = difficultyOrder.indexOf(smallGapDifficulty);
      const largeIndex = difficultyOrder.indexOf(largeGapDifficulty);
      
      expect(largeIndex).toBeGreaterThanOrEqual(smallIndex);
    });

    it('should recognize skill-specific difficulty patterns', () => {
      const mlDifficulty = gapAnalysisService['getSkillSpecificDifficulty']('Machine Learning');
      const htmlDifficulty = gapAnalysisService['getSkillSpecificDifficulty']('HTML');
      
      expect(mlDifficulty).toBeGreaterThan(htmlDifficulty);
    });
  });

  describe('time to competency calculations', () => {
    it('should calculate reasonable time estimates', () => {
      const time = gapAnalysisService['calculateTimeToCompetency']('Programming', 'JavaScript', 2, 3, 'beginner');
      
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThan(50); // Should be reasonable (less than 4+ years)
    });

    it('should add extra time for skills without current level', () => {
      const timeWithCurrent = gapAnalysisService['calculateTimeToCompetency']('Programming', 'JavaScript', 2, 0, 'beginner');
      const timeWithoutCurrent = gapAnalysisService['calculateTimeToCompetency']('Programming', 'JavaScript', 2, 0, undefined);
      
      expect(timeWithoutCurrent).toBeGreaterThan(timeWithCurrent);
    });

    it('should factor in experience gaps', () => {
      const timeWithoutExp = gapAnalysisService['calculateTimeToCompetency']('Programming', 'JavaScript', 1, 0, 'intermediate');
      const timeWithExp = gapAnalysisService['calculateTimeToCompetency']('Programming', 'JavaScript', 1, 3, 'intermediate');
      
      expect(timeWithExp).toBeGreaterThan(timeWithoutExp);
    });

    it('should apply skill-specific multipliers', () => {
      const mlMultiplier = gapAnalysisService['getSkillTimeMultiplier']('Machine Learning');
      const gitMultiplier = gapAnalysisService['getSkillTimeMultiplier']('Git');
      
      expect(mlMultiplier).toBeGreaterThan(gitMultiplier);
    });
  });

  describe('priority calculations', () => {
    it('should give higher priority to critical importance skills', () => {
      const criticalPriority = gapAnalysisService['calculatePriority']('critical', 'moderate', 'moderate', 6);
      const nicePriority = gapAnalysisService['calculatePriority']('nice-to-have', 'moderate', 'moderate', 6);
      
      expect(criticalPriority).toBeGreaterThan(nicePriority);
    });

    it('should boost priority for easier skills (quick wins)', () => {
      const easyPriority = gapAnalysisService['calculatePriority']('important', 'moderate', 'easy', 3);
      const hardPriority = gapAnalysisService['calculatePriority']('important', 'moderate', 'very-hard', 3);
      
      expect(easyPriority).toBeGreaterThan(hardPriority);
    });

    it('should penalize long-term skills', () => {
      const quickPriority = gapAnalysisService['calculatePriority']('important', 'moderate', 'moderate', 2);
      const longPriority = gapAnalysisService['calculatePriority']('important', 'moderate', 'moderate', 12);
      
      expect(quickPriority).toBeGreaterThan(longPriority);
    });

    it('should return priority within valid range', () => {
      const priority = gapAnalysisService['calculatePriority']('critical', 'critical', 'very-hard', 24);
      
      expect(priority).toBeGreaterThanOrEqual(1);
      expect(priority).toBeLessThanOrEqual(10);
    });
  });

  describe('gap categorization', () => {
    const mockGaps: SkillGap[] = [
      {
        skillName: 'Critical Skill',
        category: 'Programming',
        requiredLevel: 'advanced',
        importance: 'critical',
        gapSeverity: 'critical',
        levelGap: 2,
        timeToCompetency: 8,
        learningDifficulty: 'hard',
        priority: 9,
        confidence: 0.8
      },
      {
        skillName: 'Quick Win',
        category: 'Tools & Software',
        requiredLevel: 'intermediate',
        importance: 'important',
        gapSeverity: 'minor',
        levelGap: 1,
        timeToCompetency: 2,
        learningDifficulty: 'easy',
        priority: 6,
        confidence: 0.9
      },
      {
        skillName: 'Long Term',
        category: 'AI & Machine Learning',
        requiredLevel: 'expert',
        importance: 'important',
        gapSeverity: 'moderate',
        levelGap: 3,
        timeToCompetency: 18,
        learningDifficulty: 'very-hard',
        priority: 5,
        confidence: 0.7
      }
    ];

    it('should categorize critical gaps correctly', () => {
      const { criticalGaps } = gapAnalysisService['categorizeGaps'](mockGaps);
      
      expect(criticalGaps.length).toBe(1);
      expect(criticalGaps[0].skillName).toBe('Critical Skill');
    });

    it('should categorize quick wins correctly', () => {
      const { quickWins } = gapAnalysisService['categorizeGaps'](mockGaps);
      
      expect(quickWins.length).toBe(1);
      expect(quickWins[0].skillName).toBe('Quick Win');
    });

    it('should categorize long-term goals correctly', () => {
      const { longTermGoals } = gapAnalysisService['categorizeGaps'](mockGaps);
      
      expect(longTermGoals.length).toBe(1);
      expect(longTermGoals[0].skillName).toBe('Long Term');
    });
  });

  describe('recommendation generation', () => {
    const mockCriticalGaps: SkillGap[] = [
      {
        skillName: 'JavaScript',
        category: 'Programming',
        requiredLevel: 'advanced',
        importance: 'critical',
        gapSeverity: 'critical',
        levelGap: 2,
        timeToCompetency: 6,
        learningDifficulty: 'moderate',
        priority: 9,
        confidence: 0.8
      }
    ];

    const mockQuickWins: SkillGap[] = [
      {
        skillName: 'Git',
        category: 'Tools & Software',
        requiredLevel: 'intermediate',
        importance: 'important',
        gapSeverity: 'minor',
        levelGap: 1,
        timeToCompetency: 1,
        learningDifficulty: 'easy',
        priority: 7,
        confidence: 0.9
      }
    ];

    const mockLongTerm: SkillGap[] = [
      {
        skillName: 'Machine Learning',
        category: 'AI & Machine Learning',
        requiredLevel: 'advanced',
        importance: 'important',
        gapSeverity: 'moderate',
        levelGap: 3,
        timeToCompetency: 15,
        learningDifficulty: 'very-hard',
        priority: 6,
        confidence: 0.7
      }
    ];

    it('should generate immediate recommendations for critical gaps', () => {
      const recommendations = gapAnalysisService['generateRecommendations'](
        mockCriticalGaps,
        mockQuickWins,
        mockLongTerm,
        mockTransferableSkills
      );

      expect(recommendations.immediate.length).toBeGreaterThan(0);
      const immediateText = recommendations.immediate.join(' ').toLowerCase();
      expect(immediateText).toContain('javascript');
      expect(immediateText).toContain('critical');
    });

    it('should generate quick win recommendations', () => {
      const recommendations = gapAnalysisService['generateRecommendations'](
        mockCriticalGaps,
        mockQuickWins,
        mockLongTerm,
        mockTransferableSkills
      );

      const immediateText = recommendations.immediate.join(' ').toLowerCase();
      expect(immediateText).toContain('git');
      expect(immediateText).toContain('quick win');
    });

    it('should generate transferable skill recommendations', () => {
      const recommendations = gapAnalysisService['generateRecommendations'](
        mockCriticalGaps,
        mockQuickWins,
        mockLongTerm,
        mockTransferableSkills
      );

      const immediateText = recommendations.immediate.join(' ').toLowerCase();
      expect(immediateText).toContain('python');
      expect(immediateText).toContain('node.js');
    });

    it('should generate long-term recommendations', () => {
      const recommendations = gapAnalysisService['generateRecommendations'](
        mockCriticalGaps,
        mockQuickWins,
        mockLongTerm,
        mockTransferableSkills
      );

      expect(recommendations.longTerm.length).toBeGreaterThan(0);
      const longTermText = recommendations.longTerm.join(' ').toLowerCase();
      expect(longTermText).toContain('machine learning');
    });
  });

  describe('edge cases', () => {
    it('should handle empty skill sets', async () => {
      const emptyMatchingResult: SkillMatchingResult = {
        matches: [],
        transferableSkills: [],
        unmatchedUserSkills: [],
        unmatchedJobRequirements: [],
        overallMatchScore: 0
      };

      (mockSkillMatchingService.matchSkills as jest.Mock).mockResolvedValue(emptyMatchingResult);

      const result = await gapAnalysisService.analyzeGaps([], []);

      expect(result.overallMatchPercentage).toBe(0);
      expect(result.skillGaps).toHaveLength(0);
      expect(result.strengths).toHaveLength(0);
      expect(result.metadata.analysisConfidence).toBe(1.0); // Perfect confidence when no data
    });

    it('should handle perfect matches', async () => {
      const perfectMatch: SkillMatch = {
        userSkill: mockUserSkills[0],
        jobRequirement: mockJobRequirements[0],
        matchType: 'exact',
        matchScore: 1.0,
        levelGap: 0,
        experienceGap: 0,
        confidence: 1.0
      };

      const perfectMatchingResult: SkillMatchingResult = {
        matches: [perfectMatch],
        transferableSkills: [],
        unmatchedUserSkills: [],
        unmatchedJobRequirements: [],
        overallMatchScore: 1.0
      };

      (mockSkillMatchingService.matchSkills as jest.Mock).mockResolvedValue(perfectMatchingResult);

      const result = await gapAnalysisService.analyzeGaps([mockUserSkills[0]], [mockJobRequirements[0]]);

      expect(result.overallMatchPercentage).toBe(100);
      expect(result.skillGaps).toHaveLength(0); // No gaps for perfect match
    });

    it('should handle missing confidence scores', async () => {
      const matchWithoutConfidence: SkillMatch = {
        ...mockMatches[0],
        confidence: 0 // Very low confidence
      };

      const resultWithLowConfidence: SkillMatchingResult = {
        ...mockMatchingResult,
        matches: [matchWithoutConfidence]
      };

      (mockSkillMatchingService.matchSkills as jest.Mock).mockResolvedValue(resultWithLowConfidence);

      const result = await gapAnalysisService.analyzeGaps(mockUserSkills, mockJobRequirements);

      expect(result.metadata.analysisConfidence).toBeLessThan(0.8); // Should reflect low confidence
    });
  });
});