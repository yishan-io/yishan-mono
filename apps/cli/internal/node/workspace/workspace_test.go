package workspace

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
)

func (p *tokenUsageRecoveryProbe) StartStartupScan()   {}
func (p *tokenUsageRecoveryProbe) SyncNow(_ string)    {}
func (p *tokenUsageRecoveryProbe) Trigger(_, _ string) {}
func (p *tokenUsageRecoveryProbe) Close()              {}
func (p *tokenUsageRecoveryProbe) DebugState() tokenusage.CollectorDebugState {
	return tokenusage.CollectorDebugState{}
}
func (p *tokenUsageRecoveryProbe) RequestRecentRecoveryScan(_ string) {
	now := time.Now().UTC().UnixMilli()
	for agentKind := range p.inFlight {
		p.recoverySinceByAgent[agentKind] = now
		if p.inFlight[agentKind] {
			p.needsRerun[agentKind] = true
		}
	}
}

func installTokenUsageRecoveryProbe(t *testing.T, services *Service) (string, *tokenUsageRecoveryProbe) {
	t.Helper()
	collector := &tokenUsageRecoveryProbe{
		recoverySinceByAgent: make(map[string]int64),
		needsRerun:           make(map[string]bool),
		inFlight:             map[string]bool{"recovery-probe": true},
	}
	services.deps.TokenUsage = collector
	return "recovery-probe", collector
}

// TestHandleWorkspaceOpenProject_Success verifies that a valid, previously
// unknown workspace is opened, indexed, and returned in the opened list.
func newCloseRoutingTestHandler(t *testing.T, workspaceNodeID string) *Service {
	t.Helper()
	s := newTestHandler(t)
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := sqlite.NewWorkspaceStore(database).Create(context.Background(), &sqlite.Workspace{
		ID: "ws-1", OrganizationID: "org-1", ProjectID: "project-1", NodeID: workspaceNodeID,
		Kind: string(workspace.KindWorktree), Status: "active", LocalPath: "/tmp/ws", State: "active",
	}); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	s.setTestDatabase(database)
	// Keep the close-routing test fast: the token-usage scan on close is
	// incidental to the routing decision under test.
	s.deps.TokenUsage = nil
	return s
}

func initDispatchWorkspaceTestGitRepoWithCommit(t *testing.T, root string) {
	t.Helper()
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("mkdir repo root: %v", err)
	}
	runDispatchWorkspaceTestGitCmd(t, root, "init", "-b", "main")
	runDispatchWorkspaceTestGitCmd(t, root, "config", "user.name", "Test")
	runDispatchWorkspaceTestGitCmd(t, root, "config", "user.email", "test@example.com")
	seedFile := filepath.Join(root, "seed.txt")
	if err := os.WriteFile(seedFile, []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runDispatchWorkspaceTestGitCmd(t, root, "add", "seed.txt")
	runDispatchWorkspaceTestGitCmd(t, root, "commit", "-m", "initial commit")
}

func runDispatchWorkspaceTestGitCmd(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, string(out))
	}
}
