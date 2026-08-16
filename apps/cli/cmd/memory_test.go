package cmd

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/platform/config"
	localdb "yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/memory"
)

func TestOpenMemoryForSearchUsesAccountMemoryDirectory(t *testing.T) {
	profileDir := t.TempDir()
	originalConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(profileDir, "credential.yaml")
	defer func() {
		appConfig.ConfigPath = originalConfigPath
	}()

	dbPath := filepath.Join(profileDir, "memory", "memory.db")
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

func TestOpenMemoryForSearchUsesAccountDirWhenUserIDPresent(t *testing.T) {
	profileDir := t.TempDir()
	originalConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(profileDir, "credential.yaml")
	defer func() {
		appConfig.ConfigPath = originalConfigPath
	}()

	seedTestCredential(t, filepath.Join(profileDir, "credential.yaml"), "user_123")

	accountDir := filepath.Join(profileDir, "accounts", "user_123")
	dbPath := filepath.Join(accountDir, "memory", "memory.db")
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

func TestResolveMemoryDBPath_FallsBackToEnvRootWithoutUserID(t *testing.T) {
	profileDir := t.TempDir()
	originalConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(profileDir, "credential.yaml")
	defer func() {
		appConfig.ConfigPath = originalConfigPath
	}()

	got, err := resolveMemoryDBPath()
	if err != nil {
		t.Fatalf("resolveMemoryDBPath: %v", err)
	}
	want := filepath.Join(profileDir, "memory", "memory.db")
	if got != want {
		t.Fatalf("resolveMemoryDBPath = %q, want %q", got, want)
	}
}

func TestReadProfileWorkspaceRefs_OpensAccountDB(t *testing.T) {
	profileDir := t.TempDir()
	originalConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(profileDir, "credential.yaml")
	defer func() {
		appConfig.ConfigPath = originalConfigPath
	}()

	seedTestCredential(t, filepath.Join(profileDir, "credential.yaml"), "user_123")

	// Seed the account-scoped workspace DB with one workspace.
	accountDir := filepath.Join(profileDir, "accounts", "user_123")
	database, err := openTestWorkspaceDB(accountDir)
	if err != nil {
		t.Fatalf("open test workspace db: %v", err)
	}
	database.Close()

	refs, err := readProfileWorkspaceRefs()
	if err != nil {
		t.Fatalf("readProfileWorkspaceRefs: %v", err)
	}
	found := false
	for _, ref := range refs {
		if ref.ProjectID == "project-1" && ref.WorktreePath == "/tmp/worktree-1" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected workspace ref from account db, got %#v", refs)
	}

	// The env-root DB (empty after migration) must not be read.
	if _, err := os.Stat(filepath.Join(profileDir, "yishan.db")); !os.IsNotExist(err) {
		t.Fatal("expected no env-root yishan.db to be consulted")
	}
}

func seedTestCredential(t *testing.T, configPath string, userID string) {
	t.Helper()
	if err := config.UpdateFile(configPath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyUserID, userID)
	}); err != nil {
		t.Fatalf("seed credential: %v", err)
	}
}

func openTestWorkspaceDB(dir string) (*sql.DB, error) {
	database, err := localdb.Open(dir)
	if err != nil {
		return nil, err
	}
	if err := localdb.Migrate(database); err != nil {
		database.Close()
		return nil, err
	}
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: "/tmp/worktree-1", State: "active",
	}); err != nil {
		database.Close()
		return nil, err
	}
	return database, nil
}
