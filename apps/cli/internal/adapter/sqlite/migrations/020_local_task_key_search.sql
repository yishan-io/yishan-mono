-- Adds task keys to the Local Task FTS index for title, description, and key searches.
DROP TRIGGER local_tasks_fts_insert;
DROP TRIGGER local_tasks_fts_update;
DROP TRIGGER local_tasks_fts_delete;
DROP TABLE local_tasks_fts;

CREATE VIRTUAL TABLE local_tasks_fts USING fts5(
  local_task_id UNINDEXED,
  title,
  description,
  task_key
);

INSERT INTO local_tasks_fts(local_task_id, title, description, task_key)
SELECT id, title, description, COALESCE(task_key, '') FROM local_tasks;

CREATE TRIGGER local_tasks_fts_insert AFTER INSERT ON local_tasks BEGIN
  INSERT INTO local_tasks_fts(local_task_id, title, description, task_key)
  VALUES (new.id, new.title, new.description, COALESCE(new.task_key, ''));
END;

CREATE TRIGGER local_tasks_fts_update AFTER UPDATE OF title, description, task_key ON local_tasks BEGIN
  DELETE FROM local_tasks_fts WHERE local_task_id = old.id;
  INSERT INTO local_tasks_fts(local_task_id, title, description, task_key)
  VALUES (new.id, new.title, new.description, COALESCE(new.task_key, ''));
END;

CREATE TRIGGER local_tasks_fts_delete AFTER DELETE ON local_tasks BEGIN
  DELETE FROM local_tasks_fts WHERE local_task_id = old.id;
END;

CREATE INDEX idx_local_tasks_task_key ON local_tasks(task_key);
