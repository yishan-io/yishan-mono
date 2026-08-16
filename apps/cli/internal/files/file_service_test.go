package files

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
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
	if entry.ModifiedAt == "" {
		t.Fatalf("expected modifiedAt to be populated: %+v", entry)
	}

	entries, err := svc.List(root, "dir/sub", false)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(entries) != 1 || entries[0].Name != "a.txt" {
		t.Fatalf("unexpected list result: %+v", entries)
	}
	if entries[0].ModifiedAt == "" {
		t.Fatalf("expected modifiedAt on list entry: %+v", entries[0])
	}

	recursiveEntries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list: %v", err)
	}
	if len(recursiveEntries) != 3 || recursiveEntries[0].Path != "dir" || recursiveEntries[1].Path != "dir/sub" || recursiveEntries[2].Path != "dir/sub/a.txt" {
		t.Fatalf("unexpected recursive list result: %+v", recursiveEntries)
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

	fileErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected file domain Error, got %T", err)
	}
	if fileErr.Code != ErrCodePathRestricted {
		t.Fatalf("expected ErrCodePathRestricted, got %q", fileErr.Code)
	}
}

func TestFileServiceReadRejectsLargeFiles(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	largeContent := bytes.Repeat([]byte{'a'}, maxReadBytes+1)
	if err := os.WriteFile(filepath.Join(root, "large.txt"), largeContent, 0o644); err != nil {
		t.Fatalf("write large file: %v", err)
	}

	_, err := svc.Read(root, "large.txt")
	if err == nil {
		t.Fatal("expected large file read to be rejected")
	}
	fileErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected file domain Error, got %T", err)
	}
	if fileErr.Code != ErrCodeInvalidParams {
		t.Fatalf("expected ErrCodeInvalidParams, got %q", fileErr.Code)
	}
}

func TestFileServiceReadAllowsContextSymlinkTargetsOutsideWorkspace(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	contextDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(contextDir, "notes.md"), []byte("notes"), 0o644); err != nil {
		t.Fatalf("write context file: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ContextLinkName)); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	content, err := svc.Read(root, ".my-context/notes.md")
	if err != nil {
		t.Fatalf("read context file: %v", err)
	}
	if content != "notes" {
		t.Fatalf("unexpected context file content: %q", content)
	}
}

func TestFileServiceWriteAllowsContextSymlinkTargetsOutsideWorkspace(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	contextDir := t.TempDir()
	if err := os.Symlink(contextDir, filepath.Join(root, ContextLinkName)); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	if _, err := svc.Write(root, ".my-context/new.md", "hello", 0); err != nil {
		t.Fatalf("write context file: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(contextDir, "new.md"))
	if err != nil {
		t.Fatalf("read target file: %v", err)
	}
	if string(content) != "hello" {
		t.Fatalf("unexpected target content: %q", string(content))
	}
}

func TestFileServiceReadRejectsUnrelatedSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	externalDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(externalDir, "secret.txt"), []byte("secret"), 0o644); err != nil {
		t.Fatalf("write external file: %v", err)
	}
	if err := os.Symlink(externalDir, filepath.Join(root, "linked")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	_, err := svc.Read(root, "linked/secret.txt")
	if err == nil {
		t.Fatal("expected unrelated symlink read to be rejected")
	}
	fileErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected file domain Error, got %T", err)
	}
	if fileErr.Code != ErrCodePathRestricted {
		t.Fatalf("expected ErrCodePathRestricted, got %q", fileErr.Code)
	}
}

func TestFileServiceWriteRejectsUnrelatedSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	externalDir := t.TempDir()
	if err := os.Symlink(externalDir, filepath.Join(root, "linked")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	_, err := svc.Write(root, "linked/secret.txt", "secret", 0)
	if err == nil {
		t.Fatal("expected unrelated symlink write to be rejected")
	}
	fileErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected file domain Error, got %T", err)
	}
	if fileErr.Code != ErrCodePathRestricted {
		t.Fatalf("expected ErrCodePathRestricted, got %q", fileErr.Code)
	}
}

func TestFileServiceGitMetadataRejected(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".git/config"), []byte("[core]\n"), 0o644); err != nil {
		t.Fatalf("write .git/config: %v", err)
	}

	_, err := svc.Read(root, ".git/config")
	if err == nil {
		t.Fatal("expected .git path to be rejected")
	}

	fileErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("expected file domain Error, got %T", err)
	}
	if fileErr.Code != ErrCodePathRestricted {
		t.Fatalf("expected ErrCodePathRestricted, got %q", fileErr.Code)
	}

	if _, err := svc.List(root, ".git", false); err == nil {
		t.Fatal("expected listing .git to be rejected")
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
