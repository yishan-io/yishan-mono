package agent

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestDSHExecution_PromptAbortDisposeAdmissionsBlockWorkspaceCleanup(t *testing.T) {
	testCases := []struct {
		name      string
		configure func(*executionDSH, *dshExecutionBarrier)
		call      func(*Service) error
	}{
		{name: "prompt", configure: func(runtime *executionDSH, barrier *dshExecutionBarrier) { runtime.promptBarrier = barrier }, call: func(service *Service) error {
			_, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"hello"`)})
			return err
		}},
		{name: "abort", configure: func(runtime *executionDSH, barrier *dshExecutionBarrier) { runtime.cancelBarrier = barrier }, call: func(service *Service) error {
			_, err := service.AgentAbort(context.Background(), rpc.AgentAbortParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative"})
			return err
		}},
		{name: "dispose", configure: func(runtime *executionDSH, barrier *dshExecutionBarrier) { runtime.disposeBarrier = barrier }, call: func(service *Service) error {
			_, err := service.AgentDispose(context.Background(), rpc.AgentDisposeParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative"})
			return err
		}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			runtime := &executionDSH{}
			service := newDSHExecutionService(runtime)
			startDSHExecution(t, service)
			barrier := &dshExecutionBarrier{started: make(chan struct{}), release: make(chan struct{})}
			testCase.configure(runtime, barrier)
			callDone := make(chan error, 1)
			go func() { callDone <- testCase.call(service) }()
			<-barrier.started
			cleanupDone := make(chan *WorkspaceAgentCleanup, 1)
			go func() {
				handle, _ := service.BeginWorkspaceAgentCleanup(context.Background(), "w")
				cleanupDone <- handle
			}()
			select {
			case <-cleanupDone:
				t.Fatal("workspace cleanup crossed active DSH operation")
			case <-time.After(20 * time.Millisecond):
			}
			close(barrier.release)
			if err := <-callDone; err != nil {
				t.Fatalf("DSH operation: %v", err)
			}
			select {
			case handle := <-cleanupDone:
				service.AbortWorkspaceAgentCleanup(handle)
			case <-time.After(time.Second):
				t.Fatal("workspace cleanup did not continue after DSH operation")
			}
		})
	}
}

func TestDSHExecution_RetryStartCollisionRetainsQuarantinedIdentity(t *testing.T) {
	runtime := &executionDSH{subscribeErr: errors.New("subscribe failed"), isUndisposable: true}
	service := newDSHExecutionService(runtime)
	req := rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"}
	if _, err := service.AgentStart(context.Background(), nil, req); err == nil {
		t.Fatal("initial start succeeded despite subscribe failure")
	}

	runtime.mu.Lock()
	runtime.subscribeErr = nil
	runtime.startErrors = []error{errors.New("session collision")}
	runtime.mu.Unlock()
	if _, err := service.AgentStart(context.Background(), nil, req); err == nil {
		t.Fatal("retry start succeeded despite DSH collision")
	}

	if claim, err := service.runtimeIdentities.claim(req.SessionID, rpc.AgentRuntimePi); err != nil || !claim.isFresh {
		t.Fatalf("Pi claim after DSH retry = %#v, %v", claim, err)
	}
}

func TestDSHExecution_QuarantinedRetrySerializesOnlyDSHStart(t *testing.T) {
	runtime := &executionDSH{subscribeErr: errors.New("subscribe failed"), isUndisposable: true}
	service := newDSHExecutionService(runtime)
	req := rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"}
	if _, err := service.AgentStart(context.Background(), nil, req); err == nil {
		t.Fatal("initial start succeeded despite subscribe failure")
	}

	startStarted := make(chan struct{})
	startRelease := make(chan struct{})
	runtime.mu.Lock()
	runtime.subscribeErr = nil
	runtime.startErrors = []error{errors.New("session collision")}
	runtime.startStarted = startStarted
	runtime.startRelease = startRelease
	runtime.mu.Unlock()
	retryDone := make(chan error, 1)
	go func() {
		_, err := service.AgentStart(context.Background(), nil, req)
		retryDone <- err
	}()
	<-startStarted
	if _, err := service.runtimeIdentities.acquireDSHStart(req.SessionID); err == nil {
		t.Fatal("concurrent DSH start acquired the identity")
	}
	close(startRelease)
	if err := <-retryDone; err == nil {
		t.Fatal("retry start succeeded despite DSH collision")
	}
	if claim, err := service.runtimeIdentities.claim(req.SessionID, rpc.AgentRuntimePi); err != nil || !claim.isFresh {
		t.Fatalf("Pi claim after DSH retry = %#v, %v", claim, err)
	}
}

func TestDSHExecution_WorkspaceCleanupRetainsRegisteredUndisposedSession(t *testing.T) {
	runtime := &executionDSH{isUndisposable: true}
	service := newDSHExecutionService(runtime)
	startDSHExecution(t, service)
	if err := service.stopDSHWorkspaceSessions(context.Background(), "w"); err == nil {
		t.Fatal("cleanup accepted Disposed:false")
	}
	if !service.dshSessions.has("s") {
		t.Fatal("cleanup removed undisposed DSH session")
	}
	if _, err := service.runtimeIdentities.acquireDSHStart("s"); err == nil {
		t.Fatal("cleanup released identity for undisposed DSH session")
	}
}

func TestDSHExecution_ListedCleanupReleasesQuarantinedIdentityOnlyAfterDisposal(t *testing.T) {
	runtime := &executionDSH{subscribeErr: errors.New("subscribe failed"), isUndisposable: true}
	service := newDSHExecutionService(runtime)
	_, _ = service.AgentStart(context.Background(), nil, rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"})
	runtime.subscribeErr, runtime.isUndisposable = nil, false
	runtime.listResult = dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "s", Live: true}}}
	if err := service.stopDSHWorkspaceSessions(context.Background(), "w"); err != nil {
		t.Fatalf("listed cleanup: %v", err)
	}
	if claim, err := service.runtimeIdentities.claim("s", rpc.AgentRuntimeDSH); err != nil || !claim.isFresh {
		t.Fatalf("Pi claim after listed disposal = claim %#v, error %v", claim, err)
	}
}

func TestDSHExecution_ConcurrentQuarantinedRetriesStartOnlyOneSession(t *testing.T) {
	runtime := &executionDSH{subscribeErr: errors.New("subscribe failed"), isUndisposable: true}
	service := newDSHExecutionService(runtime)
	req := rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"}
	if _, err := service.AgentStart(context.Background(), nil, req); err == nil {
		t.Fatal("initial start succeeded despite subscribe failure")
	}

	startStarted := make(chan struct{})
	startRelease := make(chan struct{})
	runtime.mu.Lock()
	runtime.subscribeErr = nil
	runtime.startStarted = startStarted
	runtime.startRelease = startRelease
	runtime.mu.Unlock()
	results := make(chan error, 2)
	for range 2 {
		go func() {
			_, err := service.AgentStart(context.Background(), nil, req)
			results <- err
		}()
	}
	<-startStarted
	if _, err := service.runtimeIdentities.acquireDSHStart(req.SessionID); err == nil {
		t.Fatal("concurrent DSH start acquired the identity")
	}
	close(startRelease)
	successes := 0
	for range 2 {
		err := <-results
		if err == nil {
			successes++
			continue
		}
		if rpcErr, ok := err.(*rpc.Error); !ok || rpcErr.Code != rpc.CodeSessionExists {
			t.Fatalf("concurrent retry error = %v, want stable session conflict", err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful retries = %d, want 1", successes)
	}

	runtime.mu.Lock()
	started, subscribed, disposed := runtime.started, len(runtime.subscriptions), runtime.disposed
	runtime.mu.Unlock()
	if started != 2 || subscribed != 1 || disposed != 1 {
		t.Fatalf("Start/Subscribe/Dispose = %d/%d/%d, want 2/1/1", started, subscribed, disposed)
	}
	if _, err := service.runtimeIdentities.acquireDSHStart(req.SessionID); err == nil {
		t.Fatal("Pi claimed identity after DSH retry succeeded")
	}
}

func TestDSHExecution_ResetPublicationMakesRacingAttachResumeBeforeSubscribe(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	connection, client := newTestWSConnState(t)
	startDSHExecutionOnConnection(t, service, connection)

	runtime.mu.Lock()
	updates := runtime.subscriptions[0]
	runtime.mu.Unlock()
	updates <- dsh.SessionUpdate{Reset: &dsh.TranscriptReset{SessionID: "s", Incarnation: "reset", HeadSeq: 1}}

	client.SetReadDeadline(time.Now().Add(time.Second))
	var notification map[string]any
	if err := client.ReadJSON(&notification); err != nil {
		t.Fatalf("read reset notification: %v", err)
	}
	attachDone := make(chan error, 1)
	go func() {
		_, err := service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
			Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: 1,
		})
		attachDone <- err
	}()
	if err := <-attachDone; err != nil {
		t.Fatalf("attach after reset: %v", err)
	}

	runtime.mu.Lock()
	resumed, subscriptions := runtime.resumed, len(runtime.subscriptions)
	runtime.mu.Unlock()
	if resumed != 1 || subscriptions != 2 {
		t.Fatalf("Resume/Subscribe = %d/%d, want 1/2", resumed, subscriptions)
	}
	if _, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"after reset"`),
	}); err != nil {
		t.Fatalf("prompt after reset attach: %v", err)
	}
}

