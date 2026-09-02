package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

type dshExecutionBarrier struct {
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (b *dshExecutionBarrier) wait() {
	if b == nil {
		return
	}
	b.once.Do(func() { close(b.started) })
	<-b.release
}

type executionDSH struct {
	mu                                                                  sync.Mutex
	started, prompted, cancelled, disposed, resumed                     int
	startCWD, resumeCWD, subscribeCWD, promptCWD, cancelCWD, disposeCWD string
	promptText                                                          string
	subscriptions                                                       []chan dsh.SessionUpdate
	subscribeErr                                                        error
	startErrors                                                         []error
	startStarted                                                        chan struct{}
	startStartedOnce                                                    sync.Once
	startRelease                                                        <-chan struct{}
	promptBarrier, cancelBarrier, disposeBarrier                        *dshExecutionBarrier
	isUndisposable                                                      bool
	listResult                                                          dsh.SessionListResult
	health                                                              dsh.Health
	subscribeSnapshot                                                   dsh.SessionSubscribeResult
	subscribeInstanceID                                                 string
	readResult                                                          dsh.SessionReadResult
	reads                                                               int
}

func (f *executionDSH) StartSession(_ context.Context, req dsh.SessionStartRequest) (dsh.SessionStartResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.started++
	f.startCWD = req.CWD
	var startErr error
	if len(f.startErrors) > 0 {
		startErr = f.startErrors[0]
		f.startErrors = f.startErrors[1:]
	}
	started, release := f.startStarted, f.startRelease
	if started != nil {
		f.startStartedOnce.Do(func() { close(started) })
	}
	if release != nil {
		<-release
	}
	if startErr != nil {
		return dsh.SessionStartResult{}, startErr
	}
	return dsh.SessionStartResult{SessionID: req.SessionID, InstanceID: "inc-1"}, nil
}
func (f *executionDSH) SetModelSession(_ context.Context, _ dsh.SetModelRequest) error {
	return nil
}

func (f *executionDSH) PromptSession(_ context.Context, req dsh.SessionPromptRequest) (dsh.SessionPromptResult, error) {
	f.mu.Lock()
	f.prompted++
	f.promptCWD = req.CWD
	f.promptText = req.ContentBlocks[0].Text
	barrier := f.promptBarrier
	f.mu.Unlock()
	barrier.wait()
	return dsh.SessionPromptResult{}, nil
}
func (f *executionDSH) CancelSession(_ context.Context, req dsh.SessionCancelRequest) (dsh.SessionCancelResult, error) {
	f.mu.Lock()
	f.cancelled++
	f.cancelCWD = req.CWD
	barrier := f.cancelBarrier
	f.mu.Unlock()
	barrier.wait()
	return dsh.SessionCancelResult{SessionID: req.SessionID, Cancelled: true}, nil
}
func (f *executionDSH) DisposeSession(_ context.Context, req dsh.SessionReadRequest) (dsh.SessionDisposeResult, error) {
	f.mu.Lock()
	f.disposed++
	f.disposeCWD = req.CWD
	isDisposed := !f.isUndisposable
	barrier := f.disposeBarrier
	f.mu.Unlock()
	barrier.wait()
	return dsh.SessionDisposeResult{SessionID: req.SessionID, Disposed: isDisposed}, nil
}
func (f *executionDSH) SubscribeSession(_ context.Context, req dsh.SessionSubscribeRequest) (dsh.SessionSubscription, error) {
	f.mu.Lock()
	f.subscribeCWD = req.CWD
	subscribeErr := f.subscribeErr
	f.mu.Unlock()
	if subscribeErr != nil {
		return dsh.SessionSubscription{}, f.subscribeErr
	}
	updates := make(chan dsh.SessionUpdate)
	f.mu.Lock()
	f.subscriptions = append(f.subscriptions, updates)
	f.mu.Unlock()
	var once sync.Once
	subscription := dsh.SessionSubscription{Updates: updates, InstanceID: f.subscribeInstanceID, Unsubscribe: func() { once.Do(func() { close(updates) }) }}
	f.mu.Lock()
	subscription.Snapshot = f.subscribeSnapshot
	f.mu.Unlock()
	return subscription, nil
}
func (f *executionDSH) ResumeSession(_ context.Context, req dsh.SessionResumeRequest) (dsh.SessionResumeResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.resumed++
	f.resumeCWD = req.CWD
	return dsh.SessionResumeResult{SessionID: req.SessionID}, nil
}
func (f *executionDSH) FlushSession(context.Context, dsh.SessionFlushRequest) (dsh.DurableCursor, error) {
	return dsh.DurableCursor{}, nil
}
func (f *executionDSH) ListSessions(context.Context, dsh.SessionListRequest) (dsh.SessionListResult, error) {
	return f.listResult, nil
}
func (f *executionDSH) ReadSession(context.Context, dsh.SessionReadRequest) (dsh.SessionReadResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reads++
	return f.readResult, nil
}
func (f *executionDSH) Health() dsh.Health {
	if f.health != (dsh.Health{}) {
		return f.health
	}
	return dsh.Health{IsReady: true}
}

func TestDSHExecution_RestoredSessionResumesAndRegistersSubscription(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	req := rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "restored", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative", Resume: true}
	if _, err := service.AgentStart(context.Background(), nil, req); err != nil {
		t.Fatalf("resume start: %v", err)
	}
	runtime.mu.Lock()
	started, resumed, subscribed := runtime.started, runtime.resumed, len(runtime.subscriptions)
	resumeCWD, subscribeCWD := runtime.resumeCWD, runtime.subscribeCWD
	runtime.mu.Unlock()
	if started != 0 || resumed != 1 || subscribed != 1 || resumeCWD != "/authoritative" || subscribeCWD != "/authoritative" {
		t.Fatalf("Start/Resume/Subscribe cwd = %d/%d/%d %q/%q", started, resumed, subscribed, resumeCWD, subscribeCWD)
	}
	if _, found := service.dshSessions.getOwned("restored", "w", "/authoritative"); !found {
		t.Fatal("resumed DSH session was not registered")
	}
}

func TestDSHExecution_StartRejectsUnauthorizedWorkspaceContext(t *testing.T) {
	tests := []struct {
		name          string
		workspace     workspace.Workspace
		resolverError error
		cwd           string
	}{
		{name: "closing", workspace: workspace.Workspace{ID: "w", Path: "/authoritative", State: workspace.StateClosing}, cwd: "/authoritative"},
		{name: "stale health", workspace: workspace.Workspace{ID: "w", Path: "/authoritative", State: workspace.StateActive, Health: workspace.HealthPathMissing}, cwd: "/authoritative"},
		{name: "closed", resolverError: rpc.NewRPCError(rpc.CodeNotFound, "workspace not found"), cwd: "/authoritative"},
		{name: "forged cwd", workspace: workspace.Workspace{ID: "w", Path: "/authoritative", State: workspace.StateActive}, cwd: "/forged"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			runtime := &executionDSH{}
			service := NewService(Deps{DSH: runtime, Workspace: testWorkspaceResolver(func(string) (workspace.Workspace, error) {
				return test.workspace, test.resolverError
			})})
			_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
				Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion,
				SessionID: "unauthorized", TabID: "tab", WorkspaceID: "w", CWD: test.cwd,
			})
			if err == nil {
				t.Fatal("expected DSH start to reject an unauthorized workspace context")
			}
			if runtime.started != 0 {
				t.Fatalf("DSH starts = %d, want 0", runtime.started)
			}
		})
	}
}

