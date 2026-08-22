CREATE TABLE local_task_workspace_links_new (
  id TEXT PRIMARY KEY,
  local_task_id TEXT NOT NULL REFERENCES local_tasks(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  unlinked_at TEXT
);

INSERT INTO local_task_workspace_links_new (id, local_task_id, workspace_id, status, linked_at, unlinked_at)
SELECT id, local_task_id, workspace_id, status, linked_at, unlinked_at
FROM local_task_workspace_links;

DROP TABLE local_task_workspace_links;
ALTER TABLE local_task_workspace_links_new RENAME TO local_task_workspace_links;

CREATE INDEX idx_local_task_workspace_links_task ON local_task_workspace_links(local_task_id, linked_at DESC);
CREATE INDEX idx_local_task_workspace_links_workspace ON local_task_workspace_links(workspace_id, linked_at DESC);
CREATE UNIQUE INDEX idx_local_task_workspace_active_link
  ON local_task_workspace_links(local_task_id, workspace_id)
  WHERE unlinked_at IS NULL;
