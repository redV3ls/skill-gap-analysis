import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  organization: text('organization'),
  role: text('role').notNull().default('user'), // user, admin
  lastLogin: text('last_login'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// API keys table
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  permissions: text('permissions').notNull(), // JSON array as text
  expiresAt: text('expires_at'),
  lastUsed: text('last_used'),
  isActive: integer('is_active').notNull().default(1), // 0 or 1 (boolean)
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// User profiles table
export const userProfiles = sqliteTable('user_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  industry: text('industry'),
  location: text('location'),
  experience: integer('experience'), // years of experience
  learningStyle: text('learning_style'), // visual, auditory, kinesthetic
  timeCommitment: integer('time_commitment'), // hours per week
  budgetRange: text('budget_range'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Skills table
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  category: text('category').notNull(),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// User skills table
export const userSkills = sqliteTable('user_skills', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => userProfiles.id, { onDelete: 'cascade' }),
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  level: text('level').notNull(), // beginner, intermediate, advanced, expert
  yearsExperience: integer('years_experience'),
  lastUsed: text('last_used'),
  confidenceScore: real('confidence_score'), // 0.0 to 1.0
  certifications: text('certifications'), // JSON array as text
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Jobs table
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  company: text('company'),
  industry: text('industry'),
  location: text('location'),
  description: text('description'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  currency: text('currency').default('USD'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Job skills table
export const jobSkills = sqliteTable('job_skills', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  importance: text('importance').notNull(), // critical, important, nice-to-have
  minimumLevel: text('minimum_level').notNull(), // beginner, intermediate, advanced, expert
  yearsRequired: integer('years_required'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Gap analyses table
export const gapAnalyses = sqliteTable('gap_analyses', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  overallMatch: real('overall_match').notNull(), // 0.0 to 1.0
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Skill gaps table
export const skillGaps = sqliteTable('skill_gaps', {
  id: text('id').primaryKey(),
  analysisId: text('analysis_id').notNull().references(() => gapAnalyses.id, { onDelete: 'cascade' }),
  skillName: text('skill_name').notNull(),
  currentLevel: text('current_level'),
  requiredLevel: text('required_level').notNull(),
  gapSeverity: text('gap_severity').notNull(), // critical, moderate, minor
  timeToBridge: integer('time_to_bridge'), // estimated days
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// Skill synonyms table
export const skillSynonyms = sqliteTable('skill_synonyms', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  synonymId: text('synonym_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// Industry trends table
export const industryTrends = sqliteTable('industry_trends', {
  id: text('id').primaryKey(),
  skillName: text('skill_name').notNull(),
  industry: text('industry').notNull(),
  region: text('region'),
  demandScore: real('demand_score').notNull(), // 0.0 to 1.0
  growthRate: real('growth_rate').notNull(), // percentage
  averageSalary: integer('average_salary'),
  jobOpenings: integer('job_openings'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});