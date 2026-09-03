package localtask

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const projectContextDirectoryName = ".my-context"

// ContextWorkspace supplies an authoritative local workspace path for context resolution.
type ContextWorkspace struct {
	ID           string
	ProjectID    string
	WorktreePath string
}

// ResolveProjectContextPath resolves a task's context directory through the
// canonical project context linked from a local workspace.
func ResolveProjectContextPath(worktreePath string, taskID string) (string, error) {
	if strings.TrimSpace(worktreePath) == "" || !isSafeContextTaskID(taskID) {
		return "", ErrInvalidTask
	}
	contextRoot, err := filepath.EvalSymlinks(filepath.Join(worktreePath, projectContextDirectoryName))
	if err != nil {
		return "", fmt.Errorf("resolve project context root: %w", err)
	}
	return filepath.Join(contextRoot, "task-context", taskID), nil
}

// ResolveTaskContextPath resolves a task context from authoritative local workspace paths.
func ResolveTaskContextPath(task Task, workspaces []ContextWorkspace) (string, error) {
	if task.ProjectID == nil {
		return ResolveDefaultGlobalContextPath(task.ID)
	}
	for _, workspace := range workspaces {
		workspaceKey := workspace.ProjectID
		if task.ProjectKind != nil && *task.ProjectKind == ProjectKindFolder {
			workspaceKey = workspace.ID
		}
		if workspaceKey != *task.ProjectID {
			continue
		}
		directory, err := ResolveProjectContextPath(workspace.WorktreePath, task.ID)
		if err == nil {
			return directory, nil
		}
	}
	return "", ErrContextUnavailable
}

// ResolveGlobalContextPath resolves the context directory for a task without a project.
func ResolveGlobalContextPath(homeDir string, taskID string) (string, error) {
	if strings.TrimSpace(homeDir) == "" || !isSafeContextTaskID(taskID) {
		return "", ErrInvalidTask
	}
	return filepath.Join(homeDir, ".yishan", "contexts", "local-tasks", taskID), nil
}

// ResolveDefaultGlobalContextPath resolves the context directory using the current user's home directory.
func ResolveDefaultGlobalContextPath(taskID string) (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home directory: %w", err)
	}
	return ResolveGlobalContextPath(homeDir, taskID)
}

func isSafeContextTaskID(taskID string) bool {
	trimmedID := strings.TrimSpace(taskID)
	return trimmedID != "" && trimmedID != "." && trimmedID != ".." && !strings.ContainsAny(trimmedID, "/\\")
}
