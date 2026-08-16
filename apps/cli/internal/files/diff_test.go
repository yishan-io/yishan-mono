package files

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
)

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
	if diff.OldContent != "v1\n" {
		t.Fatalf("expected oldContent %q, got %q", "v1\\n", diff.OldContent)
	}
	if diff.NewContent != "v2\n" {
		t.Fatalf("expected newContent %q, got %q", "v2\\n", diff.NewContent)
	}
	if diff.ShouldSkipDecorations {
		t.Fatalf("expected text file diff to keep decorations enabled")
	}
}

func TestFileServiceReadDiffSkipsLargeFiles(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	largeContent := bytes.Repeat([]byte("a"), maxDiffFileBytes+1)
	if err := os.WriteFile(filepath.Join(root, "large.txt"), largeContent, 0o644); err != nil {
		t.Fatalf("write large file: %v", err)
	}

	diff, err := svc.ReadDiff(context.Background(), root, "large.txt")
	if err != nil {
		t.Fatalf("read diff: %v", err)
	}
	if !diff.ShouldSkipDecorations {
		t.Fatalf("expected large file diff to skip decorations")
	}
	if diff.OldContent != "" || diff.NewContent != "" {
		t.Fatalf("expected skipped diff contents to be empty, got %+v", diff)
	}
}

func TestFileServiceReadDiffSkipsBinaryExtensions(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "image.png"), []byte("not really png"), 0o644); err != nil {
		t.Fatalf("write image file: %v", err)
	}

	diff, err := svc.ReadDiff(context.Background(), root, "image.png")
	if err != nil {
		t.Fatalf("read diff: %v", err)
	}
	if !diff.ShouldSkipDecorations {
		t.Fatalf("expected binary extension diff to skip decorations")
	}
}

func TestFileServiceReadDiffSkipsBinaryContent(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "blob.txt"), []byte{'a', 0, 'b'}, 0o644); err != nil {
		t.Fatalf("write binary-like file: %v", err)
	}

	diff, err := svc.ReadDiff(context.Background(), root, "blob.txt")
	if err != nil {
		t.Fatalf("read diff: %v", err)
	}
	if !diff.ShouldSkipDecorations {
		t.Fatalf("expected binary-like content diff to skip decorations")
	}
}

func TestFileServiceReadDiffNewFile(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "new.txt"), []byte("brand new\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	diff, err := svc.ReadDiff(context.Background(), root, "new.txt")
	if err != nil {
		t.Fatalf("read diff: %v", err)
	}
	if diff.OldContent != "" {
		t.Fatalf("expected empty oldContent for new file, got %q", diff.OldContent)
	}
	if diff.NewContent != "brand new\n" {
		t.Fatalf("expected newContent %q, got %q", "brand new\\n", diff.NewContent)
	}
}

func TestFileServiceReadDiffDeletedFile(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "gone.txt"), []byte("was here\n"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	runGit(t, root, "add", "gone.txt")
	runGit(t, root, "commit", "-m", "seed")

	if err := os.Remove(filepath.Join(root, "gone.txt")); err != nil {
		t.Fatalf("remove file: %v", err)
	}

	diff, err := svc.ReadDiff(context.Background(), root, "gone.txt")
	if err != nil {
		t.Fatalf("read diff: %v", err)
	}
	if diff.OldContent != "was here\n" {
		t.Fatalf("expected oldContent %q, got %q", "was here\\n", diff.OldContent)
	}
	if diff.NewContent != "" {
		t.Fatalf("expected empty newContent for deleted file, got %q", diff.NewContent)
	}
}
