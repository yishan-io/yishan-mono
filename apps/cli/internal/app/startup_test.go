package app

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/memory"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/tokenusage/collection"
	"yishan/apps/cli/internal/workspace"
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
func (r *recordingTokenUsage) DebugState() collection.DebugState {
	return collection.DebugState{}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := sqlite.Migrate(database); err != nil {
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
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
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
	workspaceStore := sqlite.NewWorkspaceStore(database)
	if err := workspaceStore.Create(context.Background(), &sqlite.Workspace{
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

func TestBootstrap_DSHEnabledFailsClosedWithoutRuntimeCommand(t *testing.T) {
	database := openTestDB(t)
	_, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(), DSHEnabled: true,
	})
	if err == nil {
		t.Fatal("Bootstrap succeeded without a DSH runtime command")
	}
}

func TestBootstrap_DSHValidatesInitializeBeforeStartingCommand(t *testing.T) {
	database := openTestDB(t)
	commandCalled := false
	_, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(), DSHEnabled: true,
		DSHCommand: func(context.Context) (*exec.Cmd, error) {
			commandCalled = true
			return &exec.Cmd{}, nil
		},
	})
	if err == nil {
		t.Fatal("Bootstrap succeeded without DSH initialize settings")
	}
	if commandCalled {
		t.Fatal("DSH command was built before initialize validation")
	}
}

func TestBootstrap_WiresWorkspaceAgentCleanupLifecycle(t *testing.T) {
	database := openTestDB(t)
	app, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(), SettingsPath: "",
	})
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	defer app.Close()

	if app.agentSvc == nil || app.workspaceSvc == nil {
		t.Fatal("Bootstrap did not compose agent and workspace services")
	}
	installBootstrapTestPi(t)
	workspacePath := t.TempDir()
	app.registry.Open(workspace.Workspace{ID: "workspace-1", Path: workspacePath})
	unrelatedPath := t.TempDir()
	app.registry.Open(workspace.Workspace{ID: "workspace-2", Path: unrelatedPath})
	if _, err := app.agentSvc.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{
		SessionID: "agent-1", TabID: "tab-1", WorkspaceID: "workspace-1", CWD: workspacePath,
	}); err != nil {
		t.Fatalf("start matching agent through composed service: %v", err)
	}
	if _, err := app.agentSvc.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{
		SessionID: "agent-2", TabID: "tab-2", WorkspaceID: "workspace-2", CWD: unrelatedPath,
	}); err != nil {
		t.Fatalf("start unrelated agent through composed service: %v", err)
	}
	result, err := app.workspaceSvc.CloseLocal(context.Background(), workspace.CloseRequest{
		WorkspaceID: "workspace-1",
	})
	if err != nil || !result.WorktreeRemoved {
		t.Fatalf("real agent cleanup close = (%#v, %v), want removed worktree", result, err)
	}
	if _, exists := app.agentMgr.Session("agent-1"); exists {
		t.Fatal("workspace close did not stop the matching agent")
	}
	if _, exists := app.agentMgr.Session("agent-2"); !exists {
		t.Fatal("workspace close stopped the unrelated agent")
	}
}

func installBootstrapTestPi(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	piPath := filepath.Join(binDir, "pi")
	if err := os.WriteFile(piPath, []byte("#!/bin/sh\nwhile :; do sleep 1; done\n"), 0o755); err != nil {
		t.Fatalf("write test pi: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}
