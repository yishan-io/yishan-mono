package dsh

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRuntimeProcess_RegisterAfterExitFailsImmediately(t *testing.T) {
	process := &runtimeProcess{pending: make(map[string]chan rpcResponse)}
	process.failPending(errors.New("exited"))
	response, remove := process.registerPending("7")
	defer remove()
	select {
	case frame := <-response:
		if !errors.Is(frame.err, ErrRequestInterrupted) {
			t.Fatalf("response error = %v", frame.err)
		}
	case <-time.After(time.Second):
		t.Fatal("register after exit did not fail immediately")
	}
}

func TestSessionListWireResult_RejectsPreviewText(t *testing.T) {
	var result sessionListWireResult
	if err := decodeStrictJSON([]byte(`{"sessions":[{"sessionId":"session-1","createdAt":1,"previewText":"not compatible","live":false,"persisted":true}]}`), &result); err == nil {
		t.Fatal("accepted previewText in the wire-compatible session list response")
	}
}

func TestSessionTitleSummaryWireResult_ValidatesRequestedSessions(t *testing.T) {
	request := SessionTitleSummaryRequest{CWD: "/workspace", SessionIDs: []string{"session-1", "session-2"}}
	result := sessionTitleSummaryWireResult{Titles: []sessionTitleSummaryWire{
		{SessionID: "session-1", PreviewText: stringPointer("Review the migration plan")},
		{SessionID: "session-2", PreviewText: stringPointer("")},
	}}
	validated, err := result.validate(request)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if got := validated.Titles[0].PreviewText; got != "Review the migration plan" {
		t.Fatalf("preview text = %q", got)
	}
}

func TestSessionTitleSummaryWireResult_RejectsUnrequestedSession(t *testing.T) {
	_, err := (sessionTitleSummaryWireResult{Titles: []sessionTitleSummaryWire{{SessionID: "other"}}}).validate(
		SessionTitleSummaryRequest{CWD: "/workspace", SessionIDs: []string{"session-1"}},
	)
	if err == nil {
		t.Fatal("accepted title summary for an unrequested session")
	}
}

func TestSessionListWireResult_RejectsMissingCreatedAt(t *testing.T) {
	live, persisted := false, true
	result := sessionListWireResult{Sessions: []sessionListWireEntry{{
		SessionID: "session-1", Live: &live, Persisted: &persisted,
	}}}
	if _, err := result.validate(); err == nil {
		t.Fatal("accepted session list entry without createdAt")
	}
}

func TestValidJSONObject_RejectsMissingSequence(t *testing.T) {
	if validJSONObject([]byte(`{"type":"turn/end","time":1,"data":{}}`)) {
		t.Fatal("accepted session event without seq")
	}
}

func TestSupervisor_ListSessions_RoutesMatchingResponse(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	response, err := supervisor.ListSessions(context.Background(), SessionListRequest{CWD: "/workspace"})
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(response.Sessions) != 1 || response.Sessions[0].SessionID != "/workspace" {
		t.Fatalf("sessions = %#v", response.Sessions)
	}
}

func TestSupervisor_ListSessions_RoutesConcurrentResponses(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	var waitGroup sync.WaitGroup
	errorsByCWD := make(chan error, 20)
	for index := range 20 {
		waitGroup.Add(1)
		go requestSessionList(supervisor, index, &waitGroup, errorsByCWD)
	}
	waitGroup.Wait()
	close(errorsByCWD)
	for err := range errorsByCWD {
		t.Error(err)
	}
}

func requestSessionList(supervisor *Supervisor, index int, waitGroup *sync.WaitGroup, results chan<- error) {
	defer waitGroup.Done()
	cwd := fmt.Sprintf("/workspace/%d", index)
	response, err := supervisor.ListSessions(context.Background(), SessionListRequest{CWD: cwd})
	if err != nil {
		results <- fmt.Errorf("ListSessions(%s): %w", cwd, err)
		return
	}
	if len(response.Sessions) != 1 || response.Sessions[0].SessionID != cwd {
		results <- fmt.Errorf("response for %s = %#v", cwd, response)
	}
}

