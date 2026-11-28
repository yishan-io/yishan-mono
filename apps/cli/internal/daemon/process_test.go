package daemon

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInitLocalDatabase_CreatesMigratedProfileDatabase(t *testing.T) {
	profileDir := t.TempDir()
	database, err := initLocalDatabase(profileDir, profileDir)
	if err != nil {
		t.Fatalf("initialize local database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	var workspaceTableName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'`).Scan(&workspaceTableName); err != nil {
		t.Fatalf("find workspaces table: %v", err)
	}
	if workspaceTableName != "workspaces" {
		t.Fatalf("expected workspaces table, got %q", workspaceTableName)
	}
	// Projects are daemon-owned again (migration 024 recreates the table).
	var projectsTableName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).Scan(&projectsTableName); err != nil {
		t.Fatalf("find projects table: %v", err)
	}
	if _, err := os.Stat(filepath.Join(profileDir, "yishan.db")); err != nil {
		t.Fatalf("expected profile database: %v", err)
	}
}

func TestBuildMemorySummarizerConfigPreservesLocalDefaults(t *testing.T) {
	cfg := buildMemorySummarizerConfig(RunConfig{MemorySummarizer: true})

	if cfg.DisableProjectMemory {
		t.Fatal("expected local project memory to remain enabled")
	}
	if cfg.DisablePersona {
		t.Fatal("expected local persona to remain enabled")
	}
}
