package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileServiceRecursiveListUsesGitIgnore(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.MkdirAll(filepath.Join(root, "cmd/app"), 0o755); err != nil {
		t.Fatalf("mkdir cmd: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(root, "node_modules/pkg"), 0o755); err != nil {
		t.Fatalf("mkdir ignored: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte("node_modules/\n*.log\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "cmd/app/main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "debug.log"), []byte("ignored\n"), 0o644); err != nil {
		t.Fatalf("write ignored log: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "node_modules/pkg/index.js"), []byte("ignored\n"), 0o644); err != nil {
		t.Fatalf("write ignored package: %v", err)
	}

	entries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list: %v", err)
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		paths = append(paths, entry.Path)
	}
	expected := []string{
		".gitignore",
		"cmd",
		"cmd/app",
		"cmd/app/main.go",
		"debug.log",
		"node_modules/",
	}
	if strings.Join(paths, ",") != strings.Join(expected, ",") {
		t.Fatalf("expected recursive git paths %v, got %v", expected, paths)
	}
}

func TestFileServiceRecursiveListInsideIgnoredPathIncludesDescendants(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.MkdirAll(filepath.Join(root, ".opencode", "agents"), 0o755); err != nil {
		t.Fatalf("mkdir .opencode: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(".opencode/\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".opencode", "agents", "main.md"), []byte("agent\n"), 0o644); err != nil {
		t.Fatalf("write ignored descendant: %v", err)
	}

	entries, err := svc.List(root, ".opencode", true)
	if err != nil {
		t.Fatalf("recursive list ignored path: %v", err)
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		paths = append(paths, entry.Path)
	}

	expected := []string{
		".opencode",
		".opencode/agents",
		".opencode/agents/main.md",
	}
	if strings.Join(paths, ",") != strings.Join(expected, ",") {
		t.Fatalf("expected ignored descendants %v, got %v", expected, paths)
	}

	for _, entry := range entries {
		if !entry.IsIgnored {
			t.Fatalf("expected ignored descendant %s to be marked ignored, got %+v", entry.Path, entry)
		}
	}
}

func TestFileServiceDirectListMarksGitIgnoredEntries(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.MkdirAll(filepath.Join(root, "node_modules/pkg"), 0o755); err != nil {
		t.Fatalf("mkdir ignored: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte("node_modules/\n*.log\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "debug.log"), []byte("ignored\n"), 0o644); err != nil {
		t.Fatalf("write ignored log: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "readme.md"), []byte("visible\n"), 0o644); err != nil {
		t.Fatalf("write visible file: %v", err)
	}

	entries, err := svc.List(root, "", false)
	if err != nil {
		t.Fatalf("direct list: %v", err)
	}

	ignoredByPath := map[string]bool{}
	for _, entry := range entries {
		ignoredByPath[entry.Path] = entry.IsIgnored
	}
	if !ignoredByPath["node_modules"] || !ignoredByPath["debug.log"] {
		t.Fatalf("expected ignored entries to be marked, got %+v", entries)
	}
	if ignoredByPath["readme.md"] || ignoredByPath[".gitignore"] {
		t.Fatalf("expected visible entries to stay unignored, got %+v", entries)
	}
	if _, ok := ignoredByPath[".git"]; ok {
		t.Fatalf("expected .git metadata to stay hidden, got %+v", entries)
	}
}

func TestFileServiceListTreatsDirectorySymlinkAsDirectory(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := os.MkdirAll(contextDir, 0o755); err != nil {
		t.Fatalf("mkdir context target: %v", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, "notes.md"), []byte("notes"), 0o644); err != nil {
		t.Fatalf("write context note: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(root, "", false)
	if err != nil {
		t.Fatalf("list root: %v", err)
	}
	entryByPath := map[string]FileEntry{}
	for _, entry := range entries {
		entryByPath[entry.Path] = entry
	}
	contextEntry, ok := entryByPath[".my-context"]
	if !ok {
		t.Fatalf("expected .my-context entry, got %+v", entries)
	}
	if !contextEntry.IsDir {
		t.Fatalf("expected .my-context symlink to be treated as a directory, got %+v", contextEntry)
	}

	childEntries, err := svc.List(root, ".my-context", false)
	if err != nil {
		t.Fatalf("list context symlink: %v", err)
	}
	if len(childEntries) != 1 || childEntries[0].Path != ".my-context/notes.md" {
		t.Fatalf("expected context child entry, got %+v", childEntries)
	}
}

func TestFileServiceWalkTreatsDirectorySymlinkAsDirectoryEntry(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := os.MkdirAll(contextDir, 0o755); err != nil {
		t.Fatalf("mkdir context target: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.walkFiles(root, root)
	if err != nil {
		t.Fatalf("walk files: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != ".my-context" || !entries[0].IsDir {
		t.Fatalf("expected .my-context directory entry, got %+v", entries)
	}
}

func TestFileServiceRecursiveListIncludesContextSymlinkContents(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(contextDir, "docs"), 0o755); err != nil {
		t.Fatalf("mkdir context docs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, "docs", "brief.md"), []byte("brief"), 0o644); err != nil {
		t.Fatalf("write context brief: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}
	entryByPath := map[string]FileEntry{}
	for _, entry := range entries {
		entryByPath[entry.Path] = entry
	}
	for _, path := range []string{".my-context", ".my-context/docs", ".my-context/docs/brief.md"} {
		if _, ok := entryByPath[path]; !ok {
			t.Fatalf("expected %s in recursive list, got %+v", path, entries)
		}
	}
	if !entryByPath[".my-context"].IsDir || !entryByPath[".my-context/docs"].IsDir {
		t.Fatalf("expected context entries to be directories, got %+v", entryByPath)
	}
}

func TestFileServiceMarksIgnoredContextDescendants(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(contextDir, "docs"), 0o755); err != nil {
		t.Fatalf("mkdir context docs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, "docs", "brief.md"), []byte("brief"), 0o644); err != nil {
		t.Fatalf("write context brief: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte(".my-context\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}

	ignoredByPath := map[string]bool{}
	for _, entry := range entries {
		ignoredByPath[entry.Path] = entry.IsIgnored
	}
	for _, path := range []string{".my-context", ".my-context/docs", ".my-context/docs/brief.md"} {
		if !ignoredByPath[path] {
			t.Fatalf("expected %s to be marked ignored, got %+v", path, entries)
		}
	}

	childEntries, err := svc.List(root, ".my-context", false)
	if err != nil {
		t.Fatalf("list ignored context directory: %v", err)
	}
	if len(childEntries) != 1 || childEntries[0].Path != ".my-context/docs" {
		t.Fatalf("expected ignored context descendants, got %+v", childEntries)
	}
	for _, entry := range childEntries {
		if !entry.IsIgnored {
			t.Fatalf("expected ignored context child %s to be marked ignored, got %+v", entry.Path, entry)
		}
	}
}

func TestFileServiceRecursiveListIgnoredFolderDoesNotInfectSiblings(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	if err := os.MkdirAll(filepath.Join(root, "src", "app"), 0o755); err != nil {
		t.Fatalf("mkdir src/app: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(root, "ignored-dir", "nested"), 0o755); err != nil {
		t.Fatalf("mkdir ignored-dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".gitignore"), []byte("ignored-dir/\n"), 0o644); err != nil {
		t.Fatalf("write gitignore: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "app", "main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "ignored-dir", "nested", "data.bin"), []byte("binary"), 0o644); err != nil {
		t.Fatalf("write ignored file: %v", err)
	}

	entries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list: %v", err)
	}

	ignoredByPath := map[string]bool{}
	for _, entry := range entries {
		ignoredByPath[entry.Path] = entry.IsIgnored
	}

	if !ignoredByPath["ignored-dir/"] && !ignoredByPath["ignored-dir"] {
		t.Fatalf("expected ignored-dir to be marked ignored, got entries: %+v", entries)
	}
	if ignoredByPath["src"] {
		t.Fatalf("expected src (sibling of ignored dir) to NOT be marked ignored, got entries: %+v", entries)
	}
	if ignoredByPath["src/app"] {
		t.Fatalf("expected src/app to NOT be marked ignored, got entries: %+v", entries)
	}
	if ignoredByPath["src/app/main.go"] {
		t.Fatalf("expected src/app/main.go to NOT be marked ignored, got entries: %+v", entries)
	}
	if ignoredByPath[".gitignore"] {
		t.Fatalf("expected .gitignore to NOT be marked ignored, got entries: %+v", entries)
	}
}

func TestFileServiceRecursiveListHidesContextGitMetadata(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(contextDir, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir context git metadata: %v", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, ".git", "config"), []byte("[core]\n"), 0o644); err != nil {
		t.Fatalf("write context git config: %v", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, "notes.md"), []byte("notes"), 0o644); err != nil {
		t.Fatalf("write context note: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}
	paths := map[string]bool{}
	for _, entry := range entries {
		paths[entry.Path] = true
	}
	if !paths[".my-context/notes.md"] {
		t.Fatalf("expected visible context note, got %+v", entries)
	}
	if paths[".my-context/.git"] || paths[".my-context/.git/config"] {
		t.Fatalf("expected context .git metadata to stay hidden, got %+v", entries)
	}
}

func TestFileServiceRecursiveListHidesContextGitFile(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	contextDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(contextDir, ".git"), []byte("gitdir: ../actual.git\n"), 0o644); err != nil {
		t.Fatalf("write context git file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, "notes.md"), []byte("notes"), 0o644); err != nil {
		t.Fatalf("write context note: %v", err)
	}
	if err := os.Symlink(contextDir, filepath.Join(root, ".my-context")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}
	paths := map[string]bool{}
	for _, entry := range entries {
		paths[entry.Path] = true
	}
	if !paths[".my-context/notes.md"] {
		t.Fatalf("expected visible context note, got %+v", entries)
	}
	if paths[".my-context/.git"] {
		t.Fatalf("expected context .git file to stay hidden, got %+v", entries)
	}
}

func TestFileServiceListLeavesUnrelatedDirectorySymlinkFileLike(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewFileService()

	targetDir := t.TempDir()
	if err := os.Symlink(targetDir, filepath.Join(root, "linked-dir")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	entries, err := svc.List(root, "", false)
	if err != nil {
		t.Fatalf("list root: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "linked-dir" || entries[0].IsDir {
		t.Fatalf("expected unrelated directory symlink to stay file-like, got %+v", entries)
	}

	recursiveEntries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}
	entryByPath := map[string]FileEntry{}
	for _, entry := range recursiveEntries {
		entryByPath[entry.Path] = entry
	}
	linkedDir, ok := entryByPath["linked-dir"]
	if !ok || linkedDir.IsDir {
		t.Fatalf("expected unrelated directory symlink to stay file-like recursively, got %+v", recursiveEntries)
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

	entries, err := svc.List(root, "", false)
	if err != nil {
		t.Fatalf("list root: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != ".my-context" || entries[0].IsDir {
		t.Fatalf("expected broken context symlink to fall back to file-like metadata, got %+v", entries)
	}

	recursiveEntries, err := svc.List(root, "", true)
	if err != nil {
		t.Fatalf("recursive list root: %v", err)
	}
	if len(recursiveEntries) != 1 || recursiveEntries[0].Path != ".my-context" || recursiveEntries[0].IsDir {
		t.Fatalf("expected recursive list to preserve broken context symlink, got %+v", recursiveEntries)
	}
}
