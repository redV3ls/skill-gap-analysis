-- Migration: Create team analysis tables
-- Created: 2024-01-20

-- Table for storing team analysis results
CREATE TABLE IF NOT EXISTS team_analyses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    project_description TEXT,
    team_size INTEGER NOT NULL DEFAULT 0,
    overall_match INTEGER NOT NULL, -- 0-100 percentage
    critical_gaps_count INTEGER NOT NULL DEFAULT 0,
    team_strengths_count INTEGER NOT NULL DEFAULT 0,
    analysis_data TEXT NOT NULL, -- JSON blob with full analysis results
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for efficient user queries
CREATE INDEX IF NOT EXISTS idx_team_analyses_user_id ON team_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_team_analyses_created_at ON team_analyses(user_id, created_at DESC);

-- Table for storing team member analysis results (normalized for querying)
CREATE TABLE IF NOT EXISTS team_member_analyses (
    id TEXT PRIMARY KEY,
    team_analysis_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_name TEXT,
    role TEXT,
    department TEXT,
    overall_match INTEGER NOT NULL, -- 0-100 percentage
    skill_gaps_count INTEGER NOT NULL DEFAULT 0,
    strengths_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (team_analysis_id) REFERENCES team_analyses(id) ON DELETE CASCADE
);

-- Indexes for team member analysis queries
CREATE INDEX IF NOT EXISTS idx_team_member_analyses_team_id ON team_member_analyses(team_analysis_id);
CREATE INDEX IF NOT EXISTS idx_team_member_analyses_match ON team_member_analyses(overall_match DESC);

-- Table for storing team-wide skill gaps
CREATE TABLE IF NOT EXISTS team_skill_gaps (
    id TEXT PRIMARY KEY,
    team_analysis_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    members_needing INTEGER NOT NULL,
    percentage_needing INTEGER NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'moderate', 'minor')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (team_analysis_id) REFERENCES team_analyses(id) ON DELETE CASCADE
);

-- Index for team skill gaps queries
CREATE INDEX IF NOT EXISTS idx_team_skill_gaps_team_id ON team_skill_gaps(team_analysis_id);
CREATE INDEX IF NOT EXISTS idx_team_skill_gaps_severity ON team_skill_gaps(severity, members_needing DESC);