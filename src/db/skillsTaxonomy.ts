import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Database } from '../config/database';
import { skills, skillSynonyms } from './schema';
import { logger } from '../utils/logger';

// Predefined skill categories
export const SKILL_CATEGORIES = {
  PROGRAMMING: 'Programming',
  FRAMEWORKS: 'Frameworks & Libraries',
  DATABASES: 'Databases',
  CLOUD: 'Cloud & DevOps',
  DESIGN: 'Design & UX',
  PROJECT_MANAGEMENT: 'Project Management',
  SOFT_SKILLS: 'Soft Skills',
  LANGUAGES: 'Languages',
  TOOLS: 'Tools & Software',
  METHODOLOGIES: 'Methodologies',
  SECURITY: 'Security',
  MOBILE: 'Mobile Development',
  WEB: 'Web Development',
  DATA_SCIENCE: 'Data Science & Analytics',
  AI_ML: 'AI & Machine Learning',
  TESTING: 'Testing & QA',
  NETWORKING: 'Networking',
  HARDWARE: 'Hardware',
  BUSINESS: 'Business & Finance',
  MARKETING: 'Marketing & Sales',
} as const;

// Zod schemas for validation
export const skillCategoryEnum = z.enum([
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
]);

export const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  category: skillCategoryEnum,
  description: z.string().max(500).optional(),
  synonyms: z.array(z.string().min(1).max(100)).optional().default([]),
});

export const updateSkillSchema = createSkillSchema.partial();

