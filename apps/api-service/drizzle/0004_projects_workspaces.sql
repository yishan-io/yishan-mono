CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "source_type" text NOT NULL,
  "repo_provider" text,
  "repo_url" text,
  "repo_key" text,
  "organization_id" text NOT NULL,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "projects_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade,
  CONSTRAINT "projects_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "projects_organization_id_idx"
  ON "projects" ("organization_id");

CREATE INDEX IF NOT EXISTS "projects_source_type_idx"
  ON "projects" ("source_type");

CREATE INDEX IF NOT EXISTS "projects_created_by_user_id_idx"
  ON "projects" ("created_by_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "projects_org_repo_provider_key_uq"
  ON "projects" ("organization_id", "repo_provider", "repo_key");

CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "project_id" text NOT NULL,
  "user_id" text NOT NULL,
  "node_id" text NOT NULL,
  "kind" text DEFAULT 'primary' NOT NULL,
  "branch" text,
  "local_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade,
  CONSTRAINT "workspaces_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade,
  CONSTRAINT "workspaces_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "workspaces_node_id_nodes_id_fk"
    FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "workspaces_organization_id_idx"
  ON "workspaces" ("organization_id");

CREATE INDEX IF NOT EXISTS "workspaces_project_id_idx"
  ON "workspaces" ("project_id");

CREATE INDEX IF NOT EXISTS "workspaces_user_id_idx"
  ON "workspaces" ("user_id");

CREATE INDEX IF NOT EXISTS "workspaces_node_id_idx"
  ON "workspaces" ("node_id");

CREATE INDEX IF NOT EXISTS "workspaces_kind_idx"
  ON "workspaces" ("kind");

CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_project_user_node_kind_branch_uq"
  ON "workspaces" ("project_id", "user_id", "node_id", "kind", "branch");
