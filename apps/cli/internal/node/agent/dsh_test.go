package agent

import (
	"context"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

type recordingDSHSessions struct {
	listCWD    string
	readCWD    string
	resumeCWD  string
	disposeCWD string
	listResult dsh.SessionListResult
	listErr    error
	readErr    error
}

func (r *recordingDSHSessions) ListSessions(_ context.Context, request dsh.SessionListRequest) (dsh.SessionListResult, error) {
	r.listCWD = request.CWD
	return r.listResult, r.listErr
}

func (r *recordingDSHSessions) ReadSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionReadResult, error) {
	r.readCWD = request.CWD
	return dsh.SessionReadResult{}, r.readErr
}

func (r *recordingDSHSessions) ResumeSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionResumeResult, error) {
	r.resumeCWD = request.CWD
	return dsh.SessionResumeResult{SessionID: request.SessionID}, nil
}

func (r *recordingDSHSessions) DisposeSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	r.disposeCWD = request.CWD
	return dsh.SessionDisposeResult{SessionID: request.SessionID, Disposed: true}, nil
}

func TestService_DSHSessionMethodsUseOpenWorkspacePath(t *testing.T) {
	runtime := &recordingDSHSessions{}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace"}, nil
		}),
		DSH: runtime,
	})

	if _, err := service.ListDSHSessions(context.Background(), "workspace-1"); err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if _, err := service.ReadDSHSession(context.Background(), "workspace-1", "session-1"); err != nil {
		t.Fatalf("read session: %v", err)
	}
	if _, err := service.ResumeDSHSession(context.Background(), "workspace-1", "session-1"); err != nil {
		t.Fatalf("resume session: %v", err)
	}

	if runtime.listCWD != "/open/workspace" || runtime.readCWD != "/open/workspace" || runtime.resumeCWD != "/open/workspace" {
		t.Fatalf("DSH calls used cwd list=%q read=%q resume=%q", runtime.listCWD, runtime.readCWD, runtime.resumeCWD)
	}
}

type blockingResumeDSH struct {
	recordingDSHSessions
	started chan struct{}
	release chan struct{}
}

func (r *blockingResumeDSH) ResumeSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionResumeResult, error) {
	close(r.started)
	<-r.release
	return dsh.SessionResumeResult{SessionID: request.SessionID}, nil
}

func TestService_DSHResumeAdmissionBlocksWorkspaceCleanup(t *testing.T) {
	runtime := &blockingResumeDSH{started: make(chan struct{}), release: make(chan struct{})}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace"}, nil
		}),
		DSH: runtime,
	})
	resumeDone := make(chan error, 1)
	go func() {
		_, err := service.ResumeDSHSession(context.Background(), "workspace-1", "session-1")
		resumeDone <- err
	}()
	<-runtime.started
	cleanupDone := make(chan *WorkspaceAgentCleanup, 1)
	go func() {
		handle, _ := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-1")
		cleanupDone <- handle
	}()
	select {
	case <-cleanupDone:
		t.Fatal("workspace cleanup crossed an active DSH resume")
	case <-time.After(20 * time.Millisecond):
	}
	close(runtime.release)
	if err := <-resumeDone; err != nil {
		t.Fatalf("resume: %v", err)
	}
	select {
	case handle := <-cleanupDone:
		service.AbortWorkspaceAgentCleanup(handle)
	case <-time.After(time.Second):
		t.Fatal("workspace cleanup did not continue after resume")
	}
}

type undisposableDSH struct{ recordingDSHSessions }

func (r *undisposableDSH) DisposeSession(_ context.Context, request dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	return dsh.SessionDisposeResult{SessionID: request.SessionID, Disposed: false}, nil
}

func TestService_WorkspaceCleanupRejectsUnownedLiveDSHSession(t *testing.T) {
	runtime := &undisposableDSH{recordingDSHSessions: recordingDSHSessions{
		listResult: dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "session-1", Live: true}}},
	}}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace"}, nil
		}),
		DSH: runtime,
	})
	handle, err := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-1")
	if err == nil {
		t.Fatal("cleanup accepted a live DSH session that could not be disposed")
	}
	service.AbortWorkspaceAgentCleanup(handle)
}