func TestSupervisor_DisposeSession_SendsDisposeRequest(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	response, err := supervisor.DisposeSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "session"})
	if err != nil || response.SessionID != "session" || !response.Disposed {
		t.Fatalf("DisposeSession = %#v, %v", response, err)
	}
}

func TestSupervisor_StartSession_RemovesWorkspaceBindingAfterInvalidResponse(t *testing.T) {
	bindingCalled := false
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("rpc-invalid-start"),
		WorkspaceBindingResolver: func(context.Context, WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
			bindingCalled = true
			return WorkspaceBindingResult{}, nil
		},
	})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	request := SessionStartRequest{CWD: "/workspace", SessionID: "session-1", Binding: SessionBinding{Version: 1, WorkspaceID: "workspace-1", OwnerNodeID: "node", CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}}
	if _, err := supervisor.StartSession(context.Background(), request); err == nil {
		t.Fatal("StartSession accepted an invalid runtime response")
	}

	writer := &recordingWriteCloser{}
	id := "reverse-1"
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session-1","workspaceId":"workspace-1"}`)})
	if bindingCalled || !strings.Contains(writer.String(), `"code":-32000`) {
		t.Fatalf("workspace binding callback called=%v response=%s", bindingCalled, writer.String())
	}
}

func TestSupervisor_ReverseWorkspaceBinding_UsesDaemonResolver(t *testing.T) {
	admitted := make(chan WorkspaceBindingRequest, 1)
	supervisor := newTestSupervisor(Config{
		Command:     helperCommand("rpc-reverse-workspace"),
		Diagnostics: func(message string) { t.Log(message) },
		WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
			admitted <- request
			return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
		},
	})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if _, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: "/workspace", SessionID: "session-1", Binding: SessionBinding{Version: 1, WorkspaceID: "workspace-1", OwnerNodeID: "node", CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}}); err != nil {
		t.Fatalf("StartSession: %v", err)
	}
	select {
	case request := <-admitted:
		if request != (WorkspaceBindingRequest{SessionID: "session-1", WorkspaceID: "workspace-1"}) {
			t.Fatalf("workspace binding = %#v", request)
		}
	case <-time.After(time.Second):
		t.Fatal("workspace binding did not reach daemon resolver")
	}
}

func TestSupervisor_ResumeSession_PostDaemonRestartAdmitsPersistedWorkspace(t *testing.T) {
	admitted := make(chan WorkspaceBindingRequest, 1)
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("rpc-reverse-resume-workspace"),
		WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
			admitted <- request
			return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
		},
	})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start replacement daemon runtime: %v", err)
	}
	request := SessionResumeRequest{CWD: "/workspace", SessionID: "persisted-session", WorkspaceID: "persisted-workspace"}
	response, err := supervisor.ResumeSession(context.Background(), request)
	if err != nil || response.SessionID != request.SessionID {
		t.Fatalf("ResumeSession = %#v, %v", response, err)
	}
	select {
	case got := <-admitted:
		if got != (WorkspaceBindingRequest{SessionID: request.SessionID, WorkspaceID: request.WorkspaceID}) {
			t.Fatalf("workspace binding = %#v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("persisted resume did not admit its workspace through the replacement daemon")
	}
}

func TestSupervisor_ResumeSession_SendsResumeRequest(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	response, err := supervisor.ResumeSession(context.Background(), SessionResumeRequest{CWD: "/workspace", SessionID: "session", WorkspaceID: "workspace"})
	if err != nil || response.SessionID != "session" {
		t.Fatalf("ResumeSession = %#v, %v", response, err)
	}
}

func TestSupervisor_ResumeSession_RejectsMissingAuthorizedWorkspace(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ResumeSession(context.Background(), SessionResumeRequest{CWD: "/workspace", SessionID: "session"})
	if err == nil {
		t.Fatal("accepted resume without daemon-authorized workspace context")
	}
}

func TestSupervisor_ReadSession_RejectsMalformedResult(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "malformed"})
	if err == nil {
		t.Fatal("ReadSession accepted a malformed result")
	}
}

