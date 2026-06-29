ALTER TABLE "token_usage_hourly" ADD COLUMN "turn_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "token_usage_hourly" ADD COLUMN "tool_call_count" bigint DEFAULT 0 NOT NULL;
