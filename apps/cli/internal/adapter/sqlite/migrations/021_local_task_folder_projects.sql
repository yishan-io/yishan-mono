ALTER TABLE local_tasks ADD COLUMN project_kind TEXT CHECK (project_kind IS NULL OR project_kind = 'folder');
ALTER TABLE local_tasks ADD COLUMN project_name TEXT;

UPDATE local_tasks
SET project_kind = 'folder',
    project_name = (
      SELECT name
      FROM workspaces
      WHERE workspaces.id = local_tasks.project_id
        AND workspaces.kind = 'folder'
        AND workspaces.project_id IS NULL
    )
WHERE local_tasks.organization_id IS NULL
  AND EXISTS (
  SELECT 1
  FROM workspaces
  WHERE workspaces.id = local_tasks.project_id
    AND workspaces.kind = 'folder'
    AND workspaces.project_id IS NULL
    AND TRIM(COALESCE(workspaces.name, '')) <> ''
);
