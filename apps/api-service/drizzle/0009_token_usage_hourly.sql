CREATE TABLE "token_usage_hourly" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_path" text NOT NULL,
	"agent_kind" text NOT NULL,
	"model" text NOT NULL,
	"model_normalized" text NOT NULL,
	"bucket_start_hour_utc" timestamp with time zone NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_input_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_output_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"total_tokens" bigint DEFAULT 0 NOT NULL,
	"event_count" bigint DEFAULT 0 NOT NULL,
	"session_count" bigint DEFAULT 0 NOT NULL,
	"attribution_confidence" text NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"run_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_usage_hourly" ADD CONSTRAINT "token_usage_hourly_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_usage_hourly" ADD CONSTRAINT "token_usage_hourly_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "token_usage_hourly" ADD CONSTRAINT "token_usage_hourly_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "token_usage_hourly_org_project_workspace_agent_model_bucket_uq" ON "token_usage_hourly" USING btree ("organization_id","project_id","workspace_id","agent_kind","model_normalized","bucket_start_hour_utc");
--> statement-breakpoint
CREATE INDEX "token_usage_hourly_org_id_bucket_idx" ON "token_usage_hourly" USING btree ("organization_id","bucket_start_hour_utc");
--> statement-breakpoint
CREATE INDEX "token_usage_hourly_project_id_bucket_idx" ON "token_usage_hourly" USING btree ("project_id","bucket_start_hour_utc");
--> statement-breakpoint
CREATE INDEX "token_usage_hourly_workspace_id_bucket_idx" ON "token_usage_hourly" USING btree ("workspace_id","bucket_start_hour_utc");
--> statement-breakpoint
CREATE INDEX "token_usage_hourly_agent_bucket_idx" ON "token_usage_hourly" USING btree ("agent_kind","bucket_start_hour_utc");
