package workspace

import (
	"bytes"
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

	rpcErr, ok := err.(*RPCError)
	if !ok {
		t.Fatalf("expected RPCError, got %T", err)
	}
	if rpcErr.Code != -32003 {
		t.Fatalf("expected code -32003, got %d", rpcErr.Code)
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
	rpcErr, ok := err.(*RPCError)
	if !ok {
		t.Fatalf("expected RPCError, got %T", err)
	}
	if rpcErr.Code != rpcCodeInvalidParams {
		t.Fatalf("expected invalid params code %d, got %d", rpcCodeInvalidParams, rpcErr.Code)
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
	rpcErr, ok := err.(*RPCError)
	if !ok {
		t.Fatalf("expected RPCError, got %T", err)
	}
	if rpcErr.Code != rpcCodePathRestricted {
		t.Fatalf("expected path restricted code %d, got %d", rpcCodePathRestricted, rpcErr.Code)
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
	rpcErr, ok := err.(*RPCError)
	if !ok {
		t.Fatalf("expected RPCError, got %T", err)
	}
	if rpcErr.Code != rpcCodePathRestricted {
		t.Fatalf("expected path restricted code %d, got %d", rpcCodePathRestricted, rpcErr.Code)
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

	rpcErr, ok := err.(*RPCError)
	if !ok {
		t.Fatalf("expected RPCError, got %T", err)
	}
	if rpcErr.Code != -32003 {
		t.Fatalf("expected code -32003, got %d", rpcErr.Code)
	}

	if _, err := svc.List(root, ".git", false); err == nil {
		t.Fatal("expected listing .git to be rejected")
	}
}

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

func TestFileServiceListUsesCachedDirectoryEntriesUntilInvalidated(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	entries, err := svc.List(root, "", false)
	if err != nil {
		t.Fatalf("initial list: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "a.txt" {
		t.Fatalf("unexpected initial entries: %+v", entries)
	}

	if err := os.WriteFile(filepath.Join(root, "b.txt"), []byte("b"), 0o644); err != nil {
		t.Fatalf("write uncached file: %v", err)
	}

	entries, err = svc.List(root, "", false)
	if err != nil {
		t.Fatalf("cached list: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "a.txt" {
		t.Fatalf("expected cached entries before invalidation, got %+v", entries)
	}

	svc.InvalidateWorkspacePaths(root, []string{"b.txt"})
	entries, err = svc.List(root, "", false)
	if err != nil {
		t.Fatalf("list after invalidation: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected refreshed entries after invalidation, got %+v", entries)
	}
}

func TestFileServiceWriteInvalidatesParentDirectoryCache(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := svc.Mkdir(root, "dir", true, 0); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if _, err := svc.List(root, "dir", false); err != nil {
		t.Fatalf("prime cache: %v", err)
	}

	if _, err := svc.Write(root, "dir/new.txt", "hello", 0); err != nil {
		t.Fatalf("write: %v", err)
	}

	entries, err := svc.List(root, "dir", false)
	if err != nil {
		t.Fatalf("list after write: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "dir/new.txt" {
		t.Fatalf("expected refreshed directory entries after write, got %+v", entries)
	}
}

func TestFileServiceMoveInvalidatesSourceAndDestinationCaches(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := svc.Mkdir(root, "from", true, 0); err != nil {
		t.Fatalf("mkdir from: %v", err)
	}
	if err := svc.Mkdir(root, "to", true, 0); err != nil {
		t.Fatalf("mkdir to: %v", err)
	}
	if _, err := svc.Write(root, "from/item.txt", "hello", 0); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	if _, err := svc.List(root, "from", false); err != nil {
		t.Fatalf("prime from cache: %v", err)
	}
	if _, err := svc.List(root, "to", false); err != nil {
		t.Fatalf("prime to cache: %v", err)
	}

	if err := svc.Move(root, "from/item.txt", "to/item.txt"); err != nil {
		t.Fatalf("move: %v", err)
	}

	fromEntries, err := svc.List(root, "from", false)
	if err != nil {
		t.Fatalf("list from after move: %v", err)
	}
	if len(fromEntries) != 0 {
		t.Fatalf("expected empty source dir after move, got %+v", fromEntries)
	}

	toEntries, err := svc.List(root, "to", false)
	if err != nil {
		t.Fatalf("list to after move: %v", err)
	}
	if len(toEntries) != 1 || toEntries[0].Path != "to/item.txt" {
		t.Fatalf("expected destination file after move, got %+v", toEntries)
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
