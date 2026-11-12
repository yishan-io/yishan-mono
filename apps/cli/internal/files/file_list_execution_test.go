package files

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFileServiceList_OperationalGitFailureDoesNotWalk(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".git"), []byte("gitdir: missing-metadata\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "visible.txt"), []byte("must not return partial success"), 0o644); err != nil {
		t.Fatal(err)
	}
	entries, err := NewFileService().List(context.Background(), root, "", true)
	if err == nil || entries != nil {
		t.Fatalf("operational git failure returned entries=%v, err=%v", entries, err)
	}
}

func TestFileServiceListBrokenContextSymlinkFallsBackToLinkMetadata(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	missingTarget := filepath.Join(t.TempDir(), "missing")
	if err := os.Symlink(missingTarget, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(context.Background(), root, "", false)
	if err != nil {
		t.Fatalf("list root: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != ".my-context" || entries[0].IsDir {
		t.Fatalf("expected broken context symlink to fall back to file-like metadata, got %+v", entries)
	}

	recursiveEntries, err := svc.List(context.Background(), root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}
	if len(recursiveEntries) != 1 || recursiveEntries[0].Path != ".my-context" || recursiveEntries[0].IsDir {
		t.Fatalf("expected recursive list to preserve broken context symlink, got %+v", recursiveEntries)
	}
}

func TestFileServiceList_GitFailureClassification(t *testing.T) {
	cases := []struct {
		name, probe, normal, ignored   string
		available, wantError, wantWalk bool
	}{
		{"success", "printf true", "printf 'visible.txt\\0'", "exit 0", true, false, false},
		{"non-git", "printf 'fatal: not a git repository (or any of the parent directories): .git\\n'; exit 128", "", "", true, false, true},
		{"mount-boundary", "printf 'fatal: not a git repository (or any parent up to mount point /)\\nStopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).\\n'; exit 128", "", "", true, false, true},
		{"unavailable", "", "", "", false, false, true},
		{"operational-probe-128", "echo fatal: permission denied; exit 128", "", "", true, true, false},
		{"operational-list-128", "printf true", "echo fatal: index corrupt >&2; exit 128", "", true, true, false},
		{"ignored-list-failure", "printf true", "printf 'visible.txt\\0'", "exit 128", true, true, false},
	}
	for _, scenario := range cases {
		t.Run(scenario.name, func(t *testing.T) {
			assertGitListingScenario(t, scenario.probe, scenario.normal, scenario.ignored, scenario.available, scenario.wantError, scenario.wantWalk)
		})
	}
}

func assertGitListingScenario(t *testing.T, probe, normal, ignored string, available, wantError, wantWalk bool) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "visible.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := NewFileService()
	svc.gitCommand = scriptedGit(probe, normal, ignored, available)
	didWalk := false
	svc.walkDir = func(root string, visit fs.WalkDirFunc) error { didWalk = true; return filepath.WalkDir(root, visit) }
	entries, err := svc.List(context.Background(), root, "", true)
	if (err != nil) != wantError || didWalk != wantWalk {
		t.Fatalf("entries=%v err=%v walked=%v", entries, err, didWalk)
	}
	if wantError && entries != nil {
		t.Fatalf("partial success: %v", entries)
	}
	if !wantError && (len(entries) != 1 || entries[0].Size != 5) {
		t.Fatalf("missing metadata: %v", entries)
	}
}

func scriptedGit(probe, normal, ignored string, available bool) func(context.Context, ...string) (*exec.Cmd, bool) {
	return func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		script := "exit 1"
		if len(args) > 2 && args[2] == "rev-parse" {
			script = probe
		}
		if len(args) > 2 && args[2] == "ls-files" {
			script = normal
			if strings.Contains(strings.Join(args, " "), "--ignored") {
				script = ignored
			}
		}
		return exec.CommandContext(ctx, "/bin/sh", "-c", script), available
	}
}

func TestFileServiceList_GitPathSkipsIgnoreRecheck(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"tracked.txt", "ignored.log"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var revParseCalls, lsFilesCalls, checkIgnoreCalls int
	svc := NewFileService()
	svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		script := "exit 1"
		switch {
		case len(args) > 2 && args[2] == "rev-parse":
			revParseCalls++
			script = "printf true"
		case len(args) > 2 && args[2] == "ls-files":
			lsFilesCalls++
			script = "printf 'tracked.txt\\0'"
			if strings.Contains(strings.Join(args, " "), "--ignored") {
				script = "printf 'ignored.log\\0'"
			}
		case len(args) > 2 && args[2] == "check-ignore":
			checkIgnoreCalls++
		}
		return exec.CommandContext(ctx, "/bin/sh", "-c", script), true
	}

	entries, err := svc.List(context.Background(), root, "", true)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if revParseCalls != 1 || lsFilesCalls != 2 {
		t.Fatalf("unexpected git subprocess counts: rev-parse=%d ls-files=%d", revParseCalls, lsFilesCalls)
	}
	if checkIgnoreCalls != 0 {
		t.Fatalf("recursive git listing ran %d check-ignore subprocesses, want 0", checkIgnoreCalls)
	}

	ignoredByPath := map[string]bool{}
	for _, entry := range entries {
		ignoredByPath[entry.Path] = entry.IsIgnored
	}
	if len(entries) != 2 {
		t.Fatalf("entries=%v", entries)
	}
	if ignoredByPath["tracked.txt"] {
		t.Fatalf("tracked.txt unexpectedly ignored")
	}
	if !ignoredByPath["ignored.log"] {
		t.Fatalf("ignored.log not marked ignored from ls-files output")
	}
}

