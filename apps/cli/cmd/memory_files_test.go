package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/memory"
)

func TestMemoryStoreAndReadCommands(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	projectRoot := newMemoryCommandProject(t)

	storeCommand := newTestTaskCommand("store", runMemoryStore, registerMemoryStoreFlags)
	storeCommand.Flags().Set("project-root", projectRoot)
	storeCommand.Flags().Set("section", "locked_decisions")
	storeCommand.Flags().Set("entry", "Deliver CLI capabilities first. Why: one shared implementation.")
	storeCommand.Flags().Set("date", "2026-11-12")
	captureStdout(t, func() {
		if err := runMemoryStore(storeCommand, nil); err != nil {
			t.Fatalf("runMemoryStore: %v", err)
		}
	})

	appendCommand := newTestTaskCommand("store", runMemoryStore, registerMemoryStoreFlags)
	appendCommand.Flags().Set("project-root", projectRoot)
	appendCommand.Flags().Set("section", "durable_discoveries")
	appendCommand.Flags().Set("date", "2026-11-12")
	appendCommand.Flags().Set("file", "-")
	appendCommand.SetIn(strings.NewReader("[Invariant] 2026-11-12 — notes live with the task.\n"))
	captureStdout(t, func() {
		if err := runMemoryStore(appendCommand, nil); err != nil {
			t.Fatalf("runMemoryStore stdin: %v", err)
		}
	})

	content := readCommandMemoryFile(t, projectRoot)
	assertCommandContains(t, content, "- 2026-11-12 - Deliver CLI capabilities first.")
	assertCommandContains(t, content, "- [Invariant] 2026-11-12 — notes live with the task.")

	readCommand := newTestTaskCommand("read", runMemoryRead, registerMemoryReadFlags)
	readCommand.Flags().Set("project-root", projectRoot)
	printed := captureStdout(t, func() {
		if err := runMemoryRead(readCommand, []string{"MEMORY.md"}); err != nil {
			t.Fatalf("runMemoryRead: %v", err)
		}
	})
	if printed != content {
		t.Fatalf("read printed %q, want %q", printed, content)
	}
}

func TestMemoryCommands_ClassifyFailures(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	projectRoot := newMemoryCommandProject(t)

	missingRead := newTestTaskCommand("read", runMemoryRead, registerMemoryReadFlags)
	missingRead.Flags().Set("project-root", projectRoot)
	err := runMemoryRead(missingRead, []string{"absence.md"})
	if code := ClassifyError(err); code != "not_found" {
		t.Fatalf("missing read code = %q (%v)", code, err)
	}

	escapeRead := newTestTaskCommand("read", runMemoryRead, registerMemoryReadFlags)
	escapeRead.Flags().Set("project-root", projectRoot)
	err = runMemoryRead(escapeRead, []string{"../escape.md"})
	if code := ClassifyError(err); code != "permission_denied" {
		t.Fatalf("escape read code = %q (%v)", code, err)
	}

	invalidDate := newTestTaskCommand("store", runMemoryStore, registerMemoryStoreFlags)
	invalidDate.Flags().Set("project-root", projectRoot)
	invalidDate.Flags().Set("section", "locked_decisions")
	invalidDate.Flags().Set("entry", "entry")
	invalidDate.Flags().Set("date", "11/12/2026")
	err = runMemoryStore(invalidDate, nil)
	if code := ClassifyError(err); code != "validation_error" {
		t.Fatalf("invalid date code = %q (%v)", code, err)
	}

	missingSection := newTestTaskCommand("store", runMemoryStore, registerMemoryStoreFlags)
	missingSection.Flags().Set("project-root", projectRoot)
	missingSection.Flags().Set("entry", "entry")
	if err := runMemoryStore(missingSection, nil); err == nil {
		t.Fatal("expected missing section error")
	}
}

func newMemoryCommandProject(t *testing.T) string {
	t.Helper()
	projectRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(projectRoot, ".my-context"), 0o755); err != nil {
		t.Fatal(err)
	}
	return projectRoot
}

func readCommandMemoryFile(t *testing.T, projectRoot string) string {
	t.Helper()
	memoryRoot, err := memory.ResolveProjectMemoryRoot(projectRoot)
	if err != nil {
		t.Fatalf("ResolveProjectMemoryRoot: %v", err)
	}
	content, err := os.ReadFile(filepath.Join(memoryRoot, "MEMORY.md"))
	if err != nil {
		t.Fatalf("read MEMORY.md: %v", err)
	}
	return string(content)
}

func assertCommandContains(t *testing.T, content string, want string) {
	t.Helper()
	if !strings.Contains(content, want) {
		t.Fatalf("content does not contain %q:\n%s", want, content)
	}
}
