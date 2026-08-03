ALTER TABLE token_usage_hourly
ADD COLUMN total_cost_micros_usd INTEGER NOT NULL DEFAULT 0;
