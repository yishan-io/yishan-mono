package daemon

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	cliruntime "yishan/apps/cli/internal/runtime"
)


func ensureNodeUsableForWorkspace(runtime *cliruntime.Runtime, organizationID string, nodeID string) error {
	nodesResponse, err := runtime.APIClient().ListNodes(organizationID)
	if err != nil {
		return fmt.Errorf("load organization nodes: %w", err)
	}
	for _, node := range nodesResponse.Nodes {
		if node.ID == nodeID {
			return nil
		}
	}
	return fmt.Errorf("node %s was not found in this organization", nodeID)
}


func ensureSharedRepoClone(ctx context.Context, repoKey string, repoURL string) (string, error) {
	normalizedKey := strings.TrimSpace(repoKey)
	if normalizedKey == "" {
		return "", fmt.Errorf("repoKey is required for cross-node workspace creation")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	repoPath := filepath.Join(home, ".yishan", "repos", normalizedKey)
	if err := os.MkdirAll(filepath.Dir(repoPath), 0o755); err != nil {
		return "", fmt.Errorf("create shared repo directory: %w", err)
	}
	if _, err := os.Stat(repoPath); err == nil {
		fetchCmd := exec.CommandContext(ctx, "git", "-C", repoPath, "fetch", "--all", "--prune")
		if out, fetchErr := fetchCmd.CombinedOutput(); fetchErr != nil {
			return "", fmt.Errorf("update shared repo clone (%s): %w", strings.TrimSpace(string(out)), fetchErr)
		}
		return repoPath, nil
	}
	cloneCmd := exec.CommandContext(ctx, "git", "clone", "--bare", repoURL, repoPath)
	if out, cloneErr := cloneCmd.CombinedOutput(); cloneErr != nil {
		return "", fmt.Errorf("clone shared repo (%s): %w", strings.TrimSpace(string(out)), cloneErr)
	}
	return repoPath, nil
}
