package daemon

import (
	"strings"

	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
)

func buildTokenUsageWorktreeRefs(workspaces []workspace.Workspace) []tokenusage.WorktreeRef {
	refs := make([]tokenusage.WorktreeRef, 0, len(workspaces))
	for _, ws := range workspaces {
		projectID := ws.ProjectID
		if strings.TrimSpace(projectID) == "" {
			projectID = "unknown"
		}
		refs = append(refs, tokenusage.WorktreeRef{
			ProjectID:     projectID,
			WorkspaceID:   ws.ID,
			WorkspacePath: ws.Path,
		})
	}
	return refs
}
