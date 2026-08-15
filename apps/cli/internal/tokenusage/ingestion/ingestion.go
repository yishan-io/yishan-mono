// Package ingestion owns source discovery and scan-input assembly: turning the
// open workspace registry into the worktree refs a scan covers and building the
// ScanInput bundle. The collector schedules; ingestion decides what to read.
package ingestion

import (
	"strings"

	"yishan/apps/cli/internal/tokenusage/pricing"
	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/tokenusage/scanner"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// WorktreeRefsFromRegistry derives the scan's worktree refs from the open
// workspace instances. Unattributed project ids become "unknown".
func WorktreeRefsFromRegistry(workspaces []workspace.Workspace) []record.WorktreeRef {
	refs := make([]record.WorktreeRef, 0, len(workspaces))
	for _, ws := range workspaces {
		projectID := ws.ProjectID
		if strings.TrimSpace(projectID) == "" {
			projectID = "unknown"
		}
		refs = append(refs, record.WorktreeRef{
			ProjectID:     projectID,
			WorkspaceID:   ws.ID,
			WorkspacePath: ws.Path,
		})
	}
	return refs
}

// BuildScanInput assembles the scanner input for one agent scan: the registry
// worktree refs, the scan window, and the pricing catalog.
func BuildScanInput(registry *instance.Registry, runID string, scanSinceUnixMilli int64, ingestedAt int64, sessionRoot string, catalog pricing.Catalog) scanner.ScanInput {
	return scanner.ScanInput{
		RunID:              runID,
		IngestedAt:         ingestedAt,
		ScanSinceUnixMilli: scanSinceUnixMilli,
		Worktrees:          WorktreeRefsFromRegistry(registry.List()),
		SessionRoot:        sessionRoot,
		Catalog:            catalog,
	}
}
