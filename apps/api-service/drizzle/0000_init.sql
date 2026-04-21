CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "name" text,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL,
  "provider_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "oauth_accounts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_accounts_provider_provider_user_id_uq"
  ON "oauth_accounts" ("provider", "provider_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_accounts_user_id_provider_uq"
  ON "oauth_accounts" ("user_id", "provider");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_uq" ON "sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");
