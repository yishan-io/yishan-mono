-- API-owned allocation state for stable Local Task keys. These tables are additive;
-- task data remains owned by the local daemon and is never copied into this database.
CREATE TABLE "project_local_task_key_counters" (
  "project_id" text PRIMARY KEY NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "last_allocated_number" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "personal_local_task_key_counters" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "last_allocated_number" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "project_local_task_key_allocations" (
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "local_task_id" text NOT NULL,
  "key" text NOT NULL,
  "sequence_number" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("project_id", "local_task_id")
);

CREATE UNIQUE INDEX "project_local_task_key_allocations_project_key_uq"
ON "project_local_task_key_allocations" USING btree ("project_id", "key");

CREATE TABLE "personal_local_task_key_allocations" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "local_task_id" text NOT NULL,
  "key" text NOT NULL,
  "sequence_number" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "local_task_id")
);

CREATE UNIQUE INDEX "personal_local_task_key_allocations_user_key_uq"
ON "personal_local_task_key_allocations" USING btree ("user_id", "key");
