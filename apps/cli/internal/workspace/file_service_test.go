package workspace

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileServiceCRUD(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := svc.Mkdir(root, "dir/sub", true, 0); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	written, err := svc.Write(root, "dir/sub/a.txt", "hello", 0)
	if err != nil {
		t.Fatalf("write: %v", err)
	}
	if written != 5 {
		t.Fatalf("expected 5 bytes written, got %d", written)
	}

	content, err := svc.Read(root, "dir/sub/a.txt")
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if content != "hello" {
		t.Fatalf("unexpected content: %q", content)
	}

	entry, err := svc.Stat(root, "dir/sub/a.txt")
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if entry.Name != "a.txt" || entry.IsDir {
		t.Fatalf("unexpected stat entry: %+v", entry)
	}

	entries, err := svc.List(root, "dir/sub")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(entries) != 1 || entries[0].Name != "a.txt" {
		t.Fatalf("unexpected list result: %+v", entries)
	}

	if err := svc.Move(root, "dir/sub/a.txt", "dir/sub/b.txt"); err != nil {
		t.Fatalf("move: %v", err)
	}

	content, err = svc.Read(root, "dir/sub/b.txt")
	if err != nil {
		t.Fatalf("read moved file: %v", err)
	}
	if content != "hello" {
		t.Fatalf("unexpected moved file content: %q", content)
	}

	if err := svc.Delete(root, "dir/sub/b.txt", false); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "dir/sub/b.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected deleted file to not exist, got err=%v", err)
	}
}

func TestFileServicePathEscapeRejected(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	_, err := svc.Read(root, "../outside.txt")
	if err == nil {
		t.Fatal("expected path escape error")
	}

	rpcErr, ok := err.(*RPCError)
	if !ok {
		t.Fatalf("expected RPCError, got %T", err)
	}
	if rpcErr.Code != -32003 {
		t.Fatalf("expected code -32003, got %d", rpcErr.Code)
	}
}

func TestFileServiceReadDiff(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	runGit(t, root, "add", "note.txt")
	runGit(t, root, "commit", "-m", "seed")

	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("v2\n"), 0o644); err != nil {
		t.Fatalf("update file: %v", err)
	}

	diff, err := svc.ReadDiff(context.Background(), root, "note.txt")
	if err != nil {
		t.Fatalf("read diff: %v", err)
	}
	if !strings.Contains(diff, "diff --git") {
		t.Fatalf("expected git diff output, got: %q", diff)
	}
}

func initGitRepo(t *testing.T, root string) {
	t.Helper()
	runGit(t, root, "init")
	runGit(t, root, "config", "user.name", "Test User")
	runGit(t, root, "config", "user.email", "test@example.com")
}

func runGit(t *testing.T, root string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v (%s)", args, err, string(out))
	}
	return string(out)
}
