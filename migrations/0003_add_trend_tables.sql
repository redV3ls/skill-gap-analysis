-- Add tables for industry trends and analytics

-- Skill demand history table for tracking trends over time
CREATE TABLE IF NOT EXISTS skill_demand_history (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  industry TEXT,
  region TEXT,
  demand_score REAL NOT NULL,
  job_count INTEGER NOT NULL,
  avg_salary INTEGER,
  data_source TEXT,
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Emerging skills table
CREATE TABLE IF NOT EXISTS emerging_skills (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  category TEXT NOT NULL,
  emergence_score REAL NOT NULL,
  growth_velocity REAL NOT NULL,
  first_detected TEXT NOT NULL,
  related_skills TEXT,
  industries TEXT,
  predicted_peak_demand TEXT,
  confidence REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Regional skill trends table
CREATE TABLE IF NOT EXISTS regional_skill_trends (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL,
  country TEXT,
  city TEXT,
  skill_name TEXT NOT NULL,
  demand_score REAL NOT NULL,
  supply_score REAL NOT NULL,
  gap_score REAL NOT NULL,
  avg_salary INTEGER,
  salary_growth REAL,
  job_growth REAL,
  analysis_date TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Market forecasts table
CREATE TABLE IF NOT EXISTS market_forecasts (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  industry TEXT,
  region TEXT,
  forecast_type TEXT NOT NULL,
  current_value REAL NOT NULL,
  forecast_3_months REAL,
  forecast_6_months REAL,
  forecast_1_year REAL,
  forecast_2_years REAL,
  confidence REAL NOT NULL,
  methodology TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_skill_demand_history_skill ON skill_demand_history(skill_name);
CREATE INDEX IF NOT EXISTS idx_skill_demand_history_date ON skill_demand_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_emerging_skills_score ON emerging_skills(emergence_score DESC);
CREATE INDEX IF NOT EXISTS idx_emerging_skills_category ON emerging_skills(category);
CREATE INDEX IF NOT EXISTS idx_regional_trends_region ON regional_skill_trends(region);
CREATE INDEX IF NOT EXISTS idx_regional_trends_skill ON regional_skill_trends(skill_name);
CREATE INDEX IF NOT EXISTS idx_market_forecasts_skill ON market_forecasts(skill_name);
CREATE INDEX IF NOT EXISTS idx_market_forecasts_type ON market_forecasts(forecast_type);
