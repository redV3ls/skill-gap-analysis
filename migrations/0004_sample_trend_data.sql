-- Insert sample data for industry trends
INSERT INTO industry_trends (id, skill_name, industry, region, demand_score, growth_rate, average_salary, job_openings, created_at) VALUES
('trend-1', 'JavaScript', 'Technology', 'North America', 0.92, 0.15, 120000, 45000, datetime('now')),
('trend-2', 'Python', 'Technology', 'North America', 0.88, 0.25, 125000, 38000, datetime('now')),
('trend-3', 'React', 'Technology', 'North America', 0.85, 0.20, 115000, 32000, datetime('now')),
('trend-4', 'Machine Learning', 'Technology', 'Global', 0.78, 0.35, 140000, 25000, datetime('now')),
('trend-5', 'Cloud Computing', 'Technology', 'Europe', 0.82, 0.30, 110000, 28000, datetime('now')),
('trend-6', 'Data Analysis', 'Finance', 'Global', 0.75, 0.18, 95000, 22000, datetime('now')),
('trend-7', 'Project Management', 'Business', 'Global', 0.70, 0.10, 90000, 18000, datetime('now')),
('trend-8', 'Kubernetes', 'Technology', 'North America', 0.72, 0.40, 130000, 15000, datetime('now')),
('trend-9', 'TypeScript', 'Technology', 'Europe', 0.80, 0.28, 105000, 20000, datetime('now')),
('trend-10', 'DevOps', 'Technology', 'Asia', 0.76, 0.22, 95000, 17000, datetime('now'));

-- Insert sample emerging skills
INSERT INTO emerging_skills (id, skill_name, category, emergence_score, growth_velocity, first_detected, related_skills, industries, predicted_peak_demand, confidence, created_at) VALUES
('emrg-1', 'AI Prompt Engineering', 'AI & Machine Learning', 0.95, 0.85, '2023-01-01', '["Machine Learning", "NLP", "ChatGPT"]', '["Technology", "Marketing", "Education"]', '2025-06-01', 0.88, datetime('now')),
('emrg-2', 'Rust', 'Programming', 0.82, 0.45, '2022-06-01', '["C++", "Systems Programming", "WebAssembly"]', '["Technology", "Gaming", "Blockchain"]', '2026-01-01', 0.75, datetime('now')),
('emrg-3', 'Web3 Development', 'Blockchain', 0.78, 0.38, '2021-11-01', '["Blockchain", "Solidity", "Smart Contracts"]', '["Finance", "Technology", "Gaming"]', '2025-12-01', 0.70, datetime('now')),
('emrg-4', 'Quantum Computing', 'Emerging Tech', 0.65, 0.55, '2022-03-01', '["Mathematics", "Physics", "Algorithms"]', '["Research", "Technology", "Finance"]', '2027-01-01', 0.68, datetime('now')),
('emrg-5', 'Edge Computing', 'Cloud & DevOps', 0.73, 0.42, '2022-09-01', '["IoT", "Cloud Computing", "5G"]', '["Technology", "Manufacturing", "Healthcare"]', '2025-09-01', 0.80, datetime('now'));

-- Insert sample skill demand history
INSERT INTO skill_demand_history (id, skill_name, industry, region, demand_score, job_count, avg_salary, data_source, recorded_at) VALUES
('hist-1', 'JavaScript', 'Technology', 'North America', 0.88, 42000, 118000, 'aggregate', datetime('now', '-6 months')),
('hist-2', 'JavaScript', 'Technology', 'North America', 0.90, 43500, 119000, 'aggregate', datetime('now', '-3 months')),
('hist-3', 'JavaScript', 'Technology', 'North America', 0.92, 45000, 120000, 'aggregate', datetime('now')),
('hist-4', 'Python', 'Technology', 'North America', 0.82, 35000, 122000, 'aggregate', datetime('now', '-6 months')),
('hist-5', 'Python', 'Technology', 'North America', 0.85, 36500, 123500, 'aggregate', datetime('now', '-3 months')),
('hist-6', 'Python', 'Technology', 'North America', 0.88, 38000, 125000, 'aggregate', datetime('now')),
('hist-7', 'Machine Learning', 'Technology', 'Global', 0.68, 20000, 135000, 'aggregate', datetime('now', '-6 months')),
('hist-8', 'Machine Learning', 'Technology', 'Global', 0.73, 22500, 137500, 'aggregate', datetime('now', '-3 months')),
('hist-9', 'Machine Learning', 'Technology', 'Global', 0.78, 25000, 140000, 'aggregate', datetime('now'));

-- Insert sample regional trends
INSERT INTO regional_skill_trends (id, region, country, city, skill_name, demand_score, supply_score, gap_score, avg_salary, salary_growth, job_growth, analysis_date) VALUES
('reg-1', 'North America', 'USA', 'San Francisco', 'JavaScript', 0.95, 0.80, 0.15, 145000, 0.08, 0.12, datetime('now')),
('reg-2', 'North America', 'USA', 'New York', 'Python', 0.90, 0.75, 0.15, 135000, 0.10, 0.15, datetime('now')),
('reg-3', 'Europe', 'UK', 'London', 'React', 0.88, 0.70, 0.18, 95000, 0.06, 0.10, datetime('now')),
('reg-4', 'Asia', 'India', 'Bangalore', 'Java', 0.85, 0.90, -0.05, 45000, 0.12, 0.20, datetime('now')),
('reg-5', 'Europe', 'Germany', 'Berlin', 'Kubernetes', 0.82, 0.65, 0.17, 85000, 0.09, 0.18, datetime('now'));

-- Insert sample market forecasts
INSERT INTO market_forecasts (id, skill_name, industry, region, forecast_type, current_value, forecast_3_months, forecast_6_months, forecast_1_year, confidence, methodology, created_at) VALUES
('fcst-1', 'JavaScript', 'Technology', 'Global', 'demand', 0.92, 0.93, 0.94, 0.95, 0.85, 'Time series analysis with linear regression', datetime('now')),
('fcst-2', 'Python', 'Technology', 'Global', 'demand', 0.88, 0.90, 0.92, 0.94, 0.88, 'Time series analysis with linear regression', datetime('now')),
('fcst-3', 'Machine Learning', 'Technology', 'Global', 'demand', 0.78, 0.82, 0.85, 0.90, 0.82, 'Time series analysis with linear regression', datetime('now')),
('fcst-4', 'Cloud Computing', 'Technology', 'Global', 'demand', 0.82, 0.84, 0.86, 0.88, 0.80, 'Time series analysis with linear regression', datetime('now')),
('fcst-5', 'Kubernetes', 'Technology', 'Global', 'demand', 0.72, 0.75, 0.78, 0.82, 0.78, 'Time series analysis with linear regression', datetime('now'));
