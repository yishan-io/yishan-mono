package files

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	gitexec "yishan/apps/cli/internal/git/exec"
)

func (s *FileService) listingCommand(ctx context.Context, args ...string) (*exec.Cmd, bool) {
	if s.gitCommand != nil {
		return s.gitCommand(ctx, args...)
	}
	return gitexec.DefaultRunner().CommandContext(ctx, args...)
}

func (s *FileService) probeGit(ctx context.Context, root string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	cmd, available := s.listingCommand(ctx, "-C", root, "rev-parse", "--is-inside-work-tree")
	if !available {
		return false, ctx.Err()
	}
	// Classification must not depend on the user's locale. Exit 128 alone is not evidence.
	cmd.Env = append(cmd.Environ(), "LC_ALL=C", "LANG=C")
	output, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return false, ctx.Err()
	}
	if errors.Is(err, exec.ErrNotFound) || errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		if isNonGitListingFailure(err, output) {
			return false, nil
		}
		return false, fmt.Errorf("probe file listing repository: %w", err)
	}
	if strings.TrimSpace(string(output)) != "true" {
		return false, NewError(ErrCodeInvalidParams, "file listing root is not a Git worktree")
	}
	return true, nil
}

func (s *FileService) runGitListing(ctx context.Context, root, path string, ignored bool) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	args := []string{"-C", root, "ls-files", "--others", "--exclude-standard"}
	if ignored {
		args = append(args, "--ignored")
		if strings.TrimSpace(path) == "" {
			args = append(args, "--directory", "--no-empty-directory")
		}
	} else {
		args = append(args, "--cached")
	}
	args = append(args, "-z", "--")
	if strings.TrimSpace(path) != "" {
		args = append(args, filepath.ToSlash(path))
	}
	cmd, available := s.listingCommand(ctx, args...)
	if !available {
		return nil, NewError(ErrCodeNotFound, "git became unavailable during file listing")
	}
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		return nil, fmt.Errorf("git file listing (ignored=%t): %w", ignored, err)
	}
	return output, nil
}

func (s *FileService) listGitFiles(ctx context.Context, root, path string) ([]FileEntry, bool, error) {
	repository, relative, err := s.resolveListingRepository(ctx, root, path)
	if err != nil {
		return nil, false, err
	}
	isGit, err := s.probeGit(ctx, repository)
	if err != nil || !isGit {
		return nil, isGit, err
	}
	normal, err := s.runGitListing(ctx, repository, relative, false)
	if err != nil {
		return nil, true, err
	}
	ignored, err := s.runGitListing(ctx, repository, relative, true)
	if err != nil {
		return nil, true, err
	}
	normal, err = prefixRepositoryListing(ctx, root, repository, normal)
	if err != nil {
		return nil, true, err
	}
	ignored, err = prefixRepositoryListing(ctx, root, repository, ignored)
	if err != nil {
		return nil, true, err
	}
	entries, err := parseGitListing(ctx, root, normal, ignored)
	return entries, true, err
}

func parseGitListing(ctx context.Context, root string, normal, ignored []byte) ([]FileEntry, error) {
	ignoredPaths := map[string]bool{}
	for _, rawPath := range strings.Split(string(ignored), "\x00") {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if path := normalizeListedPath(rawPath); path != "" {
			ignoredPaths[path] = true
		}
	}
	byPath := map[string]FileEntry{}
	for _, output := range [][]byte{normal, ignored} {
		for _, rawPath := range strings.Split(string(output), "\x00") {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			relPath := rawPath
			if normalizeListedPath(relPath) == "" {
				continue
			}
			paths := append(parentDirectoryPaths(relPath), relPath)
			if err := appendGitEntries(ctx, root, paths, ignoredPaths, byPath); err != nil {
				return nil, err
			}
		}
	}
	entries := make([]FileEntry, 0, len(byPath))
	for _, entry := range byPath {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, ctx.Err()
}

func normalizeListedPath(path string) string {
	return filepath.ToSlash(strings.TrimSuffix(path, "/"))
}

func appendGitEntries(ctx context.Context, root string, paths []string, ignored map[string]bool, entries map[string]FileEntry) error {
	for index, path := range paths {
		if err := ctx.Err(); err != nil {
			return err
		}
		normalized := normalizeListedPath(path)
		if _, exists := entries[normalized]; exists && index < len(paths)-1 {
			continue
		}
		entry, err := fileEntryForRelativePath(root, path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		entry.IsIgnored = ignored[normalized]
		entries[normalized] = entry
	}
	return ctx.Err()
}

// isNonGitListingFailure accepts only Git's definitive C-locale discovery failures.
// Other exit-128 errors (permissions, corrupt metadata, etc.) must remain errors.
func isNonGitListingFailure(err error, output []byte) bool {
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) || exitErr.ExitCode() != 128 {
		return false
	}
	message := strings.TrimSpace(string(output))
	if message == "fatal: not a git repository (or any of the parent directories): .git" {
		return true
	}
	lines := strings.Split(message, "\n")
	return len(lines) == 2 && strings.HasPrefix(lines[0], "fatal: not a git repository (or any parent up to mount point ") &&
		strings.HasSuffix(lines[0], ")") && lines[1] == "Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set)."
}

func (s *FileService) runCheckIgnore(ctx context.Context, input []byte, args ...string) ([]byte, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	cmd, available := s.listingCommand(ctx, args...)
	if !available {
		return nil, false, ctx.Err()
	}
	cmd.Env = append(cmd.Environ(), "LC_ALL=C", "LANG=C")
	if input != nil {
		cmd.Stdin = bytes.NewReader(input)
	}
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return nil, false, ctx.Err()
	}
	if err == nil {
		return output, true, nil
	}
	if errors.Is(err, exec.ErrNotFound) || errors.Is(err, os.ErrNotExist) {
		return nil, false, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		if exitErr.ExitCode() == 1 && len(output) == 0 {
			return nil, false, nil
		}
		if len(output) == 0 && isNonGitListingFailure(err, exitErr.Stderr) {
			return nil, false, nil
		}
	}
	return nil, false, fmt.Errorf("git check-ignore for file listing: %w", err)
}
