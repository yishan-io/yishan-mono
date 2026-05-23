CREATE TABLE "voice_usage_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_usage_activities" ADD CONSTRAINT "voice_usage_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_usage_activities" ADD CONSTRAINT "voice_usage_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_usage_activities_org_id_created_at_idx" ON "voice_usage_activities" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "voice_usage_activities_org_id_user_id_created_at_idx" ON "voice_usage_activities" USING btree ("organization_id","user_id","created_at");