func TestFileServiceList_CancellationStopsSubsequentOperations(t *testing.T) {
	for _, stage := range []string{"before", "probe", "normal", "ignored", "walk"} {
		t.Run(stage, func(t *testing.T) {
			svc := NewFileService()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			calls := 0
			svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
				calls++
				if (stage == "probe" && calls == 1) || (stage == "normal" && calls == 2) || (stage == "ignored" && calls == 3) {
					cancel()
				}
				return exec.CommandContext(ctx, "/bin/sh", "-c", "printf true"), stage != "walk"
			}
			svc.walkDir = func(root string, visit fs.WalkDirFunc) error { cancel(); return filepath.WalkDir(root, visit) }
			if stage == "before" {
				cancel()
			}
			entries, err := svc.List(ctx, t.TempDir(), "", true)
			if !errors.Is(err, context.Canceled) || entries != nil {
				t.Fatalf("entries=%v err=%v", entries, err)
			}
			if stage == "before" && calls != 0 {
				t.Fatalf("started %d commands after cancel", calls)
			}
		})
	}
}

func TestFileServiceList_DeadlineStopsSubprocessWithoutWalking(t *testing.T) {
	svc := NewFileService()
	svc.gitCommand = scriptedGit("exec sleep 10", "", "", true)
	svc.walkDir = func(string, fs.WalkDirFunc) error { t.Error("walk after timeout"); return nil }
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	started := time.Now()
	entries, err := svc.List(ctx, t.TempDir(), "", true)
	if !errors.Is(err, context.DeadlineExceeded) || entries != nil {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
	if time.Since(started) > time.Second {
		t.Fatal("subprocess did not stop promptly")
	}
}

func TestFileServiceList_FallbackHasIndependentBoundedDeadline(t *testing.T) {
	svc := NewFileService()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	var scanCtx context.Context
	svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		scanCtx = ctx
		return nil, false
	}
	svc.walkDir = func(root string, visit fs.WalkDirFunc) error {
		deadline, hasDeadline := scanCtx.Deadline()
		callerDeadline, _ := ctx.Deadline()
		if !hasDeadline || !deadline.After(callerDeadline) {
			t.Error("fallback inherited first waiter deadline")
		}
		<-scanCtx.Done()
		return filepath.WalkDir(root, visit)
	}
	entries, err := svc.List(ctx, t.TempDir(), "", true)
	if !errors.Is(err, context.DeadlineExceeded) || entries != nil {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

func TestFileServiceList_CancellationRetainsWorkerOwnership(t *testing.T) {
	svc := NewFileService()
	svc.gitCommand = scriptedGit("", "", "", false)
	entered, release := make(chan struct{}), make(chan struct{})
	svc.walkDir = func(root string, visit fs.WalkDirFunc) error {
		close(entered)
		<-release
		return filepath.WalkDir(root, visit)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	completed := make(chan error, 1)
	root := t.TempDir()
	go func() { _, err := svc.List(ctx, root, "", true); completed <- err }()
	<-entered
	cancel()
	if err := <-completed; !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v", err)
	}
	// The canceled waiter returns, but the coordinator must retain ownership.
	svc.mu.Lock()
	active := len(svc.recursiveScans)
	var scan *recursiveScan
	for _, owned := range svc.recursiveScans {
		scan = owned
	}
	svc.mu.Unlock()
	if active != 1 {
		t.Fatalf("active scans=%d", active)
	}

	close(release)
	<-scan.done
}

func TestFileServiceList_RecursiveScanHasNamedTotalDeadline(t *testing.T) {
	svc := NewFileService()
	var deadline time.Time
	svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		var hasDeadline bool
		deadline, hasDeadline = ctx.Deadline()
		if !hasDeadline {
			t.Error("missing total scan deadline")
		}
		return nil, false
	}
	svc.walkDir = func(string, fs.WalkDirFunc) error { return nil }
	started := time.Now()
	if _, err := svc.List(context.Background(), t.TempDir(), "", true); err != nil {
		t.Fatal(err)
	}
	if duration := deadline.Sub(started); duration <= 0 || duration > recursiveListTimeout+time.Second {
		t.Fatalf("unexpected deadline: %v", duration)
	}
}

func prepareRetargetedDirectoryRoots(t *testing.T) (string, string) {
	t.Helper()
	base := t.TempDir()
	first, second := filepath.Join(base, "a"), filepath.Join(base, "b")
	for _, root := range []string{first, second} {
		if err := os.Mkdir(root, 0755); err != nil {
			t.Fatal(err)
		}
		if output, err := exec.Command("git", "init", root).CombinedOutput(); err != nil {
			t.Fatalf("git init: %v: %s", err, output)
		}
	}
	for root, name := range map[string]string{first: "a.txt", second: "b.txt"} {
		if err := os.WriteFile(filepath.Join(root, name), nil, 0644); err != nil {
			t.Fatal(err)
		}
	}
	alias := filepath.Join(base, "alias")
	if err := os.Symlink(first, alias); err != nil {
		t.Fatal(err)
	}
	return alias, second
}

func TestListDirectory_RetargetedRootDoesNotPolluteCache(t *testing.T) {
	alias, second := prepareRetargetedDirectoryRoots(t)
	service := NewFileService()
	didRetarget := false
	service.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		if !didRetarget {
			didRetarget = true
			if err := os.Remove(alias); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(second, alias); err != nil {
				t.Fatal(err)
			}
		}
		return exec.CommandContext(ctx, "git", args...), true
	}
	_, listErr := service.List(context.Background(), alias, "", false)
	entries, err := service.List(context.Background(), second, "", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name != "b.txt" {
		t.Fatalf("B listing contains A entries: %+v", entries)
	}
	if !didRetarget {
		t.Fatal("listing did not reach retarget hook")
	}
	if listErr == nil {
		t.Fatal("lifecycle-changed listing was published")
	}
}
