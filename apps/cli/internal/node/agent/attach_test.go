package agent

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
)

func TestPiAttach_RejectsMismatchedWorkspaceWithoutMutatingOwnership(t *testing.T) {
	t.Run("preserves canonical ownership", testPiAttachMismatchedWorkspace)
}

func testPiAttachMismatchedWorkspace(t *testing.T) {
	s, originalConn, cwd := startPiForAttachTest(t)
	defer stopPiForAttachTest(t, s, originalConn, "session-attach")

	_, err := s.callAgentRPCForTest(context.Background(), &rpc.Connection{}, rpc.MethodPiAttach, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-attach", "tabId": "tab-reopened", "workspaceId": "workspace-2",
		"cwd": filepath.Join(filepath.Dir(cwd), "pi-project-reopened"),
	}))
	if err == nil {
		t.Fatal("expected attach with a mismatched workspace to be rejected")
	}
	assertPiAttachOwnership(t, s, originalConn)
}

func TestPiAttach_RejectsStaleRegistrySessionAfterManagerExit(t *testing.T) {
	s, originalConn, _ := startPiForAttachTest(t)
	proc, exists := s.deps.AgentMgr.Session("session-attach")
	if !exists {
		t.Fatal("expected started manager session")
	}
	if err := proc.Close(); err != nil {
		t.Fatal(err)
	}
	waitForManagerSessionExit(t, s, "session-attach")

	_, err := s.Attach(context.Background(), &rpc.Connection{}, rpc.PiAttachParams{SessionID: "session-attach", TabID: "stale"})
	if err == nil {
		t.Fatal("expected attach to reject stale registry metadata")
	}
	assertPiAttachOwnership(t, s, originalConn)
}

func waitForManagerSessionExit(t *testing.T, s *Service, sessionID string) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		if _, exists := s.deps.AgentMgr.Session(sessionID); !exists {
			return
		}
		select {
		case <-deadline:
			t.Fatal("manager retained exited session")
		case <-time.After(time.Millisecond):
		}
	}
}

func startPiForAttachTest(t *testing.T) (*Service, *rpc.Connection, string) {
	t.Helper()
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	installBlockingFakePiBinary(t)
	cwd := filepath.Join(homeDir, "worktrees", "pi-project")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir cwd: %v", err)
	}
	s := newTestHandler(t)
	conn := &rpc.Connection{}
	_, err := s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStart, mustMarshalJSON(t, map[string]any{
		"sessionId": "session-attach", "tabId": "tab-attach", "workspaceId": "workspace-1", "cwd": cwd,
	}))
	if err != nil {
		t.Fatalf("dispatchPi start: %v", err)
	}
	return s, conn, cwd
}

func stopPiForAttachTest(t *testing.T, s *Service, conn *rpc.Connection, sessionID string) {
	t.Helper()
	_, _ = s.callAgentRPCForTest(context.Background(), conn, rpc.MethodPiStop, mustMarshalJSON(t, map[string]any{"sessionId": sessionID}))
}

func assertPiAttachOwnership(t *testing.T, s *Service, conn *rpc.Connection) {
	t.Helper()
	state, _ := s.piSessions.Get("session-attach")
	if state == nil {
		t.Fatal("expected pi session state to exist after rejected attach")
	}
	if state.Conn != conn || state.TabID != "tab-attach" || state.WorkspaceID != "workspace-1" {
		t.Fatalf("rejected attach mutated canonical state: %#v", state)
	}
}
