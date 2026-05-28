ALTER TABLE "projects" ADD COLUMN "commands" jsonb DEFAULT '[]'::jsonb NOT NULL;
