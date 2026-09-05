package memory

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestService_ProjectMemoryStoreAndRead(t *testing.T) {
	workspace := t.TempDir()
	if err := os.Mkdir(filepath.Join(workspace, ".my-context"), 0o755); err != nil {
		t.Fatal(err)
	}
	service := &Service{db: openTestDB(t), taskContexts: make(map[string]TaskContextRef)}

	path, err := service.StoreProjectEntry(workspace, "", "project-1", "locked_decisions", "Use typed capabilities", "2026-09-01")
	if err != nil {
		t.Fatal(err)
	}
	read, err := service.ReadProjectFile(workspace, "", "MEMORY.md")
	if err != nil {
		t.Fatal(err)
	}
	if read.Path != path || !strings.Contains(read.Content, "- 2026-09-01 - Use typed capabilities") {
		t.Fatalf("memory file = %#v", read)
	}
}

func TestAppendProjectMemoryEntryPreservesOtherSections(t *testing.T) {
	content := "# Project Memory\n\n## Decisions\n\n## Durable Discoveries\n\n## Project Notes\n\n- Keep this note\n"
	updated, err := appendProjectMemoryEntry(content, "locked_decisions", "Use typed capabilities", "2026-09-01")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(updated, "## Project Notes\n\n- Keep this note") {
		t.Fatalf("unrelated section was lost:\n%s", updated)
	}
}

func TestService_ProjectMemoryRejectsSymlinkedStoreFile(t *testing.T) {
	workspace := t.TempDir()
	memoryRoot := filepath.Join(workspace, ".my-context")
	if err := os.Mkdir(memoryRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.md")
	if err := os.WriteFile(outside, []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(memoryRoot, memoryFileName)); err != nil {
		t.Fatal(err)
	}
	service := &Service{db: openTestDB(t), taskContexts: make(map[string]TaskContextRef)}
	if _, err := service.StoreProjectEntry(workspace, "", "project-1", "durable_discoveries", "entry", "2026-09-01"); err == nil {
		t.Fatal("symlinked memory store file was accepted")
	}
}

func TestService_ProjectMemoryRejectsEscapingPaths(t *testing.T) {
	workspace := t.TempDir()
	if err := os.Mkdir(filepath.Join(workspace, ".my-context"), 0o755); err != nil {
		t.Fatal(err)
	}
	service := &Service{db: openTestDB(t), taskContexts: make(map[string]TaskContextRef)}

	if _, err := service.ReadProjectFile(workspace, "", "../secret"); err == nil {
		t.Fatal("escaping memory path was accepted")
	}
	if _, err := service.StoreProjectEntry(workspace, filepath.Dir(workspace), "project-1", "durable_discoveries", "entry", "2026-09-01"); err == nil {
		t.Fatal("project root outside workspace was accepted")
	}
}