func TestService_WorkspaceCleanupDisposesLiveDSHSessions(t *testing.T) {
	runtime := &recordingDSHSessions{listResult: dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{
		SessionID: "session-1", Live: true, Persisted: true,
	}}}}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/open/workspace"}, nil
		}),
		DSH: runtime,
	})
	handle, err := service.BeginWorkspaceAgentCleanup(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("begin cleanup: %v", err)
	}
	service.AbortWorkspaceAgentCleanup(handle)
	if runtime.disposeCWD != "/open/workspace" {
		t.Fatalf("dispose cwd = %q", runtime.disposeCWD)
	}
}

func TestService_DSHSessionMethodsRejectClosedWorkspaceBeforeRuntimeCall(t *testing.T) {
	runtime := &recordingDSHSessions{}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(string) (workspace.Workspace, error) {
			return workspace.Workspace{}, errors.New("workspace not found")
		}),
		DSH: runtime,
	})

	if _, err := service.ListDSHSessions(context.Background(), "closed-workspace"); err == nil {
		t.Fatal("list sessions succeeded for a closed workspace")
	}
	if _, err := service.ReadDSHSession(context.Background(), "closed-workspace", "session-1"); err == nil {
		t.Fatal("read session succeeded for a closed workspace")
	}
	if _, err := service.ResumeDSHSession(context.Background(), "closed-workspace", "session-1"); err == nil {
		t.Fatal("resume session succeeded for a closed workspace")
	}
	if runtime.listCWD != "" || runtime.readCWD != "" || runtime.resumeCWD != "" {
		t.Fatal("runtime was called for a closed workspace")
	}
}

func (r *recordingDSHSessions) StartSession(_ context.Context, request dsh.SessionStartRequest) (dsh.SessionStartResult, error) {
	return dsh.SessionStartResult{SessionID: request.SessionID, Incarnation: "test-incarnation"}, nil
}
func (r *recordingDSHSessions) PromptSession(context.Context, dsh.SessionPromptRequest) (dsh.SessionPromptResult, error) {
	return dsh.SessionPromptResult{}, nil
}
func (r *recordingDSHSessions) CancelSession(_ context.Context, request dsh.SessionCancelRequest) (dsh.SessionCancelResult, error) {
	return dsh.SessionCancelResult{SessionID: request.SessionID, Cancelled: true}, nil
}
func (r *recordingDSHSessions) SubscribeSession(context.Context, dsh.SessionSubscribeRequest) (dsh.SessionSubscription, error) {
	return dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate), Unsubscribe: func() {}}, nil
}
func (r *recordingDSHSessions) FlushSession(_ context.Context, request dsh.SessionFlushRequest) (dsh.DurableCursor, error) {
	return dsh.DurableCursor{SessionID: request.SessionID}, nil
}
func (r *recordingDSHSessions) Health() dsh.Health { return dsh.Health{IsReady: true} }

func TestAgentInspectionRPC_MapsDSHRuntimeErrorsToStableUnavailableCode(t *testing.T) {
	for _, operation := range []struct {
		name    string
		method  string
		params  map[string]any
		runtime *recordingDSHSessions
	}{
		{"list", rpc.MethodAgentListSessions, map[string]any{"runtime": "dsh", "workspaceId": "workspace", "cwd": "/workspace"}, &recordingDSHSessions{listErr: dsh.ErrRuntimeUnavailable}},
		{"read", rpc.MethodAgentReadHistory, map[string]any{"runtime": "dsh", "sessionId": "session", "workspaceId": "workspace", "cwd": "/workspace"}, &recordingDSHSessions{readErr: dsh.ErrRuntimeUnavailable}},
	} {
		t.Run(operation.name, func(t *testing.T) {
			service := newTestHandler(t)
			service.deps.Workspace = testWorkspaceResolver(func(string) (workspace.Workspace, error) {
				return workspace.Workspace{ID: "workspace", Path: "/workspace"}, nil
			})
			service.deps.DSH = operation.runtime
			_, err := service.callAgentRPCForTest(context.Background(), nil, operation.method, mustMarshalJSON(t, operation.params))
			var rpcErr *rpc.Error
			if !errors.As(err, &rpcErr) || rpcErr.Data["code"] != rpc.ErrorDataCodeDSHRuntimeUnavailable {
				t.Fatalf("RPC error = %#v, want stable DSH runtime-unavailable code", err)
			}
		})
	}
}
