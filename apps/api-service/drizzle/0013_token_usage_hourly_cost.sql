ALTER TABLE "token_usage_hourly"
ADD COLUMN "total_cost_micros_usd" bigint DEFAULT 0 NOT NULL;

ALTER TABLE "token_usage_hourly"
ADD COLUMN "cost_source" text DEFAULT 'unknown' NOT NULL;
