ALTER TABLE "scheduled_job_runs" ADD COLUMN "trigger" text DEFAULT 'manual' NOT NULL;
