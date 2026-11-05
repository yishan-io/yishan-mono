package watchers

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"

	"yishan/apps/cli/internal/git"
	gitexec "yishan/apps/cli/internal/git/exec"
)

type watcherCommandFunc func(context.Context, ...string) (*exec.Cmd, bool)

func (command watcherCommandFunc) CommandContext(ctx context.Context, args ...string) (*exec.Cmd, bool) {
	return command(ctx, args...)
}

type watcherTestGit struct {
	*git.GitService
	command watcherCommandFunc
}

func installGitCommand(w *worktreeWatcher, command watcherCommandFunc) {
	w.gitService = &watcherTestGit{GitService: git.NewGitServiceWithRunner(command), command: command}
}

func defaultGitCommand(ctx context.Context, args ...string) (*exec.Cmd, bool) {
	return gitexec.DefaultRunner().CommandContext(ctx, args...)
}

func TestGitService_NilFallbackConcurrent(t *testing.T) {
	initialized := newIgnoreTestWatcher(t)
	if err := os.WriteFile(filepath.Join(initialized.path, ".gitignore"), []byte("hidden\n"), 0644); err != nil {
		t.Fatal(err)
	}
	w := &worktreeWatcher{path: initialized.path}
	var group sync.WaitGroup
	for index := 0; index < 8; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			matches, err := w.classifyGitIgnoredPaths(context.Background(), []string{"visible", "hidden"})
			if err != nil || len(matches) != 2 || matches["visible"] || !matches["hidden"] {
				t.Errorf("classification = %v, %v", matches, err)
			}
			// An unborn repository has no branch, but the fallback must handle it safely.
			if branch := w.readCurrentBranch(); branch != "" {
				t.Errorf("unborn branch = %q", branch)
			}
		}()
	}
	group.Wait()
	if w.gitService != nil {
		t.Fatal("fallback mutated the fixture")
	}
}

func TestGitCommandAdapter_PreservesOriginalContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := newIgnoreTestWatcher(t)
	installGitCommand(w, func(commandCtx context.Context, args ...string) (*exec.Cmd, bool) {
		if commandCtx != ctx {
			t.Error("adapter replaced original context")
		}
		return defaultGitCommand(commandCtx, args...)
	})
	if err := w.gitOperations().WorktreeReady(ctx, w.path); err != nil {
		t.Fatal(err)
	}
	if _, err := w.gitOperations().CheckIgnoredPaths(ctx, w.path, []string{"visible"}); err != nil {
		t.Fatal(err)
	}
	if _, err := w.gitOperations().HeadName(ctx, w.path); err == nil {
		t.Fatal("unborn branch should fail")
	}
}
