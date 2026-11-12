package files

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileServiceList_ContextPartition(t *testing.T) {
	for _, ordinary := range []bool{false, true} {
		for _, fail := range []bool{false, true} {
			t.Run(fmtBoundaryCase(ordinary, fail), func(t *testing.T) {
				svc := NewFileService()
				calls := 0
				svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
					calls++
					script := "input=$(tr '\\000' '\\n'); case \"$input\" in *.my-context*) exit 128;; esac; exit 1"
					if fail {
						script = "exit 128"
					}
					return exec.CommandContext(ctx, "/bin/sh", "-c", script), true
				}
				entries := []FileEntry{{Path: ".my-context/notes.md"}}
				path := ".my-context"
				if ordinary {
					entries = append(entries, FileEntry{Path: "visible.txt", IsIgnored: true})
					path = ""
				}
				got, err := svc.markIgnoredEntries(context.Background(), t.TempDir(), path, entries, false)
				if (err != nil) != (ordinary && fail) {
					t.Fatalf("entries=%v err=%v", got, err)
				}
				if err == nil && !got[0].IsIgnored {
					t.Fatal("context entry not ignored")
				}
				if !ordinary && calls != 0 {
					t.Fatalf("context-only input started %d commands", calls)
				}
			})
		}
	}
}

func fmtBoundaryCase(ordinary, fail bool) string {
	if ordinary {
		if fail {
			return "mixed-failure"
		}
		return "mixed"
	}
	if fail {
		return "context-only-unavailable"
	}
	return "context-only"
}

func TestFileServiceList_QuietFailureAfterBulkSuccess(t *testing.T) {
	svc := NewFileService()
	svc.gitCommand = func(ctx context.Context, args ...string) (*exec.Cmd, bool) {
		script := "exit 0"
		if strings.Contains(strings.Join(args, " "), "--quiet") {
			script = "exit 128"
		}
		return exec.CommandContext(ctx, "/bin/sh", "-c", script), true
	}
	entries, err := svc.markIgnoredEntries(context.Background(), t.TempDir(), "child", []FileEntry{{Path: "child/file"}}, false)
	if err == nil || entries != nil {
		t.Fatalf("entries=%v err=%v", entries, err)
	}
}

func runBoundaryGit(t *testing.T, root string, args ...string) {
	t.Helper()
	command := append([]string{"-C", root}, args...)
	if output, err := exec.Command("git", command...).CombinedOutput(); err != nil {
		t.Fatalf("git %v: %s: %v", args, output, err)
	}
}

func createSubmoduleFixture(t *testing.T) string {
	t.Helper()
	source, root := t.TempDir(), t.TempDir()
	initGitRepo(t, source)
	for name, contents := range map[string]string{"tracked.txt": "tracked", ".gitignore": "*.log\n"} {
		if err := os.WriteFile(filepath.Join(source, name), []byte(contents), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	runBoundaryGit(t, source, "add", ".")
	runBoundaryGit(t, source, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture")
	initGitRepo(t, root)
	runBoundaryGit(t, root, "-c", "protocol.file.allow=always", "submodule", "add", source, "sub")
	if err := os.Mkdir(filepath.Join(root, "sub", "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"sub/ignored.log", "sub/nested/file.txt"} {
		if err := os.WriteFile(filepath.Join(root, path), []byte("hello"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestFileServiceList_SubmoduleBrowsing(t *testing.T) {
	root := createSubmoduleFixture(t)
	for _, recursive := range []bool{false, true} {
		for _, path := range []string{"sub", "sub/nested"} {
			entries, err := NewFileService().List(context.Background(), root, path, recursive)
			if err != nil {
				t.Fatalf("path=%s recursive=%t: %v", path, recursive, err)
			}
			byPath := map[string]FileEntry{}
			for _, entry := range entries {
				byPath[entry.Path] = entry
				if entry.Name == ".git" {
					t.Fatal("exposed Git metadata")
				}
			}
			expected := "sub/nested/file.txt"
			if path == "sub" && !recursive {
				expected = "sub/tracked.txt"
			}
			if entry, ok := byPath[expected]; !ok || entry.Size == 0 || entry.Mode == 0 || entry.ModifiedAt == "" {
				t.Fatalf("missing metadata for %s: %v", expected, entries)
			}
			if path == "sub" && !byPath["sub/ignored.log"].IsIgnored {
				t.Fatalf("submodule ignore rules lost: %v", entries)
			}
		}
	}
}

func TestFileServiceList_ContextMetadataIsNotWorkspaceRepository(t *testing.T) {
	root, target := t.TempDir(), t.TempDir()
	initGitRepo(t, root)
	if err := os.Symlink(target, filepath.Join(root, ContextLinkName)); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{".git": "gitdir: missing\n", "notes.md": "notes"} {
		if err := os.WriteFile(filepath.Join(target, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := NewFileService().List(context.Background(), root, ContextLinkName, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name == ".git" || !entry.IsIgnored {
			t.Fatalf("unexpected context entry: %v", entry)
		}
	}
	if len(entries) != 2 {
		t.Fatalf("entries=%v", entries)
	}
}

func TestFileServiceList_SubmoduleOperationalFailure(t *testing.T) {
	root := createSubmoduleFixture(t)
	if err := os.WriteFile(filepath.Join(root, "sub", ".git"), []byte("gitdir: missing\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, recursive := range []bool{false, true} {
		entries, err := NewFileService().List(context.Background(), root, "sub", recursive)
		if err == nil || entries != nil {
			t.Fatalf("recursive=%t entries=%v err=%v", recursive, entries, err)
		}
	}
}
