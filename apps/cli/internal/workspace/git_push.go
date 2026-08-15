package workspace

import (
	"context"
	"slices"
	"strings"
)

func (s *GitService) PushBranch(ctx context.Context, root string) (string, error) {
	out, err := gitCommandCombined(ctx, root, "push")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (s *GitService) PublishBranch(ctx context.Context, root string) (string, error) {
	remote := "origin"
	remotesOut, err := gitCommand(ctx, root, "remote")
	if err == nil {
		remotes := splitNonEmptyLines(remotesOut)
		if !slices.Contains(remotes, "origin") {
			if len(remotes) == 0 {
				return "", NewRPCError(rpcCodeToolUnavailable, "no git remote configured")
			}
			remote = remotes[0]
		}
	}

	out, err := gitCommandCombined(ctx, root, "push", remote, "HEAD", "-u")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (s *GitService) RenameBranch(ctx context.Context, root string, nextBranch string) error {
	if strings.TrimSpace(nextBranch) == "" {
		return NewRPCError(rpcCodeInvalidParams, "nextBranch is required")
	}
	_, err := gitCommandCombined(ctx, root, "branch", "-m", nextBranch)
	return err
}

func (s *GitService) FetchRefShallow(ctx context.Context, root string, ref string) error {
	remote, err := resolveRemote(ctx, root)
	if err != nil {
		return err
	}
	if remote == "" {
		return nil
	}

	args := []string{"fetch", remote, "--quiet", "--no-tags", "--depth=1", "--filter=blob:none"}
	if strings.TrimSpace(ref) != "" && ref != "HEAD" {
		args = append(args, ref)
	}

	_, err = gitCommandCombined(ctx, root, args...)
	return err
}

func (s *GitService) FetchRef(ctx context.Context, root string, ref string) error {
	remote, err := resolveRemote(ctx, root)
	if err != nil {
		return err
	}
	if remote == "" {
		return nil
	}

	args := []string{"fetch", remote, "--quiet", "--no-tags", "--filter=blob:none"}
	if strings.TrimSpace(ref) != "" && ref != "HEAD" {
		args = append(args, ref)
	}

	_, err = gitCommandCombined(ctx, root, args...)
	return err
}

// resolveRemote returns the preferred remote name for the given repo root.
// It prefers "origin"; if absent it falls back to the first available remote.
// Returns an empty string when no remotes are configured.
func resolveRemote(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "remote")
	if err != nil {
		return "", err
	}
	remotes := splitNonEmptyLines(out)
	if len(remotes) == 0 {
		return "", nil
	}
	for _, remote := range remotes {
		if remote == "origin" {
			return "origin", nil
		}
	}
	return remotes[0], nil
}
