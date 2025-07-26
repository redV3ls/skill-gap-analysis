import { describe, it, expect, beforeEach, jest } from 'vitest';
import { GapAnalysisService } from '../services/gapAnalysis';
import { SkillMatchingService } from '../services/skillMatching';

// Mock the logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('GapAnalysisService - Core Functionality', () => {
  let gapAnalysisService: GapAnalysisService;
  let mockSkillMatchingService: any;

  beforeEach(() => {
    mockSkillMatchingService = {
      matchSkills: vi.fn()
    };
    gapAnalysisService = new GapAnalysisService(mockSkillMatchingService);
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

  describe('utility methods', () => {
    it('should get correct level weights', () => {
      const beginnerWeight = gapAnalysisService['getLevelWeight']('beginner');
      const expertWeight = gapAnalysisService['getLevelWeight']('expert');
      
      expect(beginnerWeight).toBe(1);
      expect(expertWeight).toBe(4);
      expect(expertWeight).toBeGreaterThan(beginnerWeight);
    });

    it('should handle unknown skill levels', () => {
      const unknownWeight = gapAnalysisService['getLevelWeight']('unknown' as any);
      expect(unknownWeight).toBe(1); // Default to beginner
    });
  });
});