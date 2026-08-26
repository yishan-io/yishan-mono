CREATE TABLE local_tasks_new (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  organization_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('new', 'progressing', 'done', 'cancelled')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

INSERT INTO local_tasks_new (id, project_id, organization_id, title, description, status, priority, created_at, updated_at, completed_at)
SELECT id, project_id, organization_id, title, description,
  CASE status
    WHEN 'active' THEN 'progressing'
    WHEN 'paused' THEN 'cancelled'
    WHEN 'completed' THEN 'done'
  END,
  priority, created_at, updated_at,
  CASE WHEN status = 'completed' THEN completed_at ELSE NULL END
FROM local_tasks;

DROP TRIGGER local_tasks_fts_insert;
DROP TRIGGER local_tasks_fts_update;
DROP TRIGGER local_tasks_fts_delete;
DROP TABLE local_tasks;
ALTER TABLE local_tasks_new RENAME TO local_tasks;

CREATE INDEX idx_local_tasks_project_status ON local_tasks(project_id, status, updated_at DESC);
CREATE INDEX idx_local_tasks_status_priority ON local_tasks(status, priority, updated_at DESC);

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

CREATE TABLE local_task_workspace_links_new (
  id TEXT PRIMARY KEY,
  local_task_id TEXT NOT NULL REFERENCES local_tasks(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  status TEXT NOT NULL CHECK (status IN ('new', 'progressing', 'done', 'cancelled')),
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  unlinked_at TEXT
);

INSERT INTO local_task_workspace_links_new (id, local_task_id, workspace_id, status, linked_at, unlinked_at)
SELECT id, local_task_id, workspace_id,
  CASE status
    WHEN 'active' THEN 'progressing'
    WHEN 'paused' THEN 'cancelled'
    WHEN 'completed' THEN 'done'
  END,
  linked_at, unlinked_at
FROM local_task_workspace_links;

DROP TABLE local_task_workspace_links;
ALTER TABLE local_task_workspace_links_new RENAME TO local_task_workspace_links;

CREATE INDEX idx_local_task_workspace_links_task ON local_task_workspace_links(local_task_id, linked_at DESC);
CREATE INDEX idx_local_task_workspace_links_workspace ON local_task_workspace_links(workspace_id, linked_at DESC);
CREATE UNIQUE INDEX idx_local_task_workspace_active_link
  ON local_task_workspace_links(local_task_id, workspace_id)
  WHERE unlinked_at IS NULL;
