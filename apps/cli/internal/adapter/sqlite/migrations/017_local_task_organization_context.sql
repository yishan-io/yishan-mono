ALTER TABLE local_tasks ADD COLUMN organization_id TEXT;

UPDATE local_tasks
SET organization_id = (
  SELECT organization_id
  FROM workspaces
  WHERE project_id = local_tasks.project_id
    AND organization_id IS NOT NULL
  LIMIT 1
)
WHERE project_id IS NOT NULL
  AND organization_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM workspaces
    WHERE project_id = local_tasks.project_id
      AND organization_id IS NOT NULL
  );
