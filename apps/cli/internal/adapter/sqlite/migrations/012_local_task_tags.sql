CREATE TABLE local_task_tags (
  local_task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  normalized_tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (local_task_id, normalized_tag),
  UNIQUE (local_task_id, position)
);

CREATE INDEX idx_local_task_tags_normalized_task
  ON local_task_tags(normalized_tag, local_task_id);