func TestDSHExecution_NewSessionStartsWithoutResume(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	if _, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "new", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"}); err != nil {
		t.Fatalf("new start: %v", err)
	}
	runtime.mu.Lock()
	started, resumed := runtime.started, runtime.resumed
	runtime.mu.Unlock()
	if started != 1 || resumed != 0 {
		t.Fatalf("Start/Resume = %d/%d", started, resumed)
	}
}

func TestDSHExecution_StartReturnsOneShotAttachSnapshot(t *testing.T) {
	runtime := &executionDSH{subscribeSnapshot: dsh.SessionSubscribeResult{
		SessionID: "new", InstanceID: "inc-1", Events: []dsh.SessionEvent{
			{SessionID: "new", Seq: 0, Event: json.RawMessage(`{"type":"turn/end","seq":0,"time":0,"data":{"turn":0,"reason":{"kind":"completed"}}}`)},
		},
		AsOfSeq: 0, DurableThroughSeq: 0, HeadSeq: 0,
	}}
	service := newDSHExecutionService(runtime)
	result, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "new", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative",
	})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	started, ok := result.(rpc.AgentStartResult)
	if !ok || started.DSHAttachSnapshot == nil || started.DSHAttachSnapshot.HeadSeq != 0 || len(started.DSHAttachSnapshot.Events) != 1 {
		t.Fatalf("start result = %#v", result)
	}
}

