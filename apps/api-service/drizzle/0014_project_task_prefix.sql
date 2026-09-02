ALTER TABLE "projects" ADD COLUMN "task_prefix" text;

ALTER TABLE "projects"
ADD CONSTRAINT "projects_task_prefix_format_check"
CHECK ("task_prefix" IS NULL OR ("task_prefix" ~ '^[A-Z]{3,5}$' AND "task_prefix" <> 'PERS'));

CREATE UNIQUE INDEX "projects_org_task_prefix_uq"
ON "projects" USING btree ("organization_id", "task_prefix")
WHERE "task_prefix" IS NOT NULL;
