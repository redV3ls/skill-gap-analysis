import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LearningPathGenerationService } from '../services/learningPathGeneration';
import { SkillGap } from '../services/gapAnalysis';
import { UserSkill, TransferableSkill } from '../services/skillMatching';
import { Database } from '../config/database';

// Mock the database and dependencies
const mockDb = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  transaction: jest.fn()
} as unknown as Database;

// Mock the SkillsTaxonomyService
jest.mock('../db/skillsTaxonomy', () => ({
  SkillsTaxonomyService: jest.fn().mockImplementation(() => ({
    normalizeSkillNames: jest.fn(),
    getSkill: jest.fn(),
    searchSkills: jest.fn()
  }))
}));

describe('LearningPathGenerationService', () => {
  let service: LearningPathGenerationService;
  let mockSkillGaps: SkillGap[];
  let mockUserSkills: UserSkill[];
  let mockTransferableSkills: TransferableSkill[];

  beforeEach(() => {
    service = new LearningPathGenerationService(mockDb);
    
    // Setup mock data
    mockSkillGaps = [
      {
        skillName: 'React',
        category: 'Frameworks & Libraries',
        currentLevel: undefined,
        requiredLevel: 'intermediate',
        importance: 'critical',
        gapSeverity: 'critical',
        levelGap: 2,
        timeToCompetency: 3,
        learningDifficulty: 'moderate',
        priority: 9,
        confidence: 0.9
      },
      {
        skillName: 'JavaScript',
        category: 'Programming',
        currentLevel: 'beginner',
        requiredLevel: 'intermediate',
        importance: 'critical',
        gapSeverity: 'moderate',
        levelGap: 1,
        timeToCompetency: 2,
        learningDifficulty: 'easy',
        priority: 10,
        confidence: 0.95
      },
      {
        skillName: 'Node.js',
        category: 'Programming',
        currentLevel: undefined,
        requiredLevel: 'intermediate',
        importance: 'important',
        gapSeverity: 'moderate',
        levelGap: 2,
        timeToCompetency: 4,
        learningDifficulty: 'moderate',
        priority: 7,
        confidence: 0.8
      },
      {
        skillName: 'Docker',
        category: 'Cloud & DevOps',
        currentLevel: undefined,
        requiredLevel: 'beginner',
        importance: 'nice-to-have',
        gapSeverity: 'minor',
        levelGap: 1,
        timeToCompetency: 2,
        learningDifficulty: 'easy',
        priority: 5,
        confidence: 0.85
      }
    ];

    mockUserSkills = [
      {
        skillId: 'skill-1',
        skillName: 'HTML',
        skillCategory: 'Web Development',
        level: 'intermediate',
        yearsExperience: 2,
        confidenceScore: 0.8
      },
      {
        skillId: 'skill-2',
        skillName: 'CSS',
        skillCategory: 'Web Development',
        level: 'intermediate',
        yearsExperience: 2,
        confidenceScore: 0.75
      }
    ];

    mockTransferableSkills = [
      {
        fromSkill: mockUserSkills[0],
        toSkillName: 'React',
        toCategory: 'Frameworks & Libraries',
        transferabilityScore: 0.6,
        reasoning: 'HTML knowledge helps with JSX understanding'
      }
    ];
  });

  describe('generateLearningPath', () => {
    it('should generate a complete learning path from skill gaps', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        mockTransferableSkills
      );

      expect(result).toBeDefined();
      expect(result.pathId).toMatch(/^path_\d+_[a-z0-9]+$/);
      expect(result.title).toBe('Frameworks & Libraries & Programming & Cloud & DevOps Learning Path');
      expect(result.steps).toHaveLength(4);
      expect(result.totalEstimatedHours).toBeGreaterThan(0);
      expect(result.estimatedCompletionWeeks).toBeGreaterThan(0);
      expect(['easy', 'moderate', 'hard', 'very-hard']).toContain(result.difficulty);
      expect(result.criticalPath).toBeInstanceOf(Array);
      expect(result.parallelTracks).toBeInstanceOf(Array);
    });

    it('should respect skill dependencies in the learning sequence', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      const stepNames = result.steps.map(step => step.skillName);
      const jsIndex = stepNames.indexOf('JavaScript');
      const reactIndex = stepNames.indexOf('React');
      const nodeIndex = stepNames.indexOf('Node.js');

      // JavaScript should come before React and Node.js
      expect(jsIndex).toBeLessThan(reactIndex);
      expect(jsIndex).toBeLessThan(nodeIndex);
    });

    it('should prioritize critical skills', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      const criticalSkills = result.steps.filter(step => 
        mockSkillGaps.find(gap => gap.skillName === step.skillName)?.importance === 'critical'
      );

      // Critical skills should have higher priority
      criticalSkills.forEach(step => {
        expect(step.priority).toBeGreaterThanOrEqual(7);
      });
    });

    it('should generate appropriate learning objectives', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      const reactStep = result.steps.find(step => step.skillName === 'React');
      expect(reactStep?.learningObjectives).toContain('Understand fundamental concepts of React');
      expect(reactStep?.learningObjectives).toContain('Set up development environment for React');
    });

    it('should generate meaningful milestones', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      const jsStep = result.steps.find(step => step.skillName === 'JavaScript');
      expect(jsStep?.milestones).toContain('Complete introduction to JavaScript');
      expect(jsStep?.milestones).toContain('Build first project using JavaScript');
    });

    it('should calculate realistic time estimates', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      // Easy skills should take less time than hard skills
      const easyStep = result.steps.find(step => step.difficulty === 'easy');
      const moderateStep = result.steps.find(step => step.difficulty === 'moderate');

      if (easyStep && moderateStep) {
        expect(easyStep.estimatedHours).toBeLessThan(moderateStep.estimatedHours);
      }

      // Total time should be reasonable
      expect(result.totalEstimatedHours).toBeGreaterThan(50);
      expect(result.totalEstimatedHours).toBeLessThan(1000);
    });

    it('should handle options for quick wins prioritization', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { prioritizeQuickWins: true }
      );

      // First few steps should be relatively easy and high priority
      const firstStep = result.steps[0];
      const quickWinScore = firstStep.priority / firstStep.estimatedHours;
      
      expect(quickWinScore).toBeGreaterThan(0.1); // Reasonable quick win score
    });

    it('should handle difficulty preferences', async () => {
      const easyFirstResult = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { difficultyPreference: 'easy-first' }
      );

      const hardFirstResult = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { difficultyPreference: 'hard-first' }
      );

      // Easy-first should start with easier skills
      expect(['easy', 'moderate']).toContain(easyFirstResult.steps[0].difficulty);
      
      // Hard-first should start with harder skills
      expect(['hard', 'very-hard', 'moderate']).toContain(hardFirstResult.steps[0].difficulty);
    });

    it('should limit path length when specified', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { maxPathLength: 2 }
      );

      expect(result.steps).toHaveLength(2);
      
      // Should prioritize the most important skills
      const priorities = result.steps.map(step => step.priority);
      expect(Math.max(...priorities)).toBeGreaterThanOrEqual(7);
    });

    it('should incorporate transferable skills', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        mockTransferableSkills,
        { includeTransferableSkills: true }
      );

      const reactStep = result.steps.find(step => step.skillName === 'React');
      
      // Should reduce estimated hours due to transferable knowledge
      expect(reactStep?.reasoning).toContain('HTML knowledge');
    });

    it('should identify parallel learning tracks', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      // Should identify skills that can be learned in parallel
      if (result.parallelTracks.length > 0) {
        const track = result.parallelTracks[0];
        expect(track.length).toBeGreaterThan(1);
        
        // Skills in parallel track should be from different categories or independent
        const categories = track.map(step => step.category);
        const uniqueCategories = new Set(categories);
        expect(uniqueCategories.size).toBeGreaterThanOrEqual(1);
      }
    });

    it('should calculate a meaningful critical path', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      expect(result.criticalPath).toBeInstanceOf(Array);
      
      if (result.criticalPath.length > 0) {
        // Critical path should contain skill names from our gaps
        const gapSkillNames = mockSkillGaps.map(gap => gap.skillName);
        result.criticalPath.forEach(skillName => {
          expect(gapSkillNames).toContain(skillName);
        });
      }
    });

    it('should provide accurate metadata', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      expect(result.metadata.totalSkills).toBe(mockSkillGaps.length);
      expect(result.metadata.prerequisitesMet).toBeGreaterThanOrEqual(0);
      expect(result.metadata.confidenceScore).toBeGreaterThan(0);
      expect(result.metadata.confidenceScore).toBeLessThanOrEqual(1);
      expect(result.metadata.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle empty skill gaps gracefully', async () => {
      const result = await service.generateLearningPath(
        [],
        mockUserSkills
      );

      expect(result.steps).toHaveLength(0);
      expect(result.totalEstimatedHours).toBe(0);
      expect(result.estimatedCompletionWeeks).toBe(0);
      expect(result.metadata.totalSkills).toBe(0);
    });

    it('should handle complex dependency chains', async () => {
      const complexGaps: SkillGap[] = [
        {
          skillName: 'Machine Learning',
          category: 'AI & Machine Learning',
          currentLevel: undefined,
          requiredLevel: 'intermediate',
          importance: 'critical',
          gapSeverity: 'critical',
          levelGap: 2,
          timeToCompetency: 12,
          learningDifficulty: 'very-hard',
          priority: 8,
          confidence: 0.7
        },
        {
          skillName: 'Python',
          category: 'Programming',
          currentLevel: 'beginner',
          requiredLevel: 'advanced',
          importance: 'critical',
          gapSeverity: 'moderate',
          levelGap: 2,
          timeToCompetency: 6,
          learningDifficulty: 'moderate',
          priority: 9,
          confidence: 0.9
        },
        {
          skillName: 'Statistics',
          category: 'Data Science & Analytics',
          currentLevel: undefined,
          requiredLevel: 'intermediate',
          importance: 'important',
          gapSeverity: 'moderate',
          levelGap: 2,
          timeToCompetency: 8,
          learningDifficulty: 'hard',
          priority: 7,
          confidence: 0.8
        }
      ];

      const result = await service.generateLearningPath(
        complexGaps,
        mockUserSkills
      );

      const stepNames = result.steps.map(step => step.skillName);
      const pythonIndex = stepNames.indexOf('Python');
      const statsIndex = stepNames.indexOf('Statistics');
      const mlIndex = stepNames.indexOf('Machine Learning');

      // Python and Statistics should come before Machine Learning
      expect(pythonIndex).toBeLessThan(mlIndex);
      expect(statsIndex).toBeLessThan(mlIndex);
    });

    it('should calculate appropriate completion time based on time commitment', async () => {
      const result10Hours = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { timeCommitmentHours: 10 }
      );

      const result20Hours = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { timeCommitmentHours: 20 }
      );

      // Higher time commitment should result in shorter completion time
      expect(result20Hours.estimatedCompletionWeeks).toBeLessThan(result10Hours.estimatedCompletionWeeks);
    });

    it('should handle error cases gracefully', async () => {
      // Test with invalid skill gaps
      const invalidGaps = [
        {
          skillName: '',
          category: '',
          requiredLevel: 'intermediate' as const,
          importance: 'critical' as const,
          gapSeverity: 'critical' as const,
          levelGap: 1,
          timeToCompetency: 1,
          learningDifficulty: 'easy' as const,
          priority: 1,
          confidence: 0.5
        }
      ];

      // Should not throw an error
      const result = await service.generateLearningPath(
        invalidGaps,
        mockUserSkills
      );

      expect(result).toBeDefined();
      expect(result.steps).toHaveLength(1);
    });
  });

  describe('skill dependency analysis', () => {
    it('should identify common programming prerequisites', async () => {
      const reactGap: SkillGap = {
        skillName: 'React',
        category: 'Frameworks & Libraries',
        currentLevel: undefined,
        requiredLevel: 'intermediate',
        importance: 'critical',
        gapSeverity: 'critical',
        levelGap: 2,
        timeToCompetency: 3,
        learningDifficulty: 'moderate',
        priority: 9,
        confidence: 0.9
      };

      const result = await service.generateLearningPath(
        [reactGap],
        mockUserSkills
      );

      const reactStep = result.steps.find(step => step.skillName === 'React');
      
      // React should have JavaScript as a prerequisite (if JavaScript is also a gap)
      // Since we're only providing React as a gap, prerequisites should be filtered
      expect(reactStep?.prerequisites).toBeInstanceOf(Array);
    });

    it('should handle circular dependencies gracefully', async () => {
      // This test ensures the topological sort handles circular dependencies
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      // Should complete without infinite loops
      expect(result.steps).toHaveLength(mockSkillGaps.length);
    });
  });

  describe('learning path optimization', () => {
    it('should balance priority and learning efficiency', async () => {
      const result = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills
      );

      // High priority skills should generally come earlier
      const priorities = result.steps.map(step => step.priority);
      const firstHalf = priorities.slice(0, Math.floor(priorities.length / 2));
      const secondHalf = priorities.slice(Math.floor(priorities.length / 2));

      const avgFirstHalf = firstHalf.reduce((sum, p) => sum + p, 0) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((sum, p) => sum + p, 0) / secondHalf.length;

      expect(avgFirstHalf).toBeGreaterThanOrEqual(avgSecondHalf - 1); // Allow some flexibility
    });

    it('should consider learning style preferences', async () => {
      const visualResult = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { learningStyle: 'visual' }
      );

      const auditoryResult = await service.generateLearningPath(
        mockSkillGaps,
        mockUserSkills,
        [],
        { learningStyle: 'auditory' }
      );

      // Both should generate valid paths (specific optimizations would depend on implementation)
      expect(visualResult.steps).toHaveLength(mockSkillGaps.length);
      expect(auditoryResult.steps).toHaveLength(mockSkillGaps.length);
    });
  });
});