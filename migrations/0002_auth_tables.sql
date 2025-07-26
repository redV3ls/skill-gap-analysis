-- Migration: Add authentication and security tables
-- Created: 2025-01-20

-- Update users table to include authentication fields
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN organization TEXT;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN last_login TEXT;

-- Make name field required (if not already)
-- Note: SQLite doesn't support ALTER COLUMN, so we'll handle this in application logic

-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL, -- JSON array as text
  expires_at TEXT,
  last_used TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, -- 0 or 1 (boolean)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at);

-- NOTE: Admin users should be created through secure administrative processes
-- No default credentials are included for security reasons
-- Use the admin creation script provided in the scripts/ directory