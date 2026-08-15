package app

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/tokenusage"
)

// recordingTokenUsage is a tokenusage.Service fake that records startup/shutdown
// calls and probes the local database during those calls, so tests can
// characterize the order of Bootstrap and Close relative to hydration and the
// database handle.
type recordingTokenUsage struct {
	db                  *sql.DB
	scanStarted         int
	closeCalls          int
	closedBeforeDBClose bool
}

func newRecordingTokenUsage(db *sql.DB) *recordingTokenUsage {
	return &recordingTokenUsage{db: db}
}

func (r *recordingTokenUsage) StartStartupScan() {
	r.scanStarted++
}

func (r *recordingTokenUsage) Close() {
	r.closeCalls++
	// Characterize shutdown order: token usage must stop while the database is
	// still open; the app closes the database last.
	if err := r.db.Ping(); err != nil {
		r.closedBeforeDBClose = true
	}
}

func (r *recordingTokenUsage) SyncNow(string)                   {}
func (r *recordingTokenUsage) Trigger(string, string)           {}
func (r *recordingTokenUsage) RequestRecentRecoveryScan(string) {}
func (r *recordingTokenUsage) DebugState() tokenusage.CollectorDebugState {
	return tokenusage.CollectorDebugState{}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := localdb.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := localdb.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	return database
}

// TestBootstrap_StartupSequence characterizes the daemon startup order: the
// account-scoped database is migrated by the process layer, Bootstrap composes
// the service graph, hydrates persisted workspaces, registers filesystem
// watchers for every active one, opens the memory service, and starts the
// token-usage startup scan last.
func TestBootstrap_StartupSequence(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	// A persisted active workspace row: hydration must restore it as an open
	// instance and watch registration must attach a filesystem watcher to it.
	database := openTestDB(t)
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: root, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	dataDir := t.TempDir()
	fake := newRecordingTokenUsage(database)
	app, err := Bootstrap(Config{
		NodeID:           "node-1",
		Database:         database,
		EnvDir:           t.TempDir(),
		DataDir:          dataDir,
		SettingsPath:     "",
		MemorySummarizer: memory.SummarizerConfig{},
		TokenUsage:       fake,
	})
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	defer app.Close()

	// Hydration restored the persisted workspace as an open instance.
	if _, ok := app.registry.Get("ws-1"); !ok {
		t.Fatal("expected hydrated workspace instance after Bootstrap")
	}
	// Watch registration followed hydration (no watcher exists before the
	// explicit watch step — the regression this guards).
	if !app.watchers.IsWatching(root) {
		t.Fatal("expected filesystem watcher registered for hydrated active workspace")
	}
	// Service graph is fully composed.
	if app.memory == nil {
		t.Fatal("expected memory service after Bootstrap")
	}
	if app.computer == nil || app.agentMgr == nil || app.modelList == nil || app.events == nil {
		t.Fatal("expected full service graph after Bootstrap")
	}
	if app.prTracker == nil || app.watchers == nil || app.cleanupStore == nil || app.contextStore == nil {
		t.Fatal("expected full service graph after Bootstrap")
	}
	// The startup scan ran exactly once (background tasks start after hydrate
	// + watch in the startup sequence).
	if fake.scanStarted != 1 {
		t.Fatalf("expected token usage startup scan once, got %d", fake.scanStarted)
	}
	// The memory database lives under the account data dir.
	if _, err := os.Stat(filepath.Join(dataDir, "memory", "memory.db")); err != nil {
		t.Fatalf("expected memory database under account dir: %v", err)
	}
}

// TestAppClose_ShutdownOrder characterizes the daemon shutdown order: the
// event hub subscription, PR tracker, token usage, memory, agent manager, and
// model list stop before the background tasks are canceled, and the local
// database closes last. Close is safe to call twice.
func TestAppClose_ShutdownOrder(t *testing.T) {
	root := evalSymlinks(t, t.TempDir())
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	database := openTestDB(t)
	workspaceStore := localdb.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &localdb.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: "node-1",
		Kind: "worktree", Status: "active", LocalPath: root, State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	fake := newRecordingTokenUsage(database)
	app, err := Bootstrap(Config{
		NodeID:           "node-1",
		Database:         database,
		EnvDir:           t.TempDir(),
		DataDir:          t.TempDir(),
		SettingsPath:     "",
		MemorySummarizer: memory.SummarizerConfig{},
		TokenUsage:       fake,
	})
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	if err := app.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if fake.closeCalls != 1 {
		t.Fatalf("expected token usage closed once, got %d", fake.closeCalls)
	}
	if fake.closedBeforeDBClose {
		t.Fatal("token usage closed after the database was already closed; shutdown order violated")
	}
	// The database handle is closed by Close (it was previously the daemon
	// runtime's final cleanup step).
	if err := database.Ping(); err == nil {
		t.Fatal("expected local database closed after app.Close")
	}
	// Second close must be a no-op (daemon shutdown paths may race).
	if err := app.Close(); err != nil {
		t.Fatalf("second Close: %v", err)
	}
}
