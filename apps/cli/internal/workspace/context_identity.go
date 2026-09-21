package workspace

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"yishan/apps/cli/internal/workspace/worktree"
)

// ResolveContextIdentity returns the directory name that owns a project's
// shared personal context. The identity is derived from local disk state, so a
// project that gains a Git remote keeps the context directory it already used:
//
//  1. the target of an existing `.my-context` link in one of the candidate
//     worktrees (a promoted project's primary workspace still points at the
//     original UUID directory),
//  2. an existing `~/.yishan/contexts/<projectID>` directory,
//  3. the Git repo key,
//  4. the project id.
//
// Candidate paths are evaluated in lexical order so the result never depends on
// caller iteration order. Nothing here is stored remotely: the personal context
// stays a local concern.
func ResolveContextIdentity(repoKey string, projectID string, candidateWorktreePaths []string) (string, error) {
	basePath, err := contextBasePath()
	if err != nil {
		return "", err
	}
	if identity, ok := contextIdentityFromLinks(basePath, candidateWorktreePaths); ok {
		return identity, nil
	}
	if identity, ok := contextIdentityFromProjectDirectory(basePath, projectID); ok {
		return identity, nil
	}
	return contextIdentityFromKeys(repoKey, projectID)
}

func contextBasePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yishan", "contexts"), nil
}

func contextIdentityFromLinks(basePath string, candidateWorktreePaths []string) (string, bool) {
	orderedPaths := append([]string(nil), candidateWorktreePaths...)
	sort.Strings(orderedPaths)
	for _, candidate := range orderedPaths {
		if identity, ok := contextIdentityFromLink(basePath, candidate); ok {
			return identity, true
		}
	}
	return "", false
}

func contextIdentityFromLink(basePath string, worktreePath string) (string, bool) {
	trimmedPath := strings.TrimSpace(worktreePath)
	if trimmedPath == "" {
		return "", false
	}
	linkPath := filepath.Join(trimmedPath, ContextLinkName)
	linkInfo, err := os.Lstat(linkPath)
	if err != nil || linkInfo.Mode()&os.ModeSymlink == 0 {
		return "", false
	}
	target, err := os.Readlink(linkPath)
	if err != nil {
		return "", false
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(filepath.Dir(linkPath), target)
	}
	resolvedTarget := filepath.Clean(target)
	identity := filepath.Base(resolvedTarget)
	if filepath.Join(basePath, identity) != resolvedTarget {
		return "", false
	}
	if _, err := worktree.SafeRelativePath(identity, "contextKey"); err != nil {
		return "", false
	}
	return identity, true
}

func contextIdentityFromProjectDirectory(basePath string, projectID string) (string, bool) {
	identity, err := worktree.SafeRelativePath(projectID, "projectId")
	if err != nil {
		return "", false
	}
	info, err := os.Stat(filepath.Join(basePath, identity))
	if err != nil || !info.IsDir() {
		return "", false
	}
	return identity, true
}

func contextIdentityFromKeys(repoKey string, projectID string) (string, error) {
	for _, candidate := range []string{repoKey, projectID} {
		trimmed := strings.TrimSpace(candidate)
		if trimmed == "" {
			continue
		}
		identity, err := worktree.SafeRelativePath(trimmed, "contextKey")
		if err != nil {
			return "", err
		}
		return identity, nil
	}
	return "", NewError(ErrCodeInvalidParams, "workspace context requires a repo key or project id")
}
