package provision

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func defaultRepoPath(repoKey string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "repos", repoKey), nil
}

func defaultWorktreePath(repoKey string, workspaceName string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "worktrees", repoKey, workspaceName), nil
}

func ensureBareRepoClone(ctx context.Context, repoURL string, repoPath string) error {
	if info, err := os.Stat(repoPath); err == nil {
		if !info.IsDir() {
			return fmt.Errorf("repo path exists and is not a directory: %s", repoPath)
		}
		return updateGitRepo(ctx, repoPath)
	} else if !os.IsNotExist(err) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(repoPath), 0o755); err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, "git", "clone", "--bare", repoURL, repoPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("clone bare repo (%s): %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func updateGitRepo(ctx context.Context, repoPath string) error {
	remoteCmd := exec.CommandContext(ctx, "git", "-C", repoPath, "remote")
	remoteOut, err := remoteCmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return fmt.Errorf("list git remotes (%s): %w", strings.TrimSpace(string(exitErr.Stderr)), err)
		}
		return err
	}
	if strings.TrimSpace(string(remoteOut)) == "" {
		return nil
	}

	cmd := exec.CommandContext(ctx, "git", "-C", repoPath, "fetch", "--all", "--prune")
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("fetch git repo (%s): %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}
