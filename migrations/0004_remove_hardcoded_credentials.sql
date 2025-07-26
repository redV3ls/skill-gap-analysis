-- Migration: Remove hardcoded credentials and improve security
-- Created: 2025-01-26

-- Remove the hardcoded admin user that was insecurely added
DELETE FROM users WHERE id = 'admin-user-001' AND email = 'admin@skillgap.dev';

-- Add additional security constraints
-- Ensure password_hash is required for all users
-- Note: SQLite doesn't support ALTER COLUMN NOT NULL directly, 
-- so we'll handle this in application logic

-- Create a more secure admin setup script will be provided separately
-- Admins should be created through proper administrative processes