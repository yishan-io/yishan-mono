ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "icon" text DEFAULT 'folder' NOT NULL,
  ADD COLUMN IF NOT EXISTS "color" text DEFAULT '#1E66F5' NOT NULL,
  ADD COLUMN IF NOT EXISTS "setup_script" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "post_script" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "context_enabled" boolean DEFAULT true NOT NULL;

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;

CREATE INDEX IF NOT EXISTS "workspaces_status_idx"
  ON "workspaces" ("status");
