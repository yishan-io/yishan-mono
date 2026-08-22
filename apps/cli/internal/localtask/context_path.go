package localtask

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const projectContextDirectoryName = ".my-context"

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
