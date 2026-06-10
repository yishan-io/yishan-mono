ALTER TABLE "token_usage_hourly" RENAME COLUMN "cached_output_tokens" TO "cached_write_tokens";
--> statement-breakpoint
UPDATE "token_usage_hourly"
SET "input_tokens" = "input_tokens" + "cached_input_tokens" + "cached_write_tokens",
    "total_tokens" = "total_tokens" + "cached_input_tokens" + "cached_write_tokens"
WHERE "agent_kind" = 'opencode';
