-- Migration: Advanced query optimization indexes
-- Created: 2025-01-24

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_user_skills_composite ON user_skills(user_id, skill_id, level);
CREATE INDEX IF NOT EXISTS idx_job_skills_composite ON job_skills(job_id, skill_id, importance);
CREATE INDEX IF NOT EXISTS idx_gap_analyses_user_created ON gap_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_gaps_analysis_severity ON skill_gaps(analysis_id, gap_severity, time_to_bridge);

-- Skills taxonomy optimization
CREATE INDEX IF NOT EXISTS idx_skills_name_category ON skills(name, category);
CREATE INDEX IF NOT EXISTS idx_skill_synonyms_both ON skill_synonyms(skill_id, synonym_id);

-- Trends and analytics optimization
CREATE INDEX IF NOT EXISTS idx_skill_demand_skill_industry ON skill_demand_history(skill_name, industry, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_emerging_skills_score ON emerging_skills(emergence_score DESC, growth_velocity DESC);
CREATE INDEX IF NOT EXISTS idx_regional_trends_region_skill ON regional_skill_trends(region, skill_name, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_forecasts_skill_type ON market_forecasts(skill_name, forecast_type, created_at DESC);

-- User profile optimization
CREATE INDEX IF NOT EXISTS idx_user_profiles_industry_location ON user_profiles(industry, location);
CREATE INDEX IF NOT EXISTS idx_user_profiles_experience ON user_profiles(experience DESC);

-- Job data optimization
CREATE INDEX IF NOT EXISTS idx_jobs_industry_location ON jobs(industry, location, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_title_company ON jobs(title, company);

-- API keys optimization
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active ON api_keys(user_id, is_active, expires_at);

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_last_used ON api_keys(last_used DESC);

-- Full-text search preparation (for future implementation)
-- Note: SQLite FTS would require separate virtual tables, but these indexes help with LIKE queries
CREATE INDEX IF NOT EXISTS idx_skills_name_lower ON skills(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_jobs_title_lower ON jobs(LOWER(title));
CREATE INDEX IF NOT EXISTS idx_jobs_description_partial ON jobs(description); -- For partial text search

-- Covering indexes for frequently accessed data
CREATE INDEX IF NOT EXISTS idx_user_skills_covering ON user_skills(user_id, skill_id, level, years_experience, confidence_score);
CREATE INDEX IF NOT EXISTS idx_job_skills_covering ON job_skills(job_id, skill_id, importance, minimum_level, years_required);

-- Time-based partitioning helpers
CREATE INDEX IF NOT EXISTS idx_gap_analyses_created_month ON gap_analyses(substr(created_at, 1, 7)); -- YYYY-MM
CREATE INDEX IF NOT EXISTS idx_skill_demand_recorded_month ON skill_demand_history(substr(recorded_at, 1, 7)); -- YYYY-MM

-- Analytical queries optimization
CREATE INDEX IF NOT EXISTS idx_industry_trends_skill_industry ON industry_trends(skill_name, industry, demand_score DESC);
CREATE INDEX IF NOT EXISTS idx_skill_gaps_severity_priority ON skill_gaps(gap_severity, time_to_bridge);