package tokenusage

import (
	"strings"

	"yishan/apps/cli/internal/workspace"
)

func buildTokenUsageWorktreeRefs(workspaces []workspace.Workspace) []WorktreeRef {
	refs := make([]WorktreeRef, 0, len(workspaces))
	for _, ws := range workspaces {
		projectID := ws.ProjectID
		if strings.TrimSpace(projectID) == "" {
			projectID = "unknown"
		}
		refs = append(refs, WorktreeRef{
			ProjectID:     projectID,
			WorkspaceID:   ws.ID,
			WorkspacePath: ws.Path,
		})
	}
	return refs
}