export const skillSearchSchema = z.object({
  query: z.string().min(1).optional(),
  category: skillCategoryEnum.optional(),
  includeDescription: z.boolean().default(false),
  includeSynonyms: z.boolean().default(false),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const skillNormalizationSchema = z.object({
  skillNames: z.array(z.string().min(1)).min(1, 'At least one skill name is required'),
  fuzzyMatch: z.boolean().default(true),
  createMissing: z.boolean().default(false),
});

export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type SkillSearchInput = z.infer<typeof skillSearchSchema>;
export type SkillNormalizationInput = z.infer<typeof skillNormalizationSchema>;

// Skills Taxonomy and Categorization Service
export class SkillsTaxonomyService {
  constructor(private db: Database) {}

  async createSkill(input: CreateSkillInput) {
    try {
      // Validate input
      const validatedInput = createSkillSchema.parse(input);
      
      const skillId = uuidv4();
      const now = new Date().toISOString();

      // Check if skill already exists
      const existingSkill = await this.db
        .select()
        .from(skills)
        .where(eq(skills.name, validatedInput.name))
        .limit(1);

      if (existingSkill.length > 0) {
        throw new Error('Skill already exists');
      }

      // Start transaction
      const result = await this.db.transaction(async (tx) => {
        // Create skill
        const [skill] = await tx.insert(skills).values({
          id: skillId,
          name: validatedInput.name,
          category: validatedInput.category,
          description: validatedInput.description,
          createdAt: now,
          updatedAt: now,
        }).returning();

        // Create synonyms if provided
        if (validatedInput.synonyms && validatedInput.synonyms.length > 0) {
          // First, create synonym skills if they don't exist
          for (const synonymName of validatedInput.synonyms) {
            const existingSynonym = await tx
              .select()
              .from(skills)
              .where(eq(skills.name, synonymName))
              .limit(1);

            let synonymSkillId;
            if (existingSynonym.length === 0) {
              // Create synonym skill
              const [synonymSkill] = await tx.insert(skills).values({
                id: uuidv4(),
                name: synonymName,
                category: validatedInput.category,
                description: `Synonym for ${validatedInput.name}`,
                createdAt: now,
                updatedAt: now,
              }).returning();
              synonymSkillId = synonymSkill.id;
            } else {
              synonymSkillId = existingSynonym[0].id;
            }

            // Create synonym relationship
            await tx.insert(skillSynonyms).values({
              id: uuidv4(),
              skillId: skillId,
              synonymId: synonymSkillId,
              createdAt: now,
            });
          }
        }

        return skill;
      });

      logger.info(`Skill created successfully: ${skillId}`);
      return result;
    } catch (error) {
      logger.error('Error creating skill:', error);
      throw error;
    }
  }

  async getSkill(skillId: string) {
    try {
      const skill = await this.db
        .select()
        .from(skills)
        .where(eq(skills.id, skillId))
        .limit(1);

      if (skill.length === 0) {
        return null;
      }

      // Get synonyms
      const synonymsData = await this.db
        .select({
          id: skills.id,
          name: skills.name,
          category: skills.category,
        })
        .from(skillSynonyms)
        .innerJoin(skills, eq(skillSynonyms.synonymId, skills.id))
        .where(eq(skillSynonyms.skillId, skillId));

      const skillWithSynonyms = {
        ...skill[0],
        synonyms: synonymsData,
      };

      return skillWithSynonyms;
    } catch (error) {
      logger.error('Error fetching skill:', error);
      throw error;
    }
  }

  async updateSkill(skillId: string, input: UpdateSkillInput) {
    try {
      // Validate input
      const validatedInput = updateSkillSchema.parse(input);
      
      const now = new Date().toISOString();

      const result = await this.db.transaction(async (tx) => {
        // Update skill
        const [updatedSkill] = await tx
          .update(skills)
          .set({
            ...validatedInput,
            updatedAt: now,
          })
          .where(eq(skills.id, skillId))
          .returning();

        if (!updatedSkill) {
          throw new Error('Skill not found');
        }

        // Update synonyms if provided
        if (validatedInput.synonyms !== undefined) {
          // Delete existing synonyms
          await tx.delete(skillSynonyms).where(eq(skillSynonyms.skillId, skillId));

          // Add new synonyms
          if (validatedInput.synonyms.length > 0) {
            for (const synonymName of validatedInput.synonyms) {
              const existingSynonym = await tx
                .select()
                .from(skills)
                .where(eq(skills.name, synonymName))
                .limit(1);

              let synonymSkillId;
              if (existingSynonym.length === 0) {
                // Create synonym skill
                const [synonymSkill] = await tx.insert(skills).values({
                  id: uuidv4(),
                  name: synonymName,
                  category: updatedSkill.category,
                  description: `Synonym for ${updatedSkill.name}`,
                  createdAt: now,
                  updatedAt: now,
                }).returning();
                synonymSkillId = synonymSkill.id;
              } else {
                synonymSkillId = existingSynonym[0].id;
              }

              // Create synonym relationship
              await tx.insert(skillSynonyms).values({
                id: uuidv4(),
                skillId: skillId,
                synonymId: synonymSkillId,
                createdAt: now,
              });
            }
          }
        }

        return updatedSkill;
      });

      logger.info(`Skill updated successfully: ${skillId}`);
      return result;
    } catch (error) {
      logger.error('Error updating skill:', error);
      throw error;
    }
  }

  async deleteSkill(skillId: string) {
    try {
      const result = await this.db.transaction(async (tx) => {
        // Delete synonyms
        await tx.delete(skillSynonyms).where(eq(skillSynonyms.skillId, skillId));
        await tx.delete(skillSynonyms).where(eq(skillSynonyms.synonymId, skillId));

        // Delete skill
        const [deletedSkill] = await tx
          .delete(skills)
          .where(eq(skills.id, skillId))
          .returning();

        if (!deletedSkill) {
          throw new Error('Skill not found');
        }

        return deletedSkill;
      });

      logger.info(`Skill deleted successfully: ${skillId}`);
      return result;
    } catch (error) {
      logger.error('Error deleting skill:', error);
      throw error;
    }
  }

  async searchSkills(searchInput: SkillSearchInput) {
    try {
      // Validate input
      const validatedInput = skillSearchSchema.parse(searchInput);
      
      let skillsResult;
      
      if (validatedInput.query || validatedInput.category) {
        const conditions = [];
        
        if (validatedInput.query) {
          conditions.push(like(skills.name, `%${validatedInput.query}%`));
          if (validatedInput.includeDescription) {
            conditions.push(like(skills.description, `%${validatedInput.query}%`));
          }
        }
        
        if (validatedInput.category) {
          conditions.push(eq(skills.category, validatedInput.category));
        }

        // Build query with OR condition for name and description search
        if (validatedInput.query && validatedInput.includeDescription && !validatedInput.category) {
          skillsResult = await this.db
            .select()
            .from(skills)
            .where(
              or(
                like(skills.name, `%${validatedInput.query}%`),
                like(skills.description, `%${validatedInput.query}%`)
              )
            )
            .orderBy(asc(skills.name))
            .limit(validatedInput.limit)
            .offset(validatedInput.offset);
        } else if (conditions.length > 0) {
          skillsResult = await this.db
            .select()
            .from(skills)
            .where(and(...conditions))
            .orderBy(asc(skills.name))
            .limit(validatedInput.limit)
            .offset(validatedInput.offset);
        } else {
          skillsResult = await this.db
            .select()
            .from(skills)
            .orderBy(asc(skills.name))
            .limit(validatedInput.limit)
            .offset(validatedInput.offset);
        }
      } else {
        // No filters, get all skills
        skillsResult = await this.db
          .select()
          .from(skills)
          .orderBy(asc(skills.name))
          .limit(validatedInput.limit)
          .offset(validatedInput.offset);
      }

      // Include synonyms if requested
      if (validatedInput.includeSynonyms) {
        const skillsWithSynonyms = [];
        
        for (const skill of skillsResult) {
          const synonymsData = await this.db
            .select({
              id: skills.id,
              name: skills.name,
            })
            .from(skillSynonyms)
            .innerJoin(skills, eq(skillSynonyms.synonymId, skills.id))
            .where(eq(skillSynonyms.skillId, skill.id));

          skillsWithSynonyms.push({
            ...skill,
            synonyms: synonymsData,
          });
        }
        
        return skillsWithSynonyms;
      }

      return skillsResult;
    } catch (error) {
      logger.error('Error searching skills:', error);
      throw error;
    }
  }

  async getSkillsByCategory(category: string) {
    try {
      const skillsResult = await this.db
        .select()
        .from(skills)
        .where(eq(skills.category, category))
        .orderBy(asc(skills.name));

      return skillsResult;
    } catch (error) {
      logger.error('Error fetching skills by category:', error);
      throw error;
    }
  }

  async getAllCategories() {
    try {
      const categories = await this.db
        .select({
          category: skills.category,
        })
        .from(skills)
        .groupBy(skills.category)
        .orderBy(asc(skills.category));

      return categories.map(c => c.category);
    } catch (error) {
      logger.error('Error fetching categories:', error);
      throw error;
    }
  }

  async normalizeSkillNames(input: SkillNormalizationInput) {
    try {
      // Validate input
      const validatedInput = skillNormalizationSchema.parse(input);
      
      const normalizedSkills = [];
      
      for (const skillName of validatedInput.skillNames) {
        // First, try exact match
        let matchedSkill = await this.db
          .select()
          .from(skills)
          .where(eq(skills.name, skillName))
          .limit(1);

        if (matchedSkill.length > 0) {
          normalizedSkills.push({
            originalName: skillName,
            normalizedName: matchedSkill[0].name,
            skillId: matchedSkill[0].id,
            category: matchedSkill[0].category,
            matchType: 'exact',
          });
          continue;
        }

        // Try synonym match
        const synonymMatch = await this.db
          .select({
            skillId: skillSynonyms.skillId,
            skillName: skills.name,
            skillCategory: skills.category,
          })
          .from(skillSynonyms)
          .innerJoin(skills, eq(skillSynonyms.synonymId, skills.id))
          .where(eq(skills.name, skillName))
          .limit(1);

        if (synonymMatch.length > 0) {
          const mainSkill = await this.db
            .select()
            .from(skills)
            .where(eq(skills.id, synonymMatch[0].skillId))
            .limit(1);

          if (mainSkill.length > 0) {
            normalizedSkills.push({
              originalName: skillName,
              normalizedName: mainSkill[0].name,
              skillId: mainSkill[0].id,
              category: mainSkill[0].category,
              matchType: 'synonym',
            });
            continue;
          }
        }

        // Try fuzzy match if enabled
        if (validatedInput.fuzzyMatch) {
          const fuzzyMatches = await this.db
            .select()
            .from(skills)
            .where(like(skills.name, `%${skillName}%`))
            .limit(5);

          if (fuzzyMatches.length > 0) {
            // Find best match (shortest name that contains the search term)
            const bestMatch = fuzzyMatches.reduce((best, current) => 
              current.name.length < best.name.length ? current : best
            );

            normalizedSkills.push({
              originalName: skillName,
              normalizedName: bestMatch.name,
              skillId: bestMatch.id,
              category: bestMatch.category,
              matchType: 'fuzzy',
              confidence: this.calculateFuzzyMatchConfidence(skillName, bestMatch.name),
            });
            continue;
          }
        }

        // Create missing skill if enabled
        if (validatedInput.createMissing) {
          const newSkillId = uuidv4();
          const now = new Date().toISOString();
          
          // Try to categorize the skill based on common patterns
          const category = this.categorizeSkillByName(skillName);
          
          const [newSkill] = await this.db.insert(skills).values({
            id: newSkillId,
            name: skillName,
            category: category,
            description: `Auto-created skill`,
            createdAt: now,
            updatedAt: now,
          }).returning();

          normalizedSkills.push({
            originalName: skillName,
            normalizedName: newSkill.name,
            skillId: newSkill.id,
            category: newSkill.category,
            matchType: 'created',
          });
        } else {
          // No match found
          normalizedSkills.push({
            originalName: skillName,
            normalizedName: null,
            skillId: null,
            category: null,
            matchType: 'no_match',
          });
        }
      }

      return normalizedSkills;
    } catch (error) {
      logger.error('Error normalizing skill names:', error);
      throw error;
    }
  }

  async addSynonym(skillId: string, synonymName: string) {
    try {
      const now = new Date().toISOString();

      // Check if main skill exists
      const mainSkill = await this.db
        .select()
        .from(skills)
        .where(eq(skills.id, skillId))
        .limit(1);

      if (mainSkill.length === 0) {
        throw new Error('Main skill not found');
      }

      // Check if synonym already exists as a skill
      let synonymSkill = await this.db
        .select()
        .from(skills)
        .where(eq(skills.name, synonymName))
        .limit(1);

      let synonymSkillId;
      if (synonymSkill.length === 0) {
        // Create synonym skill
        const [newSynonym] = await this.db.insert(skills).values({
          id: uuidv4(),
          name: synonymName,
          category: mainSkill[0].category,
          description: `Synonym for ${mainSkill[0].name}`,
          createdAt: now,
          updatedAt: now,
        }).returning();
        synonymSkillId = newSynonym.id;
      } else {
        synonymSkillId = synonymSkill[0].id;
      }

      // Check if synonym relationship already exists
      const existingRelation = await this.db
        .select()
        .from(skillSynonyms)
        .where(
          and(
            eq(skillSynonyms.skillId, skillId),
            eq(skillSynonyms.synonymId, synonymSkillId)
          )
        )
        .limit(1);

      if (existingRelation.length > 0) {
        throw new Error('Synonym relationship already exists');
      }

      // Create synonym relationship
      const [synonymRelation] = await this.db.insert(skillSynonyms).values({
        id: uuidv4(),
        skillId: skillId,
        synonymId: synonymSkillId,
        createdAt: now,
      }).returning();

      logger.info(`Synonym added successfully: ${skillId} -> ${synonymSkillId}`);
      return synonymRelation;
    } catch (error) {
      logger.error('Error adding synonym:', error);
      throw error;
    }
  }

  async removeSynonym(skillId: string, synonymId: string) {
    try {
      const [deletedRelation] = await this.db
        .delete(skillSynonyms)
        .where(
          and(
            eq(skillSynonyms.skillId, skillId),
            eq(skillSynonyms.synonymId, synonymId)
          )
        )
        .returning();

      if (!deletedRelation) {
        throw new Error('Synonym relationship not found');
      }

      logger.info(`Synonym removed successfully: ${skillId} -> ${synonymId}`);
      return deletedRelation;
    } catch (error) {
      logger.error('Error removing synonym:', error);
      throw error;
    }
  }

  private calculateFuzzyMatchConfidence(original: string, match: string): number {
    // Simple confidence calculation based on string similarity
    const originalLower = original.toLowerCase();
    const matchLower = match.toLowerCase();
    
    if (matchLower.includes(originalLower)) {
      return 0.8;
    }
    
    if (originalLower.includes(matchLower)) {
      return 0.7;
    }
    
    // Calculate Levenshtein distance-based confidence
    const distance = this.levenshteinDistance(originalLower, matchLower);
    const maxLength = Math.max(originalLower.length, matchLower.length);
    return Math.max(0, 1 - (distance / maxLength));
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private categorizeSkillByName(skillName: string): string {
    const name = skillName.toLowerCase();
    
    // Programming languages
    if (/\b(javascript|python|java|c\+\+|c#|php|ruby|go|rust|swift|kotlin|typescript)\b/.test(name)) {
      return SKILL_CATEGORIES.PROGRAMMING;
    }
    
    // Frameworks
    if (/\b(react|angular|vue|django|flask|spring|express|laravel|rails)\b/.test(name)) {
      return SKILL_CATEGORIES.FRAMEWORKS;
    }
    
    // Databases
    if (/\b(mysql|postgresql|mongodb|redis|elasticsearch|oracle|sql)\b/.test(name)) {
      return SKILL_CATEGORIES.DATABASES;
    }
    
    // Cloud & DevOps
    if (/\b(aws|azure|gcp|docker|kubernetes|jenkins|terraform|ansible)\b/.test(name)) {
      return SKILL_CATEGORIES.CLOUD;
    }
    
    // Design
    if (/\b(photoshop|illustrator|figma|sketch|ui|ux|design)\b/.test(name)) {
      return SKILL_CATEGORIES.DESIGN;
    }
    
    // Default to Tools & Software
    return SKILL_CATEGORIES.TOOLS;
  }
}