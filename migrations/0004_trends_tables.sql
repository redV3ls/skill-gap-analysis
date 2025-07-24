-- Migration: Create trends and forecast validation tables
-- Created: 2024-01-20

-- Table for storing forecast validation results
CREATE TABLE IF NOT EXISTS forecast_validations (
    id TEXT PRIMARY KEY,
    skill_name TEXT NOT NULL,
    forecast_date TEXT NOT NULL,
    actual_value REAL NOT NULL,
    predicted_value REAL NOT NULL,
    absolute_error REAL NOT NULL,
    percentage_error REAL NOT NULL,
    forecast_horizon TEXT NOT NULL CHECK (forecast_horizon IN ('3_months', '6_months', '1_year', '2_years')),
    validation_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for forecast validation queries
CREATE INDEX IF NOT EXISTS idx_forecast_validations_skill ON forecast_validations(skill_name);
CREATE INDEX IF NOT EXISTS idx_forecast_validations_date ON forecast_validations(validation_date);
CREATE INDEX IF NOT EXISTS idx_forecast_validations_horizon ON forecast_validations(forecast_horizon);

-- Table for storing trend computation job results
CREATE TABLE IF NOT EXISTS trend_computation_jobs (
    id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial', 'running')),
    records_processed INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    errors TEXT, -- JSON array of error messages
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for job monitoring
CREATE INDEX IF NOT EXISTS idx_trend_jobs_name ON trend_computation_jobs(job_name);
CREATE INDEX IF NOT EXISTS idx_trend_jobs_status ON trend_computation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_trend_jobs_date ON trend_computation_jobs(started_at DESC);

-- Table for storing external job data collection metrics
CREATE TABLE IF NOT EXISTS job_collection_metrics (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    total_jobs_collected INTEGER NOT NULL DEFAULT 0,
    skills_identified INTEGER NOT NULL DEFAULT 0,
    collection_duration_ms INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0.0,
    errors TEXT, -- JSON array of error messages
    collection_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for collection metrics
CREATE INDEX IF NOT EXISTS idx_job_metrics_source ON job_collection_metrics(source);
CREATE INDEX IF NOT EXISTS idx_job_metrics_date ON job_collection_metrics(collection_date DESC);

-- Table for storing forecast quality scores over time
CREATE TABLE IF NOT EXISTS forecast_quality_scores (
    id TEXT PRIMARY KEY,
    accuracy REAL NOT NULL,
    reliability REAL NOT NULL,
    coverage REAL NOT NULL,
    timeliness REAL NOT NULL,
    overall_score REAL NOT NULL,
    total_forecasts INTEGER NOT NULL DEFAULT 0,
    validated_forecasts INTEGER NOT NULL DEFAULT 0,
    score_date TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for quality score tracking
CREATE INDEX IF NOT EXISTS idx_quality_scores_date ON forecast_quality_scores(score_date DESC);

-- Table for storing skill trend alerts and notifications
CREATE TABLE IF NOT EXISTS trend_alerts (
    id TEXT PRIMARY KEY,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('emerging_skill', 'declining_skill', 'forecast_drift', 'accuracy_drop')),
    skill_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    message TEXT NOT NULL,
    data TEXT, -- JSON blob with alert-specific data
    is_acknowledged INTEGER NOT NULL DEFAULT 0,
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for alert management
CREATE INDEX IF NOT EXISTS idx_alerts_type ON trend_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_skill ON trend_alerts(skill_name);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON trend_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON trend_alerts(is_acknowledged, created_at DESC);