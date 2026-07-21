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

func (s *GitService) RemoveBranch(ctx context.Context, root string, branch string, force bool) error {
	if strings.TrimSpace(branch) == "" {
		return NewRPCError(rpcCodeInvalidParams, "branch is required")
	}
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := gitCommandCombined(ctx, root, "branch", flag, branch)
	return err
}

func (s *GitService) RefExists(ctx context.Context, root string, ref string) bool {
	if strings.TrimSpace(ref) == "" || ref == "HEAD" {
		return false
	}
	_, err := gitCommand(ctx, root, "rev-parse", "--verify", ref)
	return err == nil
}

// resolveRef returns the full symbolic ref name (e.g.
// "refs/remotes/origin/main") for a given short ref (e.g. "origin/main").
// This prevents "fatal: ambiguous object name" errors in two known scenarios:
//
//  1. Stale packed-ref divergence: a packed-ref entry and a newer loose ref
//     both exist for the same short name after git pack-refs + fetch.
//
//  2. Local branch collision: a local branch named "origin/main" coexists with
//     the remote tracking ref refs/remotes/origin/main, causing
//     git rev-parse --verify --symbolic-full-name to exit 0 with empty stdout.
//
// For remote-style short refs (containing "/" but not starting with "refs/"),
// refs/remotes/<ref> is tried first so the remote tracking path is always
// preferred unambiguously. The --symbolic-full-name path handles any other ref
// form. If no unambiguous resolution is possible the original ref is returned
// so callers still get a best-effort result.
func resolveRef(ctx context.Context, root string, ref string) string {
	if strings.TrimSpace(ref) == "" || ref == "HEAD" {
		return ref
	}
	// Fast path for remote-style short refs (e.g. "origin/main"): try the
	// explicit remote tracking path first. This avoids ambiguity when a local
	// branch with the same slash-delimited name also exists, and is faster
	// than relying on --symbolic-full-name which can return empty stdout on
	// ambiguous refs while still exiting 0.
	if strings.Contains(ref, "/") && !strings.HasPrefix(ref, "refs/") {
		candidate := "refs/remotes/" + ref
		if _, err := gitCommand(ctx, root, "rev-parse", "--verify", candidate); err == nil {
			return candidate
		}
	}
	// General case: let git expand to the canonical full symbolic name.
	out, err := gitCommand(ctx, root, "rev-parse", "--verify", "--symbolic-full-name", ref)
	if err != nil {
		return ref
	}
	full := strings.TrimSpace(out)
	if full == "" {
		return ref
	}
	return full
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
	if slices.Contains(remotes, "origin") {
		return "origin", nil
	}
	return remotes[0], nil
}

// FetchRefShallow fetches a single ref from the remote using a shallow fetch
// with --filter=blob:none so that only tree and commit objects are transferred.
// Blobs are lazy-fetched on demand by git, which is dramatically faster for
// large repositories.
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
