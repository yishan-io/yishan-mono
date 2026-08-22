package localtask

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadLegacyTaskMetadata_ReadsCompletionDate(t *testing.T) {
	taskPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(taskPath, "task.md"), []byte("## Goal\n\nFinish work.\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(taskPath, "outcome.md"), []byte("**Completed:** 2026-08-24\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	description, completedAt, err := readLegacyTaskMetadata(taskPath, string(StatusCompleted))
	if err != nil || description != "Finish work." || completedAt == nil || *completedAt != "2026-08-24" {
		t.Fatalf("metadata = (%q, %#v, %v)", description, completedAt, err)
	}
}
