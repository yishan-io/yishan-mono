package files

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFileServiceList_CheckIgnoreFailures(t *testing.T) {
	for _, script := range []string{"exit 128", "printf 'visible.txt\\0'; exit 128", "exit 1", "exit 0", "missing", "non-git"} {
		for _, path := range []string{"", "child"} {
			t.Run(script+path, func(t *testing.T) { assertCheckIgnoreResult(t, script, path) })
		}
	}
}

func assertCheckIgnoreResult(t *testing.T, script, path string) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, path, "visible.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	svc := NewFileService()
	svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		command := script
		if script == "non-git" {
			command = "printf 'fatal: not a git repository (or any of the parent directories): .git\\n' >&2; exit 128"
		}
		if len(args) > 2 && args[2] == "rev-parse" {
			command = "printf true"
		}
		return exec.CommandContext(ctx, "/bin/sh", "-c", command), script != "missing"
	}
	wantError := strings.Contains(script, "128")
	for attempt := 0; attempt < 2; attempt++ {
		entries, err := svc.List(context.Background(), root, path, false)
		if (err != nil) != wantError || (wantError && entries != nil) {
			t.Fatalf("entries=%v err=%v wantError=%v", entries, err, wantError)
		}
	}
}

func TestFileServiceList_PreservesWhitespaceNames(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	for _, name := range []string{" notes.log", "notes.log", "tail.log "} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte("/ notes.log\n/tail.log\\ \n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, recursive := range []bool{false, true} {
		entries, err := NewFileService().List(context.Background(), root, "", recursive)
		if err != nil {
			t.Fatal(err)
		}
		byPath := map[string]FileEntry{}
		for _, entry := range entries {
			byPath[entry.Path] = entry
		}
		for name, wantIgnored := range map[string]bool{" notes.log": true, "notes.log": false, "tail.log ": true} {
			entry, exists := byPath[name]
			if !exists || entry.IsIgnored != wantIgnored {
				t.Fatalf("recursive=%t name=%q entries=%v", recursive, name, entries)
			}
		}
	}
}

func TestFileServiceList_TrackedDeletionAndRename(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	for _, name := range []string{"deleted.txt", "old.txt"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("tracked"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if output, err := exec.Command("git", "-C", root, "add", ".").CombinedOutput(); err != nil {
		t.Fatalf("%s: %v", output, err)
	}
	svc := NewFileService()
	if _, err := svc.List(context.Background(), root, "", true); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, "deleted.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(root, "old.txt"), filepath.Join(root, "new.txt")); err != nil {
		t.Fatal(err)
	}
	entries, err := svc.List(context.Background(), root, "", true)
	if err != nil || len(entries) != 1 || entries[0].Path != "new.txt" || entries[0].Size != 7 {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

type cancelOnInfoEntry struct {
	os.DirEntry
	stop func()
}

func (entry cancelOnInfoEntry) Info() (os.FileInfo, error) {
	entry.stop()
	return entry.DirEntry.Info()
}

func TestContextLinkTraversal_CancellationDuringMetadata(t *testing.T) {
	for _, isDeadline := range []bool{false, true} {
		t.Run(map[bool]string{false: "cancel", true: "deadline"}[isDeadline], func(t *testing.T) {
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, "notes.md"), []byte("x"), 0o644); err != nil {
				t.Fatal(err)
			}
			children, err := os.ReadDir(root)
			if err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			stop := cancel
			want := context.Canceled
			if isDeadline {
				var deadlineCancel context.CancelFunc
				ctx, deadlineCancel = context.WithTimeout(context.Background(), 20*time.Millisecond)
				defer deadlineCancel()
				stop = func() { <-ctx.Done() }
				want = context.DeadlineExceeded
			}
			entries := []FileEntry{}
			err = appendContextEntry(ctx, root, "", filepath.Join(root, "notes.md"), cancelOnInfoEntry{children[0], stop}, nil, &entries)
			if !errors.Is(err, want) {
				t.Fatalf("err=%v want=%v", err, want)
			}
		})
	}
}
