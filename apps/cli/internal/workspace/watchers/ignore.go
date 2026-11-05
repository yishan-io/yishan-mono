package watchers

import (
	"context"
	"errors"
	"path/filepath"
	"time"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/git"
)

const (
	gitIgnoreBatchSize      = 128
	gitIgnoreCommandTimeout = 2 * time.Second
)

var errIgnoreGenerationChanged = errors.New("git ignore configuration changed")

func (w *worktreeWatcher) isGitIgnoredPath(path string) bool {
	if filepath.IsAbs(path) {
		path = w.relativeWorkspacePath(path)
	}
	ignored, err := w.classifyGitIgnoredPaths(context.Background(), []string{path})
	if err != nil { // Fail open on transient errors; never cache them as negative matches.
		log.Debug().Err(err).Msg("git ignore classification failed")
		return false
	}
	return ignored[path]
}

// classifyGitIgnoredPaths returns exact matches for workspace-relative paths.
// Errors (including invalidation) leave callers free to fail open or retry later.
func (w *worktreeWatcher) classifyGitIgnoredPaths(ctx context.Context, paths []string) (map[string]bool, error) {
	ctx, cancel := w.ignoreContext(ctx)
	defer cancel()
	ignored, uncached, generation := w.snapshotIgnoredPaths(paths)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if len(uncached) > 0 {
		if err := w.isGitIgnoreUsable(ctx, generation); err != nil {
			return nil, err
		}
		for start := 0; start < len(uncached); start += gitIgnoreBatchSize {
			end := min(start+gitIgnoreBatchSize, len(uncached))
			matches, err := w.gitOperations().CheckIgnoredPaths(ctx, w.path, uncached[start:end])
			if err != nil {
				return nil, err
			}
			for path, isIgnored := range matches {
				ignored[path] = isIgnored
			}
		}
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if generation != w.ignoreGeneration {
		return nil, errIgnoreGenerationChanged
	}
	if w.ignoredPaths == nil {
		w.ignoredPaths = make(map[string]bool)
	}
	for _, path := range uncached {
		w.ignoredPaths[path] = ignored[path]
	}
	return ignored, nil
}

func (w *worktreeWatcher) snapshotIgnoredPaths(paths []string) (map[string]bool, []string, uint64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	ignored := make(map[string]bool, len(paths))
	uncached := make([]string, 0, len(paths))
	for _, path := range paths {
		if path == "" {
			continue
		}
		if _, exists := ignored[path]; exists {
			continue
		}
		isIgnored, isCached := w.ignoredPaths[path]
		ignored[path] = isIgnored
		if !isCached {
			uncached = append(uncached, path)
		}
	}
	return ignored, uncached, w.ignoreGeneration
}

func (w *worktreeWatcher) ignoreContext(parent context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithTimeout(parent, gitIgnoreCommandTimeout)
	if w.gitContext == nil {
		return ctx, cancel
	}
	stop := context.AfterFunc(w.gitContext, cancel)
	if w.gitContext.Err() != nil {
		cancel()
	}
	return ctx, func() { stop(); cancel() }
}

func (w *worktreeWatcher) isGitIgnoreUsable(ctx context.Context, generation uint64) error {
	for {
		w.mu.Lock()
		if generation != w.ignoreGeneration {
			w.mu.Unlock()
			return errIgnoreGenerationChanged
		}
		if w.gitIgnoreUsable != nil {
			w.mu.Unlock()
			return nil
		}
		if pending := w.ignoreProbeDone; pending != nil {
			w.mu.Unlock()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-pending:
			}
			continue
		}
		pending := make(chan struct{})
		w.ignoreProbeDone = pending
		w.mu.Unlock()
		err := w.gitOperations().WorktreeReady(ctx, w.path)
		return w.completeIgnoreProbe(ctx, generation, pending, err)
	}
}

func (w *worktreeWatcher) completeIgnoreProbe(ctx context.Context, generation uint64, pending chan struct{}, err error) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if ctx.Err() != nil {
		err = ctx.Err()
	}
	if generation != w.ignoreGeneration {
		err = errIgnoreGenerationChanged
	}
	if err == nil {
		usable := true
		w.gitIgnoreUsable = &usable
	}
	w.ignoreProbeDone = nil
	close(pending)
	return err
}

// Manual fixtures may omit the service. Never assign here: callers can overlap.
func (w *worktreeWatcher) gitOperations() watcherGit {
	if w.gitService != nil {
		return w.gitService
	}
	return git.NewGitService()
}
