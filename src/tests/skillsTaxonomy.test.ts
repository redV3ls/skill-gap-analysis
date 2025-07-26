import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { 
  SKILL_CATEGORIES,
  skillCategoryEnum, 
  createSkillSchema,
  skillSearchSchema,
  skillNormalizationSchema
} from '../db/skillsTaxonomy';

describe('Skills Taxonomy Validation Schemas', () => {
  it('should validate skill categories correctly', () => {
    const validCategories = Object.values(SKILL_CATEGORIES);
    
    validCategories.forEach(category => {
      const result = skillCategoryEnum.safeParse(category);
      expect(result.success).toBe(true);
    });

    const invalidCategory = skillCategoryEnum.safeParse('Invalid Category');
    expect(invalidCategory.success).toBe(false);
  });

  it('should validate create skill schema', () => {
    const validSkill = {
      name: 'JavaScript',
      category: 'Programming' as const,
      description: 'A popular programming language for web development',
      synonyms: ['JS', 'ECMAScript'],
    };

    const result = createSkillSchema.safeParse(validSkill);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.synonyms).toEqual(['JS', 'ECMAScript']);
    }
  });

  it('should validate create skill schema with defaults', () => {
    const minimalSkill = {
      name: 'Python',
      category: 'Programming' as const,
    };

    const result = createSkillSchema.safeParse(minimalSkill);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.synonyms).toEqual([]);
    }
  });

  it('should reject invalid skill names', () => {
    const invalidSkill = {
      name: '', // Empty name
      category: 'Programming' as const,
    };

    const result = createSkillSchema.safeParse(invalidSkill);
    expect(result.success).toBe(false);
  });

  it('should reject skill names that are too long', () => {
    const invalidSkill = {
      name: 'A'.repeat(101), // Too long
      category: 'Programming' as const,
    };

    const result = createSkillSchema.safeParse(invalidSkill);
    expect(result.success).toBe(false);
  });

  it('should validate skill search schema with defaults', () => {
    const searchInput = {
      query: 'JavaScript',
    };

    const result = skillSearchSchema.safeParse(searchInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDescription).toBe(false);
      expect(result.data.includeSynonyms).toBe(false);
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it('should validate skill search schema with custom options', () => {
    const searchInput = {
      query: 'React',
      category: 'Frameworks & Libraries' as const,
      includeDescription: true,
      includeSynonyms: true,
      limit: 50,
      offset: 10,
    };

    const result = skillSearchSchema.safeParse(searchInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeDescription).toBe(true);
      expect(result.data.includeSynonyms).toBe(true);
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  it('should reject invalid search limits', () => {
    const invalidSearch = {
      query: 'Python',
      limit: 150, // Too high
    };

    const result = skillSearchSchema.safeParse(invalidSearch);
    expect(result.success).toBe(false);
  });

  it('should validate skill normalization schema', () => {
    const normalizationInput = {
      skillNames: ['JavaScript', 'React', 'Node.js'],
      fuzzyMatch: true,
      createMissing: false,
    };

    const result = skillNormalizationSchema.safeParse(normalizationInput);
    expect(result.success).toBe(true);
  });

  it('should validate skill normalization schema with defaults', () => {
    const normalizationInput = {
      skillNames: ['Python', 'Django'],
    };

    const result = skillNormalizationSchema.safeParse(normalizationInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fuzzyMatch).toBe(true);
      expect(result.data.createMissing).toBe(false);
    }
  });

  it('should reject empty skill names array', () => {
    const invalidInput = {
      skillNames: [], // Empty array
    };

    const result = skillNormalizationSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should reject empty skill names in array', () => {
    const invalidInput = {
      skillNames: ['JavaScript', '', 'Python'], // Contains empty string
    };

    const result = skillNormalizationSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it('should validate all predefined categories', () => {
    const categories = [
      'Programming',
      'Frameworks & Libraries',
      'Databases',
      'Cloud & DevOps',
      'Design & UX',
      'Project Management',
      'Soft Skills',
      'Languages',
      'Tools & Software',
      'Methodologies',
      'Security',
      'Mobile Development',
      'Web Development',
      'Data Science & Analytics',
      'AI & Machine Learning',
      'Testing & QA',
      'Networking',
      'Hardware',
      'Business & Finance',
      'Marketing & Sales',
    ];

    categories.forEach(category => {
      const result = skillCategoryEnum.safeParse(category);
      expect(result.success).toBe(true);
    });
  });

  it('should validate skill with long description', () => {
    const skillWithLongDescription = {
      name: 'Machine Learning',
      category: 'AI & Machine Learning' as const,
      description: 'A'.repeat(500), // Max length
    };

    const result = createSkillSchema.safeParse(skillWithLongDescription);
    expect(result.success).toBe(true);
  });

  it('should reject skill with too long description', () => {
    const skillWithTooLongDescription = {
      name: 'Deep Learning',
      category: 'AI & Machine Learning' as const,
      description: 'A'.repeat(501), // Too long
    };

    const result = createSkillSchema.safeParse(skillWithTooLongDescription);
    expect(result.success).toBe(false);
  });

  it('should validate synonyms array', () => {
    const skillWithSynonyms = {
      name: 'JavaScript',
      category: 'Programming' as const,
      synonyms: ['JS', 'ECMAScript', 'ES6', 'ES2015'],
    };

    const result = createSkillSchema.safeParse(skillWithSynonyms);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.synonyms).toHaveLength(4);
    }
  });

  it('should reject synonyms that are too long', () => {
    const skillWithLongSynonym = {
      name: 'JavaScript',
      category: 'Programming' as const,
      synonyms: ['JS', 'A'.repeat(101)], // One synonym too long
    };

    const result = createSkillSchema.safeParse(skillWithLongSynonym);
    expect(result.success).toBe(false);
  });
});