func TestSupervisor_ReadSession_ReturnsServerRequestError(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "server-error"})
	var requestErr *RequestError
	if !errors.As(err, &requestErr) || requestErr.Code != 9 || requestErr.Method != yishanSessionReadMethod {
		t.Fatalf("ReadSession error = %#v", err)
	}
}

func TestSupervisor_ReadSession_RespectsContextDeadline(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := supervisor.ReadSession(ctx, SessionReadRequest{CWD: "/workspace", SessionID: "wait"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("ReadSession error = %v, want deadline exceeded", err)
	}
}

func TestSupervisor_ReadSession_FailsWhenRuntimeExitsForRestart(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-exit"), RestartLimit: 1, RestartBackoff: time.Millisecond})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "session"})
	if !errors.Is(err, ErrRequestInterrupted) {
		t.Fatalf("ReadSession error = %v, want interrupted request", err)
	}
}

func TestSupervisor_ReadSession_FailsWhenClosed(t *testing.T) {
	waiting := make(chan string, 1)
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("rpc"), Diagnostics: func(message string) { waiting <- message },
	})
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	result := make(chan error, 1)
	go func() {
		_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "wait"})
		result <- err
	}()
	waitFor(t, func() bool {
		select {
		case message := <-waiting:
			return message == "DSH stderr: waiting request"
		default:
			return false
		}
	})
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := <-result; !errors.Is(err, ErrRequestInterrupted) {
		t.Fatalf("ReadSession error = %v, want interrupted request", err)
	}
}

func TestSupervisor_Start_ObservesNotifications(t *testing.T) {
	notifications := make(chan string, 1)
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-notify"), Diagnostics: func(message string) { notifications <- message }})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	select {
	case message := <-notifications:
		if message != "DSH notification: event" {
			t.Fatalf("diagnostic = %q", message)
		}
	case <-time.After(time.Second):
		t.Fatal("notification was not observed")
	}
}

func TestSupervisor_ExecutionCallsValidateExactResults(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	request := SessionExecutionRequest{CWD: "/workspace", SessionID: "session"}
	if response, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: request.CWD, SessionID: request.SessionID, Binding: testSessionBinding(request.CWD)}); err != nil || response.InstanceID != "run" {
		t.Fatalf("StartSession = %#v, %v", response, err)
	}
	if response, err := supervisor.PromptSession(context.Background(), SessionPromptRequest{CWD: request.CWD, SessionID: request.SessionID, ContentBlocks: []TextPromptContentBlock{{Type: "text", Text: "hello"}}}); err != nil || response.MessageID != "message" {
		t.Fatalf("PromptSession = %#v, %v", response, err)
	}
	if err := supervisor.SetModelSession(context.Background(), SetModelRequest{CWD: request.CWD, SessionID: request.SessionID, Model: "deepseek-v4-flash"}); err != nil {
		t.Fatalf("SetModelSession: %v", err)
	}
	if response, err := supervisor.CancelSession(context.Background(), request); err != nil || !response.Cancelled {
		t.Fatalf("CancelSession = %#v, %v", response, err)
	}
	if response, err := supervisor.FlushSession(context.Background(), request); err != nil || response.InstanceID != "run" {
		t.Fatalf("FlushSession = %#v, %v", response, err)
	}
	subscription, err := supervisor.SubscribeSession(context.Background(), SessionSubscribeRequest{CWD: request.CWD, SessionID: request.SessionID, AfterSeq: -1})
	if err != nil {
		t.Fatalf("SubscribeSession: %v", err)
	}
	if subscription.InstanceID != "run" || subscription.Baseline != -1 {
		t.Fatalf("subscription snapshot = instanceID %q, baseline %d", subscription.InstanceID, subscription.Baseline)
	}
	subscription.Unsubscribe()
}

