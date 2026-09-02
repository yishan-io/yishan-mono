-- Adds cloud-reserved display keys without changing existing task rows or counters.
ALTER TABLE local_tasks ADD COLUMN task_key TEXT;
