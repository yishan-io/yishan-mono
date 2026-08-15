// Package attribution owns workspace and session ownership of usage events:
// resolving a CWD to an open workspace (exact/prefix/unknown confidence) and
// enriching scanned records with registry metadata (project id, org id, path).
package attribution

import (
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/tokenusage/record"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/instance"
)

// ResolveWorktree maps a usage event's working directory to an open workspace,
// preferring the longest matching workspace path. Empty CWD falls back to the
// unknown workspace.
func ResolveWorktree(cwd string, worktrees []record.WorktreeRef) (record.WorktreeRef, record.AttributionConfidence) {
	if cwd == "" {
		return UnknownWorktree(), record.AttributionFallbackUnknown
	}
	normalizedCWD := NormalizeComparablePath(cwd)
	longest := -1
	selected := UnknownWorktree()
	selectedConfidence := record.AttributionFallbackUnknown
	for _, worktree := range worktrees {
		if match, exact := MatchWorktree(normalizedCWD, worktree.WorkspacePath); match {
			if len(worktree.WorkspacePath) > longest {
				longest = len(worktree.WorkspacePath)
				selected = worktree
				selectedConfidence = record.AttributionPrefixMatch
				if exact {
					selectedConfidence = record.AttributionExact
				}
			}
		}
	}
	return selected, selectedConfidence
}

// UnknownWorktree is the fallback workspace identity for unattributable events.
func UnknownWorktree() record.WorktreeRef {
	return record.WorktreeRef{ProjectID: "unknown", WorkspaceID: "unknown", WorkspacePath: ""}
}

// MatchWorktree reports whether the normalized CWD is inside (or equals) the
// workspace path. The second return reports an exact path match.
func MatchWorktree(normalizedCWD string, workspacePath string) (bool, bool) {
	normalizedWorkspace := NormalizeComparablePath(workspacePath)
	if normalizedWorkspace == "" {
		return false, false
	}
	if normalizedCWD == normalizedWorkspace {
		return true, true
	}
	if strings.HasPrefix(normalizedCWD, normalizedWorkspace+"/") {
		return true, false
	}
	return false, false
}

// NormalizeComparablePath canonicalizes a path for workspace matching.
func NormalizeComparablePath(pathValue string) string {
	normalized := filepath.ToSlash(filepath.Clean(pathValue))
	if normalized == "." {
		return ""
	}
	return strings.ToLower(normalized)
}

// EnrichFromRegistry fills in registry-owned metadata (project id, workspace
// path, org id) for scanned records whose workspace is open, and drops records
// attributed to the literal "unknown" workspace id.
func EnrichFromRegistry(rows []record.UsageRecord, registry *instance.Registry) []record.UsageRecord {
	workspaceByID := make(map[string]workspace.Workspace)
	for _, ws := range registry.List() {
		workspaceByID[ws.ID] = ws
	}

	filtered := make([]record.UsageRecord, 0, len(rows))
	for _, row := range rows {
		if strings.EqualFold(strings.TrimSpace(row.WorkspaceID), "unknown") {
			continue
		}
		if ws, ok := workspaceByID[row.WorkspaceID]; ok {
			if strings.TrimSpace(row.ProjectID) == "" || strings.EqualFold(strings.TrimSpace(row.ProjectID), "unknown") {
				if strings.TrimSpace(ws.ProjectID) != "" {
					row.ProjectID = ws.ProjectID
				}
			}
			if strings.TrimSpace(row.WorkspacePath) == "" {
				row.WorkspacePath = ws.Path
			}
			row.OrganizationID = ws.OrgID
		}
		filtered = append(filtered, row)
	}
	return filtered
}

// OrgIDForWorkspace resolves the organization id of an open workspace, or ""
// when unknown.
func OrgIDForWorkspace(registry *instance.Registry, workspaceID string) string {
	for _, ws := range registry.List() {
		if ws.ID == workspaceID {
			return ws.OrgID
		}
	}
	return ""
}
