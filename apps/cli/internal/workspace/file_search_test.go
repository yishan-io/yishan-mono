package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileServiceSearch_IncludesContextFiles(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := writeSearchFile(contextDir, "MEMORY.md", "memory"); err != nil {
		t.Fatalf("write context file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(".my-context\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	seedSearchFiles(t, root, "src/main.go")

	results, err := svc.Search(root, "memory", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 || results[0].Path != ".my-context/MEMORY.md" {
		t.Fatalf("expected .my-context/MEMORY.md in results, got %+v", results)
	}
}

func TestFileServiceSearch_PrefersFilenameMatchesOverPathOnlyMatches(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root,
		"packages/logger/src/file-search.ts",
		"src/features/search/index.ts",
		"docs/search-notes.md",
	)

	results, err := svc.Search(root, "sear", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	paths := []string{results[0].Path, results[1].Path, results[2].Path}
	expected := []string{"docs/search-notes.md", "packages/logger/src/file-search.ts", "src/features/search/index.ts"}
	for index := range expected {
		if paths[index] != expected[index] {
			t.Fatalf("expected %v, got %v", expected, paths)
		}
	}
}

func TestFileServiceSearch_SupportsFuzzySubsequenceMatching(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root, "src/components/FileManagerView.tsx", "src/views/TerminalView.tsx")

	results, err := svc.Search(root, "fmv", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 || results[0].Path != "src/components/FileManagerView.tsx" {
		t.Fatalf("unexpected results: %+v", results)
	}
	if len(results[0].HighlightedPathIndexes) != 3 {
		t.Fatalf("expected 3 highlight indexes, got %+v", results[0])
	}
}

func TestFileServiceSearch_MatchesPathSegmentsWhenFilenameDoesNotMatch(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root, "apps/desktop/src/renderer/views/workspace/RightPane/RightPaneView.tsx")

	results, err := svc.Search(root, "rendr", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("unexpected results: %+v", results)
	}
	if len(results[0].HighlightedPathIndexes) != 5 {
		t.Fatalf("expected 5 highlight indexes, got %+v", results[0])
	}
}

func TestFileServiceSearch_IgnoresIgnoredFiles(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()
	if err := writeSearchFile(root, ".gitignore", "ignored/\n"); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	seedSearchFiles(t, root, "visible/readme.md", "ignored/secret.md")

	results, err := svc.Search(root, "md", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 || results[0].Path != "visible/readme.md" {
		t.Fatalf("expected ignored files to be excluded, got %+v", results)
	}
}

func TestFileServiceSearch_DoesNotReturnDirectories(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	if err := os.MkdirAll(filepath.Join(root, "cmd", "nested"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := writeSearchFile(root, "cmd/main.go", "package main"); err != nil {
		t.Fatalf("write file: %v", err)
	}

	results, err := svc.Search(root, "cmd", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected only file result, got %+v", results)
	}
	if results[0].Path != "cmd/main.go" {
		t.Fatalf("expected file result, got %+v", results)
	}
}

func TestFileServiceSearch_EmptyQueryOrdersByPathLengthThenAlphabetically(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root, "z.ts", "src/a.ts", "a.ts")

	results, err := svc.Search(root, "  ", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	paths := []string{results[0].Path, results[1].Path, results[2].Path}
	expected := []string{"a.ts", "z.ts", "src/a.ts"}
	for index := range expected {
		if paths[index] != expected[index] {
			t.Fatalf("expected %v, got %v", expected, paths)
		}
	}
}

func TestFileServiceSearch_SpaceSeparatedQueryMatchesFullPath(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root,
		"apps/desktop/src/renderer/views/workspace/RightPane/RightPaneView.tsx",
		"src/views/TerminalView.tsx",
	)

	results, err := svc.Search(root, "renderer rightpane", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("unexpected results: %+v", results)
	}
	if results[0].Path != "apps/desktop/src/renderer/views/workspace/RightPane/RightPaneView.tsx" {
		t.Fatalf("unexpected result path: %+v", results)
	}
	if len(results[0].HighlightedPathIndexes) != len("rendererrightpane") {
		t.Fatalf("expected full path query highlights, got %+v", results[0])
	}
}

func TestFileServiceSearch_RespectsLimit(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root, "a.ts", "b.ts", "c.ts")

	results, err := svc.Search(root, "ts", 2, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %+v", results)
	}
}

func TestFileServiceSearch_ExcludesDirectoriesByDefault(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root, "src/main.go", "src/features/search/index.ts")

	results, err := svc.Search(root, "src", 10, false)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	for _, result := range results {
		if result.IsDirectory {
			t.Fatalf("expected no directories in results, got %+v", result)
		}
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 file results, got %d", len(results))
	}
}

func TestFileServiceSearch_IncludesDirectoriesWhenRequested(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()
	seedSearchFiles(t, root, "src/main.go", "src/features/search/index.ts", "docs/guide.md")

	results, err := svc.Search(root, "src", 10, true)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	paths := make([]string, 0, len(results))
	for _, result := range results {
		paths = append(paths, result.Path)
	}
	expected := []string{"src", "src/main.go", "src/features/search/index.ts"}
	for _, path := range expected {
		found := false
		for _, resultPath := range paths {
			if resultPath == path {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected %v to appear in results, got %v", path, paths)
		}
	}
	if results[0].Path != "src" || !results[0].IsDirectory {
		t.Fatalf("expected the exact directory match to rank first and be flagged, got %+v", results[0])
	}
}

func TestFileServiceSearch_ExcludesIgnoredDirectoriesWhenIncludingDirectories(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte("node_modules\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	seedSearchFiles(t, root, "src/main.go", "node_modules/pkg/index.js")

	results, err := svc.Search(root, "node", 10, true)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	for _, result := range results {
		if strings.HasPrefix(result.Path, "node_modules") {
			t.Fatalf("expected ignored node_modules entries to be excluded, got %+v", result)
		}
	}
}

func seedSearchFiles(t *testing.T, root string, paths ...string) {
	t.Helper()
	for _, path := range paths {
		if err := writeSearchFile(root, path, path); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
}

func writeSearchFile(root string, relativePath string, content string) error {
	fullPath := filepath.Join(root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(fullPath, []byte(content), 0o644)
}
