-- Migration: Create gap analysis tables
-- Created: 2024-01-20

-- Table for storing gap analysis results
CREATE TABLE IF NOT EXISTS gap_analyses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_job_title TEXT NOT NULL,
    target_job_company TEXT,
    target_job_location TEXT,
    overall_match INTEGER NOT NULL, -- 0-100 percentage
    skill_gaps_count INTEGER NOT NULL DEFAULT 0,
    strengths_count INTEGER NOT NULL DEFAULT 0,
    analysis_data TEXT NOT NULL, -- JSON blob with full analysis results
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_gap_analyses_user_id ON gap_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_gap_analyses_created_at ON gap_analyses(user_id, created_at DESC);

-- Table for storing individual skill gaps (normalized for querying)
CREATE TABLE IF NOT EXISTS skill_gaps (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    category TEXT NOT NULL,
    current_level TEXT, -- NULL if user doesn't have the skill
    required_level TEXT NOT NULL,
    gap_severity TEXT NOT NULL CHECK (gap_severity IN ('critical', 'moderate', 'minor')),
    importance TEXT NOT NULL CHECK (importance IN ('critical', 'important', 'nice-to-have')),
    time_to_competency INTEGER NOT NULL, -- months
    learning_difficulty TEXT NOT NULL CHECK (learning_difficulty IN ('easy', 'moderate', 'hard', 'very-hard')),
    priority INTEGER NOT NULL CHECK (priority >= 1 AND priority <= 10),
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES gap_analyses(id) ON DELETE CASCADE
);

-- Indexes for skill gap queries
CREATE INDEX IF NOT EXISTS idx_skill_gaps_analysis_id ON skill_gaps(analysis_id);
CREATE INDEX IF NOT EXISTS idx_skill_gaps_severity ON skill_gaps(gap_severity);
CREATE INDEX IF NOT EXISTS idx_skill_gaps_priority ON skill_gaps(priority DESC);

-- Table for storing user strengths (skills where they exceed requirements)
CREATE TABLE IF NOT EXISTS user_strengths (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    category TEXT NOT NULL,
    user_level TEXT NOT NULL,
    years_experience INTEGER,
    confidence_score REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES gap_analyses(id) ON DELETE CASCADE
);

-- Index for strengths queries
CREATE INDEX IF NOT EXISTS idx_user_strengths_analysis_id ON user_strengths(analysis_id);