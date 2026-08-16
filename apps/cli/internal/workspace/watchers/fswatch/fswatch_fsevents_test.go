//go:build darwin

package fswatch

import (
	"path/filepath"
	"testing"
)

func TestFSEventsBackend_ShouldEmitRecursivePaths(t *testing.T) {
	root := filepath.Clean(filepath.Join(t.TempDir(), "workspace"))
	backend := fseventsBackend{
		recursivePaths: []string{root},
	}

	if !backend.shouldEmitPath(root) {
		t.Fatal("expected recursive root path to emit")
	}
	if !backend.shouldEmitPath(filepath.Join(root, "nested", "file.txt")) {
		t.Fatal("expected nested recursive path to emit")
	}
	if backend.shouldEmitPath(filepath.Join(filepath.Dir(root), "other", "file.txt")) {
		t.Fatal("expected unrelated path to be ignored")
	}
}

func TestFSEventsBackend_ShouldEmitNonRecursivePaths(t *testing.T) {
	root := filepath.Clean(filepath.Join(t.TempDir(), "workspace"))
	backend := fseventsBackend{
		nonRecursivePaths: []string{root},
	}

	if !backend.shouldEmitPath(root) {
		t.Fatal("expected non-recursive root path to emit")
	}
	if !backend.shouldEmitPath(filepath.Join(root, "direct.txt")) {
		t.Fatal("expected direct child to emit")
	}
	if backend.shouldEmitPath(filepath.Join(root, "nested", "child.txt")) {
		t.Fatal("expected nested child to be ignored for non-recursive path")
	}
}
