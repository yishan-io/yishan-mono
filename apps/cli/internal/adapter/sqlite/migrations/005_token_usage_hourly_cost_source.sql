ALTER TABLE token_usage_hourly
ADD COLUMN cost_source TEXT NOT NULL DEFAULT 'unknown';
