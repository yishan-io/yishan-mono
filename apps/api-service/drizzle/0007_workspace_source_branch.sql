ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "source_branch" text;
