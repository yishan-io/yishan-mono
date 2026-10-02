DROP INDEX "scheduled_job_runs_job_id_scheduled_for_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_job_runs_job_id_scheduled_for_uq"
ON "scheduled_job_runs" USING btree ("job_id", "scheduled_for")
WHERE "trigger" = 'schedule';
