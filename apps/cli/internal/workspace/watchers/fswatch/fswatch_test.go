package fswatch

import (
	"path/filepath"
	"testing"
)

func TestNew_RequiresOnPathChanged(t *testing.T) {
	watcher, err := New(Config{})
	if err == nil {
		if watcher != nil {
			watcher.Close()
		}
		t.Fatal("expected error when OnPathChanged is missing")
	}
}

func TestDedupePaths_CanonicalizesAndDedupes(t *testing.T) {
	tempDir := t.TempDir()
	resolvedTempDir, err := filepath.EvalSymlinks(tempDir)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}

	paths := dedupePaths([]string{
		tempDir,
		resolvedTempDir,
		filepath.Join(resolvedTempDir, "."),
		"",
	})

	if len(paths) != 1 {
		t.Fatalf("expected 1 deduped path, got %d: %v", len(paths), paths)
	}
	if paths[0] != resolvedTempDir {
		t.Fatalf("expected canonical path %q, got %q", resolvedTempDir, paths[0])
	}
}
