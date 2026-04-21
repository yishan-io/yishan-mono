CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "replaced_by_token_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "refresh_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_hash_uq"
  ON "refresh_tokens" ("token_hash");

CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx"
  ON "refresh_tokens" ("user_id");

CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_at_idx"
  ON "refresh_tokens" ("expires_at");
