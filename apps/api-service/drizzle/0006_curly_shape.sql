CREATE TABLE "service_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text DEFAULT 'api:read api:write' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_tokens" ADD CONSTRAINT "service_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_tokens_token_hash_uq" ON "service_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "service_tokens_user_id_idx" ON "service_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_tokens_token_prefix_idx" ON "service_tokens" USING btree ("token_prefix");