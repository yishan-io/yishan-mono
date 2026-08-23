CREATE TABLE local_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_local_tasks_project_status ON local_tasks(project_id, status, updated_at DESC);
CREATE INDEX idx_local_tasks_status_priority ON local_tasks(status, priority, updated_at DESC);

CREATE VIRTUAL TABLE local_tasks_fts USING fts5(
  local_task_id UNINDEXED,
  title,
  description
);

CREATE TRIGGER local_tasks_fts_insert AFTER INSERT ON local_tasks BEGIN
  INSERT INTO local_tasks_fts(local_task_id, title, description)
  VALUES (new.id, new.title, new.description);
END;

CREATE TRIGGER local_tasks_fts_update AFTER UPDATE OF title, description ON local_tasks BEGIN
  DELETE FROM local_tasks_fts WHERE local_task_id = old.id;
  INSERT INTO local_tasks_fts(local_task_id, title, description)
  VALUES (new.id, new.title, new.description);
END;

CREATE TRIGGER local_tasks_fts_delete AFTER DELETE ON local_tasks BEGIN
  DELETE FROM local_tasks_fts WHERE local_task_id = old.id;
END;

CREATE TABLE local_task_workspace_links (
  id TEXT PRIMARY KEY,
  local_task_id TEXT NOT NULL REFERENCES local_tasks(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'related')),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  unlinked_at TEXT
);

CREATE INDEX idx_local_task_workspace_links_task ON local_task_workspace_links(local_task_id, linked_at DESC);
CREATE INDEX idx_local_task_workspace_links_workspace ON local_task_workspace_links(workspace_id, linked_at DESC);
CREATE UNIQUE INDEX idx_local_task_workspace_active_primary
  ON local_task_workspace_links(workspace_id)
  WHERE role = 'primary' AND status = 'active' AND unlinked_at IS NULL;
CREATE UNIQUE INDEX idx_local_task_workspace_active_link
  ON local_task_workspace_links(local_task_id, workspace_id)
  WHERE unlinked_at IS NULL;

CREATE TABLE local_task_imports (
  name TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
