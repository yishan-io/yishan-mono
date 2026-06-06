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

func resolveCreateRequestForNode(ctx context.Context, runtime *cliruntime.Runtime, req workspaceCreateRequestInput) (workspaceCreateRequestInput, error) {
	resolvedNodeID := strings.TrimSpace(req.nodeID)
	if resolvedNodeID == "" {
		resolvedNodeID = strings.TrimSpace(req.localNodeID)
	}
	if resolvedNodeID == "" {
		return req, fmt.Errorf("workspace node id is required")
	}
		req.nodeID = resolvedNodeID
	if resolvedNodeID == strings.TrimSpace(req.localNodeID) {
		return req, nil
	}

	if runtime == nil || !runtime.APIConfigured() {
		return req, fmt.Errorf("creating a workspace on node %s requires an authenticated API session", resolvedNodeID)
	}
	if strings.TrimSpace(req.organizationID) == "" || strings.TrimSpace(req.projectID) == "" {
		return req, fmt.Errorf("organizationId and projectId are required for cross-node workspace creation")
	}
	if err := ensureNodeUsableForWorkspace(runtime, req.organizationID, resolvedNodeID); err != nil {
		return req, err
	}

	repoURL, err := resolveProjectRepoURL(runtime, req.organizationID, req.projectID)
	if err != nil {
		return req, err
	}
	repoPath, err := ensureSharedRepoClone(ctx, req.repoKey, repoURL)
	if err != nil {
		return req, err
	}
	req.sourcePath = repoPath
	return req, nil
}

type workspaceCreateRequestInput struct {
	organizationID string
	projectID      string
	localNodeID    string
	nodeID         string
	repoKey        string
	sourcePath     string
}

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

func resolveProjectRepoURL(runtime *cliruntime.Runtime, organizationID string, projectID string) (string, error) {
	projectsResponse, err := runtime.APIClient().ListProjects(organizationID)
	if err != nil {
		return "", fmt.Errorf("load project metadata: %w", err)
	}
	for _, project := range projectsResponse.Projects {
		if project.ID != projectID {
			continue
		}
		repoURL := strings.TrimSpace(project.RepoURL)
		if repoURL == "" {
			return "", fmt.Errorf("project %s has no remote repository URL; cannot prepare cross-node workspace", projectID)
		}
		return repoURL, nil
	}
	return "", fmt.Errorf("project %s not found in organization %s", projectID, organizationID)
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
