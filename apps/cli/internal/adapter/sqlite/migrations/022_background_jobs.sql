CREATE TABLE background_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind = 'workspace-task-run'),
  runtime TEXT NOT NULL CHECK (runtime = 'dsh'),
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  owner_node_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  cwd TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted')),
  result_text TEXT NOT NULL DEFAULT '' CHECK (length(CAST(result_text AS BLOB)) <= 65536),
  error_code TEXT NOT NULL DEFAULT '' CHECK (length(CAST(error_code AS BLOB)) <= 128),
  error_message TEXT NOT NULL DEFAULT '' CHECK (length(CAST(error_message AS BLOB)) <= 4096),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX idx_background_jobs_workspace_created
  ON background_jobs(workspace_id, created_at DESC, id DESC);
CREATE INDEX idx_background_jobs_recovery
  ON background_jobs(status, created_at, id);

CREATE TRIGGER validate_background_job_workspace_ownership
BEFORE INSERT ON background_jobs
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM workspaces
  WHERE id = NEW.workspace_id
    AND project_id = NEW.project_id
    AND organization_id = NEW.organization_id
    AND node_id = NEW.owner_node_id
)
BEGIN
  SELECT RAISE(ABORT, 'background job workspace ownership mismatch');
END;
