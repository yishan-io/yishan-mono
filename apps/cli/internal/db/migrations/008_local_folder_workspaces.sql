-- Allow true local folder workspaces: rows that exist only in the daemon DB
-- with project_id NULL and organization_id NULL. SQLite cannot drop the NOT
-- NULL constraint via ALTER, so rebuild the workspaces table (same
-- table-rebuild pattern as 007). The migration runner disables FK checks
-- around this rebuild so DROP TABLE does not cascade-delete
-- workspace_pull_requests rows.

CREATE TABLE workspaces_new (
    id TEXT PRIMARY KEY,
    organization_id TEXT,
    project_id TEXT,
    node_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'primary',
    status TEXT NOT NULL DEFAULT 'active',
    branch TEXT,
    source_branch TEXT,
    local_path TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'active',
    health TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO workspaces_new (id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state, health, name, created_at, updated_at)
SELECT id, organization_id, project_id, node_id, kind, status, branch, source_branch, local_path, state, health, NULL, created_at, updated_at FROM workspaces;

DROP TABLE workspaces;

ALTER TABLE workspaces_new RENAME TO workspaces;

CREATE INDEX idx_workspaces_project ON workspaces(project_id);
CREATE INDEX idx_workspaces_org ON workspaces(organization_id);
CREATE UNIQUE INDEX idx_workspaces_live_project_node_kind_branch
ON workspaces(project_id, node_id, kind, IFNULL(branch, ''))
WHERE status IN ('active', 'provisioning') AND project_id IS NOT NULL;
CREATE UNIQUE INDEX idx_workspaces_local_folder_path
ON workspaces(local_path)
WHERE kind = 'folder' AND status IN ('active', 'provisioning');
