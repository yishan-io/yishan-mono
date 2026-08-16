CREATE UNIQUE INDEX idx_workspaces_live_project_node_kind_branch
ON workspaces(project_id, node_id, kind, IFNULL(branch, ''))
WHERE status IN ('active', 'provisioning');
