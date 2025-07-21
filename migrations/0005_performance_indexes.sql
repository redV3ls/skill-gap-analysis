-- Performance optimization indexes for the skill gap analysis database

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Skills table indexes
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

-- User skills indexes
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_skill ON user_skills(user_id, skill_id);

-- Gap analyses indexes
CREATE INDEX IF NOT EXISTS idx_gap_analyses_user_id ON gap_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_gap_analyses_user_created ON gap_analyses(user_id, created_at DESC);

-- API keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_name ON api_keys(name);

-- Skill demand history indexes
CREATE INDEX IF NOT EXISTS idx_skill_demand_skill_date ON skill_demand_history(skill_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_demand_industry_date ON skill_demand_history(industry, recorded_at DESC);

-- Emerging skills indexes
CREATE INDEX IF NOT EXISTS idx_emerging_skills_category ON emerging_skills(category);
CREATE INDEX IF NOT EXISTS idx_emerging_skills_growth_velocity ON emerging_skills(growth_velocity DESC);
CREATE INDEX IF NOT EXISTS idx_emerging_skills_first_detected ON emerging_skills(first_detected DESC);

-- Regional skill trends indexes
CREATE INDEX IF NOT EXISTS idx_regional_trends_region ON regional_skill_trends(region);
CREATE INDEX IF NOT EXISTS idx_regional_trends_skill_region ON regional_skill_trends(skill_name, region);
CREATE INDEX IF NOT EXISTS idx_regional_trends_date ON regional_skill_trends(analysis_date DESC);

-- Market forecasts indexes
CREATE INDEX IF NOT EXISTS idx_forecasts_skill ON market_forecasts(skill_name);
CREATE INDEX IF NOT EXISTS idx_forecasts_skill_region ON market_forecasts(skill_name, region);
CREATE INDEX IF NOT EXISTS idx_forecasts_created ON market_forecasts(created_at DESC);
