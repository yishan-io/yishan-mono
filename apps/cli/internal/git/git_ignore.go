package git

import (
	"context"
	"strings"
)

// WorktreeReady checks that root is inside a Git working tree.
func (s *GitService) WorktreeReady(ctx context.Context, root string) error {
	out, err := s.runReadCommand(ctx, root, "", false, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		return err
	}
	if strings.TrimSpace(out) != "true" {
		return NewError(ErrCodeToolUnavailable, "workspace is not inside a git worktree")
	}
	return nil
}

// CheckIgnoredPaths reports Git's ignore decision for each nonempty, workspace-relative
// path. Keys are preserved exactly, duplicates are checked once, and tracked files
// retain native Git semantics.
func (s *GitService) CheckIgnoredPaths(ctx context.Context, root string, paths []string) (map[string]bool, error) {
	ignored := make(map[string]bool, len(paths))
	var stdin strings.Builder
	for _, path := range paths {
		if path == "" {
			continue
		}
		if _, exists := ignored[path]; exists {
			continue
		}
		ignored[path] = false
		stdin.WriteString(path)
		stdin.WriteByte(0)
	}
	if len(ignored) == 0 {
		return ignored, nil
	}
	out, err := s.runReadCommand(ctx, root, stdin.String(), true, "check-ignore", "-z", "--stdin")
	if err != nil {
		return nil, err
	}
	for path := range strings.SplitSeq(out, "\x00") {
		if _, exists := ignored[path]; exists {
			ignored[path] = true
		}
	}
	return ignored, nil
}