func TestDSHExecution_ResumeSubscriptionFailureDisposesAndReleasesIdentity(t *testing.T) {
	runtime := &executionDSH{subscribeErr: errors.New("subscribe failed")}
	service := newDSHExecutionService(runtime)
	req := rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "restored", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative", Resume: true}
	if _, err := service.AgentStart(context.Background(), nil, req); err == nil {
		t.Fatal("resume succeeded despite subscribe failure")
	}
	runtime.mu.Lock()
	started, resumed, disposed := runtime.started, runtime.resumed, runtime.disposed
	runtime.mu.Unlock()
	if started != 0 || resumed != 1 || disposed != 1 {
		t.Fatalf("Start/Resume/Dispose = %d/%d/%d", started, resumed, disposed)
	}
	if claim, err := service.runtimeIdentities.claim(req.SessionID, rpc.AgentRuntimeDSH); err != nil || !claim.isFresh {
		t.Fatalf("Pi claim after compensated resume = %#v, %v", claim, err)
	}
}

func TestDSHExecution_StartPromptAbortDisposeUsesAuthoritativeWorkspace(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	startDSHExecution(t, service)
	_, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"hello"`)})
	if err != nil {
		t.Fatalf("prompt: %v", err)
	}
	_, err = service.AgentAbort(context.Background(), rpc.AgentAbortParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative"})
	if err != nil {
		t.Fatalf("abort: %v", err)
	}
	_, err = service.AgentDispose(context.Background(), rpc.AgentDisposeParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative"})
	if err != nil {
		t.Fatalf("dispose: %v", err)
	}
	if runtime.started != 1 || runtime.prompted != 1 || runtime.cancelled != 1 || runtime.disposed != 1 || runtime.startCWD != "/authoritative" || runtime.promptText != "hello" {
		t.Fatalf("runtime calls = %#v", runtime)
	}
}

func TestDSHExecution_NotifyFailureDetachesOnlyFailedConnectionGeneration(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	service.publishDSHUpdateError = errors.New("frontend notification failed")
	connection, _ := newTestWSConnState(t)
	_, err := service.AgentStart(context.Background(), connection, rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	entry, found := service.dshSessions.getOwned("s", "w", "/authoritative")
	if !found {
		t.Fatal("missing DSH session")
	}
	runtime.mu.Lock()
	updates := runtime.subscriptions[0]
	runtime.mu.Unlock()
	updates <- dsh.SessionUpdate{Event: &dsh.SessionEvent{Event: json.RawMessage(`{"type":"message"}`)}}
	deadline := time.Now().Add(time.Second)
	for !service.dshSessions.requiresResume(entry) {
		if time.Now().After(deadline) {
			t.Fatal("notify failure did not detach DSH route")
		}
		time.Sleep(time.Millisecond)
	}
	if _, err := service.runtimeIdentities.acquireDSHStart("s"); err == nil {
		t.Fatal("notify failure released DSH identity")
	}
}

func TestDSHExecution_AttachRebindsAfterClosedSubscription(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	startDSHExecution(t, service)
	entry, found := service.dshSessions.getOwned("s", "w", "/authoritative")
	if !found {
		t.Fatal("missing dsh session")
	}
	entry.subscription.Unsubscribe()
	for service.dshSessions.requiresResume(entry) == false {
	}
	_, err := service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: 9})
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if runtime.resumed != 1 || len(runtime.subscriptions) != 2 {
		t.Fatalf("resume/subscriptions = %d/%d", runtime.resumed, len(runtime.subscriptions))
	}
}

func TestAgentGetCapabilities_ReportsConfiguredAndReady(t *testing.T) {
	without := newDSHExecutionService(nil)
	result, err := without.AgentGetCapabilities(context.Background())
	withoutCapabilities := result.(rpc.AgentCapabilitiesResult).DSH
	if err != nil || withoutCapabilities.Configured || withoutCapabilities.TranscriptProtocolVersion != rpc.DSHTranscriptProtocolVersion {
		t.Fatalf("without runtime = %#v, %v", result, err)
	}
	with := newDSHExecutionService(&executionDSH{health: dsh.Health{IsReady: true, InstanceID: "runtime-2"}})
	result, err = with.AgentGetCapabilities(context.Background())
	capabilities := result.(rpc.AgentCapabilitiesResult).DSH
	if err != nil || !capabilities.Ready || capabilities.InstanceID != "runtime-2" {
		t.Fatalf("with runtime = %#v, %v", result, err)
	}
	with.deps.DSH.(*executionDSH).health = dsh.Health{IsReady: false}
	result, err = with.AgentGetCapabilities(context.Background())
	if err != nil || result.(rpc.AgentCapabilitiesResult).DSH.InstanceID != "" {
		t.Fatalf("unavailable runtime = %#v, %v", result, err)
	}
}

func TestMapDSHExecutionError_UsesStableUnavailableContract(t *testing.T) {
	for _, runtimeErr := range []error{dsh.ErrRuntimeUnavailable, dsh.ErrRequestInterrupted, dsh.ErrSessionReplayReset} {
		rpcErr, ok := mapDSHExecutionError(runtimeErr).(*rpc.Error)
		if !ok || rpcErr.Code != rpc.CodeServerError || rpcErr.Data["code"] != "DSH_RUNTIME_UNAVAILABLE" {
			t.Fatalf("runtime error %v mapped to %#v", runtimeErr, rpcErr)
		}
	}
	if got := mapDSHExecutionError(errors.Join(dsh.ErrRuntimeUnavailable, fmt.Errorf("caller stopped: %w", context.Canceled))); !errors.Is(got, context.Canceled) {
		t.Fatalf("caller cancellation = %v, want context canceled", got)
	}
}

func newDSHExecutionService(runtime DSHSessions) *Service {
	return NewService(Deps{DSH: runtime, OwnerNodeID: "node", Workspace: testWorkspaceResolver(func(string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: "w", ProjectID: "project", OrgID: "organization", Path: "/authoritative", State: workspace.StateActive}, nil
	})})
}
func startDSHExecution(t *testing.T, service *Service) {
	t.Helper()
	_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative"})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
}

func TestDSHExecution_AttachRejectsUnsafeExplicitAfterSeqBeforeDSH(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	startDSHExecution(t, service)
	for _, afterSeq := range []int64{-2, maxDSHAfterSeq} {
		_, err := service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: afterSeq, AfterSeqProvided: true})
		if rpcErr, ok := err.(*rpc.Error); !ok || rpcErr.Code != rpc.CodeInvalidParams {
			t.Fatalf("afterSeq %d error = %v", afterSeq, err)
		}
	}
	if len(runtime.subscriptions) != 1 {
		t.Fatalf("subscriptions = %d, invalid cursors reached DSH", len(runtime.subscriptions))
	}
}

func TestDSHFrontendEvent_UsesCanonicalSessionUpdateWire(t *testing.T) {
	payload, err := json.Marshal(dshFrontendEvent{
		SessionID: "session", TabID: "tab", WorkspaceID: "workspace", InstanceID: "inc",
		Update: dsh.SessionUpdate{Event: &dsh.SessionEvent{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"type":"user/message","seq":0,"time":1,"data":{"message":{"id":"user","role":"user","content":[{"type":"text","text":"hello"}],"source":{"kind":"user"}},"surfaceOp":"append"}}`)}},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	want := `{"sessionId":"session","tabId":"tab","workspaceId":"workspace","instanceId":"inc","update":{"event":{"sessionId":"session","seq":0,"event":{"type":"user/message","seq":0,"time":1,"data":{"message":{"id":"user","role":"user","content":[{"type":"text","text":"hello"}],"source":{"kind":"user"}},"surfaceOp":"append"}}}}}`
	if string(payload) != want {
		t.Fatalf("wire JSON = %s, want %s", payload, want)
	}
}