func TestSupervisor_KnownMalformedNotificationInterruptsGeneration(t *testing.T) {
	process := &runtimeProcess{pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	response, remove := process.registerPending("1")
	defer remove()
	supervisor := NewSupervisor(Config{})
	supervisor.routeNotification(process, rpcEnvelope{Method: sessionEventMethod, Params: []byte(`{"sessionId":"session","event":{"seq":-1}}`)})
	if frame := <-response; !errors.Is(frame.err, ErrRequestInterrupted) {
		t.Fatalf("pending error = %v", frame.err)
	}
}

func TestSupervisor_MalformedKnownNotificationKillsOnlyItsGeneration(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-invalid-notify"), RestartLimit: 1, RestartBackoff: time.Millisecond})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.ReadSession(context.Background(), SessionReadRequest{CWD: "/workspace", SessionID: "wait"})
	if !errors.Is(err, ErrRequestInterrupted) {
		t.Fatalf("ReadSession error = %v", err)
	}
	if health := supervisor.Health(); health.IsReady || health.InstanceID != "" {
		t.Fatalf("health after invalid notification = %#v, want unavailable without instanceID", health)
	}
	waitFor(t, func() bool { return supervisor.Health().RestartCount == 1 })
}

func TestSupervisor_MalformedKnownNotificationPreservesNewerGenerationHealth(t *testing.T) {
	supervisor := NewSupervisor(Config{})
	stale := &runtimeProcess{pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	current := &runtimeProcess{pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor.process = current
	supervisor.health = Health{IsReady: true, InstanceID: "dsh-2"}

	supervisor.invalidateProcess(stale, errors.New("invalid notification"))

	if health := supervisor.Health(); !health.IsReady || health.InstanceID != "dsh-2" {
		t.Fatalf("health after stale invalidation = %#v, want current generation health", health)
	}
}

func TestSequenceValidation_RejectsUnsafeValues(t *testing.T) {
	unsafe := maxSafeInteger + 1
	if err := validateSubscribeRequest(SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: maxSafeInteger}); err == nil {
		t.Fatal("accepted max afterSeq despite required increment")
	}
	if _, err := (durableCursorWire{SessionID: "session", InstanceID: "run", DurableThroughSeq: unsafe}).validate("session"); err == nil {
		t.Fatal("accepted unsafe durable cursor")
	}
	if _, err := parseEvent([]byte(`{"seq":9007199254740992}`), "session"); err == nil {
		t.Fatal("accepted unsafe event sequence")
	}
	if _, err := parseTranscriptResetNotification([]byte(`{"sessionId":"session","instanceId":"run","headSeq":9007199254740992}`)); err == nil {
		t.Fatal("accepted unsafe reset head")
	}
}

func TestSupervisor_StartSession_RejectsMissingAuthoritativeBinding(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: "/workspace", SessionID: "session"})
	if err == nil {
		t.Fatal("accepted start without binding")
	}
}

func testSessionBinding(cwd string) SessionBinding {
	return SessionBinding{Version: 1, WorkspaceID: "workspace", OwnerNodeID: "node", CWD: cwd, Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}
}

func TestProviderCatalogWire_RejectsSecretFields(t *testing.T) {
	var response providerCatalogWire
	err := decodeStrictJSON([]byte(`{"providers":[{"id":"deepseek-official","authentication":"api-key","setupRequired":true,"models":[{"provider":"deepseek-official","id":"deepseek-v4-flash","name":"DeepSeek"}],"apiKey":"secret"}]}`), &response)
	if err == nil {
		t.Fatal("accepted provider catalog secret field")
	}
}

func TestProviderCatalogWire_RejectsUnknownModelRoute(t *testing.T) {
	setupRequired := true
	_, err := (providerCatalogWire{Providers: []providerCatalogProviderWire{{
		ID: "deepseek-official", Authentication: "api-key", SetupRequired: &setupRequired,
		Models: []providerCatalogModelWire{{Provider: "other", ID: "model", Name: "Model"}},
	}}}).validate()
	if err == nil {
		t.Fatal("accepted a model under the wrong provider route")
	}
}

func stringPointer(value string) *string { return &value }
