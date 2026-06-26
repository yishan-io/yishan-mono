package cmd

import (
	"path/filepath"
	"testing"

	"github.com/spf13/viper"

	"yishan/apps/cli/internal/memory"
)

func TestOpenMemoryForSearchUsesProfileMemoryDirectory(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	originalProfile := viper.GetString("profile")
	viper.Set("profile", "test-profile")
	defer viper.Set("profile", originalProfile)

	dbPath := filepath.Join(homeDir, ".yishan", "profiles", "test-profile", "memory", "memory.db")
	db, err := memory.OpenDB(dbPath)
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	searchDB, err := openMemoryForSearch()
	if err != nil {
		t.Fatalf("openMemoryForSearch: %v", err)
	}
	defer searchDB.Close()

	if searchDB.Path() != dbPath {
		t.Fatalf("expected search DB path %q, got %q", dbPath, searchDB.Path())
	}
}
