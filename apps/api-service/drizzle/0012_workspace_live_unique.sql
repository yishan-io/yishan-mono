DROP INDEX IF EXISTS "workspaces_project_user_node_kind_branch_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_project_user_node_kind_branch_uq"
ON "workspaces" USING btree ("project_id", "user_id", "node_id", "kind", "branch")
WHERE "status" IN ('active', 'provisioning');
