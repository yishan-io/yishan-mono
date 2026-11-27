-- Projects are daemon-owned: each node keeps its own projects and api-service
-- no longer stores them. Task prefixes are unique per organization on this
-- machine only. task_key_counters hands out Local Task keys locally
-- (scope "project:<id>" for project keys, "personal" for PERS keys).
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
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
    task_prefix TEXT,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE UNIQUE INDEX idx_projects_org_task_prefix
ON projects(organization_id, task_prefix)
WHERE task_prefix IS NOT NULL;
CREATE UNIQUE INDEX idx_projects_org_repo
ON projects(organization_id, repo_provider, repo_key)
WHERE repo_key IS NOT NULL;

CREATE TABLE task_key_counters (
    scope TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL
);
