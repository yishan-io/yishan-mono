package cmd

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/platform/config"
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

type testTaskContextPaths struct {
	profileDir string
	planPath   string
	taskRoot   string
}

func TestOpenAndReconcileMemoryDB_MigratesEmptyProfileDatabase(t *testing.T) {
	profileDir := t.TempDir()
	originalConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(profileDir, "credential.yaml")
	defer func() { appConfig.ConfigPath = originalConfigPath }()

	database, err := sqlite.Open(profileDir)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}

	memoryDB, err := openAndReconcileMemoryDB()
	if err != nil {
		t.Fatalf("openAndReconcileMemoryDB: %v", err)
	}
	if err := memoryDB.Close(); err != nil {
		t.Fatal(err)
	}

	database, err = sqlite.OpenReadOnly(profileDir)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	var tableName string
	if err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_tasks'`).Scan(&tableName); err != nil {
		t.Fatalf("local_tasks migration was not applied: %v", err)
	}
}

func TestOpenAndReconcileMemoryDB_PreservesAuthoritativeTaskContexts(t *testing.T) {
	paths := setupCommandTaskContext(t)
	originalConfigPath := appConfig.ConfigPath
	appConfig.ConfigPath = filepath.Join(paths.profileDir, "credential.yaml")
	defer func() { appConfig.ConfigPath = originalConfigPath }()
	canonicalPlanPath, err := filepath.EvalSymlinks(paths.planPath)
	if err != nil {
		t.Fatal(err)
	}
	daemonRowID := seedDaemonTaskContext(t, paths, canonicalPlanPath)
	for range 2 {
		db, err := openAndReconcileMemoryDB()
		if err != nil {
			t.Fatal(err)
		}
		results, err := db.SearchMemory(memory.SearchInput{Query: "quartz", Limit: 10})
		if err != nil || len(results) != 1 || results[0].TaskID != "task-1" || results[0].Path != canonicalPlanPath {
			t.Fatalf("task context after reconcile = %#v, %v", results, err)
		}
		indexed, found, err := db.GetByPath(canonicalPlanPath)
		if err != nil || !found || indexed.ID != daemonRowID {
			t.Fatalf("daemon task-context row was replaced or deleted: found=%t id=%d err=%v", found, indexed.ID, err)
		}
		if err := db.Close(); err != nil {
			t.Fatal(err)
		}
	}
}

func setupCommandTaskContext(t *testing.T) testTaskContextPaths {
	t.Helper()
	profileDir := t.TempDir()
	worktree := t.TempDir()
	contextRoot := filepath.Join(t.TempDir(), "project-context")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(contextRoot, filepath.Join(worktree, ".my-context")); err != nil {
		t.Fatal(err)
	}
	taskRoot := filepath.Join(contextRoot, "task-context", "task-1")
	planPath := filepath.Join(taskRoot, "plan.md")
	if err := os.MkdirAll(taskRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(planPath, []byte("authoritative reconcile quartz"), 0o644); err != nil {
		t.Fatal(err)
	}
	seedProfileTaskContext(t, profileDir, worktree)
	return testTaskContextPaths{profileDir: profileDir, planPath: planPath, taskRoot: taskRoot}
}

func seedDaemonTaskContext(t *testing.T, paths testTaskContextPaths, canonicalPlanPath string) int64 {
	t.Helper()
	memoryPath := filepath.Join(paths.profileDir, "memory", "memory.db")
	daemonDB, err := memory.OpenDB(memoryPath)
	if err != nil {
		t.Fatal(err)
	}
	canonicalTaskRoot, err := filepath.EvalSymlinks(paths.taskRoot)
	if err != nil {
		t.Fatal(err)
	}
	ref := memory.TaskContextRef{Directory: canonicalTaskRoot, TaskID: "task-1",
		TaskTitle: "CLI reconcile", ProjectID: "project-1"}
	if _, err := daemonDB.ReconcileWithTaskContexts(nil, "", []memory.TaskContextRef{ref}); err != nil {
		t.Fatal(err)
	}
	indexed, found, err := daemonDB.GetByPath(canonicalPlanPath)
	if err != nil || !found {
		t.Fatalf("seed daemon task context: found=%t err=%v", found, err)
	}
	if err := daemonDB.Close(); err != nil {
		t.Fatal(err)
	}
	return indexed.ID
}

func seedProfileTaskContext(t *testing.T, profileDir string, worktree string) {
	t.Helper()
	database, err := sqlite.Open(profileDir)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := sqlite.Migrate(database); err != nil {
		t.Fatal(err)
	}
	if err := sqlite.NewWorkspaceStore(database).Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: worktree, State: "active",
	}); err != nil {
		t.Fatal(err)
	}
	projectID := "project-1"
	_, err = sqlite.NewLocalTaskStore(database).Create(context.Background(), localtask.Task{
		ID: "task-1", ProjectID: &projectID, Title: "CLI reconcile",
		Status: localtask.StatusActive, Priority: localtask.PriorityMedium,
	})
	if err != nil {
		t.Fatal(err)
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
	database, err := sqlite.Open(dir)
	if err != nil {
		return nil, err
	}
	if err := sqlite.Migrate(database); err != nil {
		database.Close()
		return nil, err
	}
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
		ID: "workspace-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: "/tmp/worktree-1", State: "active",
	}); err != nil {
		database.Close()
		return nil, err
	}
	return database, nil
}
