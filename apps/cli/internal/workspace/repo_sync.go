package workspace

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/gitexec"
)

func EnsureBareRepoClone(ctx context.Context, repoURL string, repoPath string) error {
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

	runner := gitexec.DefaultRunner()
	cmd, ok := runner.CommandContext(ctx, "clone", "--bare", repoURL, repoPath)
	if !ok {
		return fmt.Errorf("git executable not available")
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("clone bare repo (%s): %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func updateGitRepo(ctx context.Context, repoPath string) error {
	runner := gitexec.DefaultRunner()
	remoteOut, err, ok := runner.Run(ctx, repoPath, "remote")
	if !ok {
		return fmt.Errorf("git executable not available")
	}
	if err != nil {
		return fmt.Errorf("list git remotes: %w", err)
	}
	if strings.TrimSpace(string(remoteOut)) == "" {
		return nil
	}

	out, err, ok := runner.RunCombined(ctx, repoPath, "fetch", "--all", "--prune")
	if !ok {
		return fmt.Errorf("git executable not available")
	}
	if err != nil {
		return fmt.Errorf("fetch git repo (%s): %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}