func TestDSHExecution_RunningSessionAcceptsSecondSteerPrompt(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	startDSHExecution(t, service)
	for _, prompt := range []rpc.AgentPromptParams{
		{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"first"`)},
		{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"second"`), StreamingBehavior: "steer"},
	} {
		if _, err := service.AgentPrompt(context.Background(), prompt); err != nil {
			t.Fatalf("prompt: %v", err)
		}
	}
	runtime.mu.Lock()
	prompted := runtime.prompted
	runtime.mu.Unlock()
	if prompted != 2 {
		t.Fatalf("DSH prompts = %d, want 2", prompted)
	}
}

func startDSHExecutionOnConnection(t *testing.T, service *Service, connection *rpc.Connection) {
	t.Helper()
	_, err := service.AgentStart(context.Background(), connection, rpc.AgentStartParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative",
	})
	if err != nil {
		t.Fatalf("start DSH: %v", err)
	}
}

func TestDSHExecution_AttachReturnsMergedReplaySnapshot(t *testing.T) {
	runtime := &executionDSH{subscribeSnapshot: dsh.SessionSubscribeResult{
		SessionID: "s", InstanceID: "inc-2", Events: []dsh.SessionEvent{
			{SessionID: "s", Seq: 0, Event: json.RawMessage(`{"type":"turn/end","seq":0,"time":0,"data":{"turn":0,"reason":{"kind":"completed"}}}`)},
		},
		AsOfSeq: 0, DurableThroughSeq: 0, HeadSeq: 1,
	}}
	service := newDSHExecutionService(runtime)
	startDSHExecution(t, service)
	result, err := service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: -1,
	})
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	attach, ok := result.(rpc.AgentDSHAttachResult)
	if !ok {
		t.Fatalf("attach result = %T, want rpc.AgentDSHAttachResult", result)
	}
	if attach.Runtime != rpc.AgentRuntimeDSH || attach.SessionID != "s" || attach.InstanceID != "inc-2" ||
		attach.AsOfSeq != 0 || attach.DurableThroughSeq != 0 || attach.HeadSeq != 1 || len(attach.Events) != 1 {
		t.Fatalf("attach result = %#v", attach)
	}
}

func TestMapDSHExecutionError_MapsBindingConflictToSessionExists(t *testing.T) {
	err := mapDSHExecutionError(&dsh.RequestError{Data: json.RawMessage(`{"code":"YISHAN_SESSION_BINDING_CONFLICT"}`)})
	rpcErr, ok := err.(*rpc.Error)
	if !ok || rpcErr.Code != rpc.CodeSessionExists || rpcErr.Message != "dsh session conflict" {
		t.Fatalf("binding conflict = %#v", err)
	}
}