func TestDSHExecution_ConcurrentSameIDPiAndDSHExecutionDisposeIndependently(t *testing.T) {
	runtime := &executionDSH{}
	service := newTestHandler(t)
	service.deps.DSH = runtime
	workspacePath := t.TempDir()
	installRecordingPiBinary(t, "")
	service.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: workspacePath}, nil
	})
	t.Cleanup(func() { service.deps.AgentMgr.StopAll() })

	start := make(chan struct{})
	results := make(chan error, 2)
	go func() {
		<-start
		_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
			Runtime: rpc.AgentRuntimePi, SessionID: "same", TabID: "pi-tab", WorkspaceID: "w", CWD: workspacePath,
		})
		results <- err
	}()
	go func() {
		<-start
		_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
			Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "same", TabID: "dsh-tab", WorkspaceID: "w", CWD: workspacePath,
		})
		results <- err
	}()
	close(start)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatalf("concurrent same-ID start: %v", err)
		}
	}
	if _, isLive := service.deps.AgentMgr.Session("same"); !isLive {
		t.Fatal("Pi session is not live")
	}
	if _, found := service.dshSessions.getOwned("same", "w", workspacePath); !found {
		t.Fatal("DSH session is not registered")
	}

	if _, err := service.AgentDispose(context.Background(), rpc.AgentDisposeParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "same", WorkspaceID: "w", CWD: workspacePath,
	}); err != nil {
		t.Fatalf("dispose Pi: %v", err)
	}
	if _, found := service.dshSessions.getOwned("same", "w", workspacePath); !found {
		t.Fatal("Pi dispose removed the same-ID DSH session")
	}
	if _, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "same", WorkspaceID: "w", CWD: workspacePath, Message: json.RawMessage(`"still dsh"`),
	}); err != nil {
		t.Fatalf("prompt DSH after Pi dispose: %v", err)
	}
	if _, err := service.AgentDispose(context.Background(), rpc.AgentDisposeParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "same", WorkspaceID: "w", CWD: workspacePath,
	}); err != nil {
		t.Fatalf("dispose DSH: %v", err)
	}
	if _, isLive := service.deps.AgentMgr.Session("same"); isLive {
		t.Fatal("DSH dispose affected the disposed Pi session")
	}
}
