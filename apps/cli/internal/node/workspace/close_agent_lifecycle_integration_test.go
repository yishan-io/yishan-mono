package workspace

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/rpc"
	workspaceDomain "yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func TestCloseLifecycle_StopsOnlyMatchingRealAgentSession(t *testing.T) {
	installCleanupLifecyclePi(t)
	for _, closeWorkspace := range closeLifecycleCases() {
		t.Run(closeWorkspace.name, func(t *testing.T) {
			svc, agents := newTestServiceWithAgent(t, nil, "node-1")
			wireRealAgentCleanup(svc, agents)
			defer agents.Shutdown()

			matchingPath := t.TempDir()
			unrelatedPath := t.TempDir()
			openLocalWorkspace(t, svc, "matching", matchingPath)
			openLocalWorkspace(t, svc, "unrelated", unrelatedPath)
			startLifecycleAgent(t, agents, "matching-session", "matching", matchingPath)
			startLifecycleAgent(t, agents, "unrelated-session", "unrelated", unrelatedPath)

			if err := closeWorkspace.close(svc, matchingPath); err != nil {
				t.Fatalf("close workspace: %v", err)
			}
			assertLifecycleAgentStopped(t, agents, "matching-session", "matching", matchingPath)
			assertLifecycleAgentLive(t, agents, "unrelated-session", "unrelated", unrelatedPath)
		})
	}
}

type closeLifecycleCase struct {
	name  string
	close func(*Service, string) error
}

func closeLifecycleCases() []closeLifecycleCase {
	return []closeLifecycleCase{
		{name: "direct", close: closeDirectLifecycleWorkspace},
		{name: "executor_relay", close: closeRelayedLifecycleWorkspace},
		{name: "retry", close: closeRetryLifecycleWorkspace},
	}
}

func closeDirectLifecycleWorkspace(svc *Service, _ string) error {
	_, err := svc.CloseLocal(context.Background(), workspaceDomain.CloseRequest{WorkspaceID: "matching"})
	return err
}

func closeRelayedLifecycleWorkspace(svc *Service, _ string) error {
	svc.handleRelayedClose(relayWorkspaceCloseEnvelope{
		WorkspaceID: "matching", TargetNodeID: "node-1", Change: relayChangeWorkspaceCloseRequest,
	})
	_, err := svc.GetWorkspace("matching")
	if err == nil {
		return errors.New("executor relay close retained workspace")
	}
	return nil
}

func closeRetryLifecycleWorkspace(svc *Service, path string) error {
	if err := svc.RetryClose(context.Background(), application.CleanupRequest{WorkspaceID: "matching", Path: path}); err != nil {
		return err
	}
	_, err := svc.GetWorkspace("matching")
	if err == nil {
		return errors.New("retry close retained workspace runtime")
	}
	return nil
}

func wireRealAgentCleanup(svc *Service, agents *nodeagent.Service) {
	svc.SetAgentCleanupLifecycle(
		func(ctx context.Context, workspaceID string) (any, error) {
			return agents.BeginWorkspaceAgentCleanup(ctx, workspaceID)
		},
		func(handle any) { agents.AbortWorkspaceAgentCleanup(handle.(*nodeagent.WorkspaceAgentCleanup)) },
		func(handle any) { agents.CommitWorkspaceAgentCleanup(handle.(*nodeagent.WorkspaceAgentCleanup)) },
	)
}

func startLifecycleAgent(t *testing.T, agents *nodeagent.Service, sessionID string, workspaceID string, path string) {
	t.Helper()
	_, err := agents.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{
		SessionID: sessionID, TabID: sessionID, WorkspaceID: workspaceID, CWD: path,
	})
	if err != nil {
		t.Fatalf("start %s: %v", sessionID, err)
	}
}

func assertLifecycleAgentStopped(t *testing.T, agents *nodeagent.Service, sessionID string, workspaceID string, path string) {
	t.Helper()
	_, err := agents.Attach(context.Background(), &rpc.Connection{}, rpc.PiAttachParams{
		SessionID: sessionID, TabID: sessionID, WorkspaceID: workspaceID, CWD: path,
	})
	if err == nil {
		t.Fatalf("matching agent %q remains attachable after close", sessionID)
	}
}

func assertLifecycleAgentLive(t *testing.T, agents *nodeagent.Service, sessionID string, workspaceID string, path string) {
	t.Helper()
	_, err := agents.Attach(context.Background(), &rpc.Connection{}, rpc.PiAttachParams{
		SessionID: sessionID, TabID: sessionID, WorkspaceID: workspaceID, CWD: path,
	})
	if err != nil {
		t.Fatalf("unrelated agent %q was stopped: %v", sessionID, err)
	}
}

func installCleanupLifecyclePi(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	piPath := filepath.Join(binDir, "pi")
	if err := os.WriteFile(piPath, []byte("#!/bin/sh\nexec sleep 30\n"), 0o755); err != nil {
		t.Fatalf("write fake pi: %v", err)
	}
	t.Setenv("PATH", fmt.Sprintf("%s%c%s", binDir, os.PathListSeparator, os.Getenv("PATH")))
}
