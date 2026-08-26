package agent

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestService_AgentCommandsRejectWhenWorkspaceCleanupAdmissionCloses(t *testing.T) {
	for _, operation := range []struct {
		name string
		call func(*Service, string) error
	}{
		{name: "prompt", call: callOwnedPrompt},
		{name: "abort", call: callOwnedAbort},
	} {
		t.Run(operation.name, func(t *testing.T) {
			service, workspacePath := startCleanupRaceSession(t)
			markerInstalled := make(chan struct{})
			allowCleanup := make(chan struct{})
			service.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() {
				close(markerInstalled)
				<-allowCleanup
			})
			cleanupDone := make(chan error, 1)
			go func() {
				_, err := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-a")
				cleanupDone <- err
			}()
			<-markerInstalled

			if err := operation.call(service, workspacePath); err == nil {
				t.Fatal("agent command succeeded after cleanup admission closed")
			} else {
				assertRPCErrorCode(t, err, rpc.CodeNotFound)
			}
			assertNoPiCommand(t, filepath.Join(workspacePath, "command"))

			close(allowCleanup)
			if err := <-cleanupDone; err != nil {
				t.Fatalf("BeginWorkspaceAgentCleanup: %v", err)
			}
		})
	}
}

func startCleanupRaceSession(t *testing.T) (*Service, string) {
	t.Helper()
	installWorkspaceRecordingPiBinary(t)
	workspacePath := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspacePath, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	service := newTestHandler(t)
	service.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: workspacePath}, nil
	})
	startReplacementRaceSession(t, service, "same-id", "workspace-a", workspacePath)
	t.Cleanup(func() { service.deps.AgentMgr.StopAll() })
	return service, workspacePath
}

func assertNoPiCommand(t *testing.T, commandPath string) {
	t.Helper()
	if _, err := os.Stat(commandPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("command sent after cleanup admission closed: %v", err)
	}
}

type workspaceCleanupResult struct {
	handle *WorkspaceAgentCleanup
	err    error
}

func TestService_AgentNeutralCommandsHoldAdmissionUntilSend(t *testing.T) {
	for _, operation := range []struct {
		name string
		call func(*Service, string) error
	}{
		{name: "prompt", call: callOwnedPrompt},
		{name: "abort", call: callOwnedAbort},
	} {
		t.Run(operation.name, func(t *testing.T) {
			assertNeutralCommandDelaysWorkspaceCleanup(t, operation.call)
		})
	}
}

func assertNeutralCommandDelaysWorkspaceCleanup(t *testing.T, call func(*Service, string) error) {
	t.Helper()
	service, workspacePath := startCleanupRaceSession(t)
	bound := make(chan struct{})
	allowSend := make(chan struct{})
	service.afterOwnedProcess = func() { close(bound); <-allowSend }
	commandDone := make(chan error, 1)
	go func() { commandDone <- call(service, workspacePath) }()
	<-bound

	markerInstalled := make(chan struct{})
	service.piSessions.SetAfterWorkspaceCleanupMarkerInstalledForTest(func() { close(markerInstalled) })
	claimsReady := make(chan struct{})
	allowClaims := make(chan struct{})
	service.afterWorkspaceClaims = func() { close(claimsReady); <-allowClaims }
	cleanupDone := make(chan workspaceCleanupResult, 1)
	go func() {
		handle, err := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-a")
		cleanupDone <- workspaceCleanupResult{handle: handle, err: err}
	}()
	<-markerInstalled
	assertCleanupWaitsForNeutralCommand(t, claimsReady)

	close(allowSend)
	if err := <-commandDone; err != nil {
		t.Fatalf("agent neutral command: %v", err)
	}
	<-claimsReady
	close(allowClaims)
	cleanup := <-cleanupDone
	if cleanup.err != nil || !cleanup.handle.IsOwner() {
		t.Fatalf("cleanup = (%#v, %v), want owner success", cleanup.handle, cleanup.err)
	}
	service.CommitWorkspaceAgentCleanup(cleanup.handle)
}

func assertCleanupWaitsForNeutralCommand(t *testing.T, claimsReady <-chan struct{}) {
	t.Helper()
	select {
	case <-claimsReady:
		t.Fatal("cleanup passed admission before neutral send")
	case <-time.After(100 * time.Millisecond):
	}
}
