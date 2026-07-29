CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'unknown',
    repo_provider TEXT,
    repo_url TEXT,
    repo_key TEXT,
    icon TEXT NOT NULL DEFAULT 'folder',
    color TEXT NOT NULL DEFAULT '#1E66F5',
    setup_script TEXT NOT NULL DEFAULT '',
    post_script TEXT NOT NULL DEFAULT '',
    commands TEXT NOT NULL DEFAULT '[]',
    context_enabled INTEGER NOT NULL DEFAULT 1,
    organization_id TEXT NOT NULL,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'primary',
    status TEXT NOT NULL DEFAULT 'active',
    branch TEXT,
    source_branch TEXT,
    local_path TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'active',
    health TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE workspace_pull_requests (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL,
    pr_id TEXT NOT NULL,
    title TEXT,
    url TEXT,
    branch TEXT,
    base_branch TEXT,
    state TEXT NOT NULL,
    metadata TEXT,
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, pr_id)
);

CREATE TABLE _metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_workspaces_project ON workspaces(project_id);
CREATE INDEX idx_workspaces_org ON workspaces(organization_id);
CREATE INDEX idx_workspace_prs_workspace ON workspace_pull_requests(workspace_id);
