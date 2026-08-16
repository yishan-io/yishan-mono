package worktree

import (
	"context"
	"os"
	"path/filepath"
	"strings"

)

// CreateRequest carries everything needed to resolve and provision a worktree.
type CreateRequest struct {
	RepoKey       string
	WorkspaceName string
	SourcePath    string
	TargetBranch  string
	SourceBranch  string
}

// CreatePaths holds the validated filesystem paths for a create request.
type CreatePaths struct {
	SourcePath   string
	WorktreePath string
	RepoKey      string // validated relative path, used for context dir resolution
}

// ResolveCreatePaths validates and resolves the filesystem paths for a create
// request: the source repo path, the worktree path, and the repo key.
func ResolveCreatePaths(req CreateRequest) (CreatePaths, error) {
	sourcePath, err := AbsUserPath(req.SourcePath)
	if err != nil {
		return CreatePaths{}, err
	}
	repoKey, err := SafeRelativePath(req.RepoKey, "repoKey")
	if err != nil {
		return CreatePaths{}, err
	}
	workspaceName, err := SafeRelativePath(req.WorkspaceName, "workspaceName")
	if err != nil {
		return CreatePaths{}, err
	}
	// Sanitize workspaceName so that branch names like "feature/my-branch" do
	// not produce nested directories. Only the filesystem path component is
	// changed; TargetBranch is left untouched.
	workspaceName = strings.ReplaceAll(workspaceName, "/", "-")
	if workspaceName == "" {
		return CreatePaths{}, NewError(ErrCodeInvalidParams, "workspaceName is empty after sanitization")
	}
	worktreePath, err := DefaultWorktreePath(repoKey, workspaceName)
	if err != nil {
		return CreatePaths{}, err
	}
	return CreatePaths{SourcePath: sourcePath, WorktreePath: worktreePath, RepoKey: repoKey}, nil
}

// Create provisions a git worktree for the request at the resolved paths. It
// checks whether the source ref exists locally first; if it does it runs
// worktree add directly (fast path, no network). If the ref is missing it
// fetches it with a shallow, blobless fetch before creating the worktree.
// Returns the created worktree path.
func Create(ctx context.Context, req CreateRequest, paths CreatePaths) (string, error) {
	sourceBranch := strings.TrimSpace(req.SourceBranch)

	// Fast path: ref already available locally — no network round-trip.
	if RefExists(ctx, paths.SourcePath, sourceBranch) {
		// Resolve to the safe full ref path to avoid "fatal: ambiguous
		// object name" errors (stale packed-ref divergence or a local branch
		// with the same slash-delimited name as the remote ref).
		resolved := resolveRef(ctx, paths.SourcePath, sourceBranch)
		if err := CreateWorktree(ctx, paths.SourcePath, req.TargetBranch, paths.WorktreePath, true, resolved); err != nil {
			return "", err
		}
		return paths.WorktreePath, nil
	}

	// Slow path: fetch the ref (shallow + blobless) then create the worktree.
	if err := FetchRefShallow(ctx, paths.SourcePath, sourceBranch); err != nil {
		return "", err
	}

	// Re-resolve after fetch in case the ref is now available as a full
	// remote-tracking ref (e.g. refs/remotes/origin/main).
	resolved := resolveRef(ctx, paths.SourcePath, sourceBranch)
	if err := CreateWorktree(ctx, paths.SourcePath, req.TargetBranch, paths.WorktreePath, true, resolved); err != nil {
		return "", err
	}
	return paths.WorktreePath, nil
}

// CreateWorktree adds a git worktree at the given path. With createBranch it
// creates the branch from fromRef (default HEAD); otherwise it checks out the
// existing branch.
func CreateWorktree(ctx context.Context, root string, branch string, worktreePath string, createBranch bool, fromRef string) error {
	if strings.TrimSpace(branch) == "" {
		return NewError(ErrCodeInvalidParams, "branch is required")
	}
	if strings.TrimSpace(worktreePath) == "" {
		return NewError(ErrCodeInvalidParams, "worktreePath is required")
	}

	absWorktreePath, err := filepath.Abs(worktreePath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absWorktreePath), 0o755); err != nil {
		return err
	}

	if createBranch {
		ref := strings.TrimSpace(fromRef)
		if ref == "" {
			ref = "HEAD"
		}
		_, err := gitCommandCombined(ctx, root, "worktree", "add", "-b", branch, absWorktreePath, ref)
		return err
	}

	_, err = gitCommandCombined(ctx, root, "worktree", "add", absWorktreePath, branch)
	return err
}

// RefExists reports whether a ref exists in the repository at root.
func RefExists(ctx context.Context, root string, ref string) bool {
	if strings.TrimSpace(ref) == "" || ref == "HEAD" {
		return false
	}
	_, err := gitCommand(ctx, root, "rev-parse", "--verify", ref)
	return err == nil
}

// FetchRefShallow fetches a single ref from the remote using a shallow fetch
// with --filter=blob:none so that only tree and commit objects are transferred.
// Blobs are lazy-fetched on demand by git, which is dramatically faster for
// large repositories.
func FetchRefShallow(ctx context.Context, root string, ref string) error {
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

// resolveRef returns the full symbolic ref name (e.g. "refs/remotes/origin/main")
// for a given short ref (e.g. "origin/main"). This prevents "fatal: ambiguous
// object name" errors in two known scenarios:
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
	if strings.Contains(ref, "/") && !strings.HasPrefix(ref, "refs/") {
		candidate := "refs/remotes/" + ref
		if _, err := gitCommand(ctx, root, "rev-parse", "--verify", candidate); err == nil {
			return candidate
		}
	}
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
	for _, remote := range remotes {
		if remote == "origin" {
			return "origin", nil
		}
	}
	return remotes[0], nil
}
