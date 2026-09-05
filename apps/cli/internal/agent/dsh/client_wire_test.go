package dsh

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
)

func TestParseInitializeResponse_RejectsErrorWithoutCode(t *testing.T) {
	_, err := parseInitializeResponse([]byte(`{"jsonrpc":"2.0","id":1,"error":{"message":"failed"}}`))
	if err == nil {
		t.Fatal("accepted initialize error without code")
	}
}

func TestParseRPCEnvelope_RejectsAmbiguousResponse(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":"dsh-3","result":{},"error":{"code":1,"message":"bad"}}`))
	if err == nil {
		t.Fatal("accepted response with both result and error")
	}
}

func TestParseRPCEnvelope_RejectsUnknownResponseField(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":"dsh-3","result":{},"extra":true}`))
	if err == nil {
		t.Fatal("accepted response with unknown field")
	}
}

func TestParseRPCEnvelope_RejectsIncompleteError(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":"dsh-3","error":{"message":"bad"}}`))
	if err == nil {
		t.Fatal("accepted response without an error code")
	}
}

func TestParseRPCEnvelope_AcceptsStringReverseRequestID(t *testing.T) {
	frame, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":"reverse-1","method":"yishan.v1.workspace.binding.resolve","params":{"sessionId":"session","workspaceId":"workspace"}}`))
	if err != nil || frame.ID == nil || *frame.ID != "reverse-1" {
		t.Fatalf("parse frame = %#v, %v", frame, err)
	}
}

func TestParseRPCEnvelope_RejectsReverseRequestOperationField(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":"reverse-1","method":"yishan.v1.workspace.binding.resolve","params":{"operation":"workspace.admit","sessionId":"session","workspaceId":"workspace"}}`))
	if err != nil {
		t.Fatalf("envelope must defer params validation to the reverse request handler: %v", err)
	}
}

func TestParseRPCEnvelope_RejectsNullID(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":null,"result":{}}`))
	if err == nil {
		t.Fatal("accepted response with a null id")
	}
}

func TestSupervisor_RouteOutputInvalidatesKnownMalformedNotification(t *testing.T) {
	process := &runtimeProcess{pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor := NewSupervisor(Config{})
	supervisor.routeOutput(process, []byte(`{"jsonrpc":"wrong","method":"session.event"}`))
	if err := process.replay.errorIfInvalid("session"); !errors.Is(err, ErrSessionReplayReset) {
		t.Fatalf("generation error = %v", err)
	}
}

func TestSupervisor_RouteOutputKeepsUnknownMalformedEnvelopeDiagnostic(t *testing.T) {
	process := &runtimeProcess{pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor := NewSupervisor(Config{})
	supervisor.routeOutput(process, []byte(`{"jsonrpc":"wrong","method":"unknown.event"}`))
	if err := process.replay.errorIfInvalid("session"); err != nil {
		t.Fatalf("generation error = %v", err)
	}
}

func TestSessionReadWireResult_RequiresDurableSnapshotCursorsAndInstanceID(t *testing.T) {
	var response sessionReadWireResult
	err := decodeStrictJSON([]byte(`{
		"session":{"sessionId":"session","createdAt":1,"origin":"subagent","parentSession":"parent"},
		"events":[],
		"instanceId":"run-1",
		"asOfSeq":-1,
		"durableThroughSeq":-1
	}`), &response)
	if err != nil {
		t.Fatalf("decodeStrictJSON: %v", err)
	}
	result, err := response.validate(SessionReadRequest{CWD: "/workspace", SessionID: "session"})
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if result.InstanceID != "run-1" || result.AsOfSeq != -1 || result.DurableThroughSeq != -1 ||
		result.Session.Origin != "subagent" || result.Session.ParentSession != "parent" {
		t.Fatalf("result = %#v", result)
	}
}

func TestSessionReadWireResult_RejectsUnsafeDurableSnapshotCursors(t *testing.T) {
	var response sessionReadWireResult
	err := decodeStrictJSON([]byte(`{
		"session":{"sessionId":"session","createdAt":1},
		"events":[],
		"instanceId":"run-1",
		"asOfSeq":0,
		"durableThroughSeq":-1
	}`), &response)
	if err != nil {
		t.Fatalf("decodeStrictJSON: %v", err)
	}
	if _, err := response.validate(SessionReadRequest{CWD: "/workspace", SessionID: "session"}); err == nil {
		t.Fatal("accepted divergent snapshot cursors")
	}
}

type recordingWriteCloser struct{ bytes.Buffer }

func (w *recordingWriteCloser) Close() error { return nil }

type signalingWriteCloser struct {
	recordingWriteCloser
	writes chan struct{}
}

func (w *signalingWriteCloser) Write(payload []byte) (int, error) {
	count, err := w.recordingWriteCloser.Write(payload)
	w.writes <- struct{}{}
	return count, err
}

func TestSupervisor_HandleRuntimeRequest_RejectsUnregisteredSession(t *testing.T) {
	writer := &recordingWriteCloser{}
	called := false
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(context.Context, WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		called = true
		return WorkspaceBindingResult{}, nil
	}})
	process := &runtimeProcess{stdin: writer}
	id := "reverse-1"
	supervisor.handleRuntimeRequest(process, rpcEnvelope{ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"missing","workspaceId":"workspace"}`)})
	if called || !strings.Contains(writer.String(), `"code":-32000`) {
		t.Fatalf("binding callback called=%v response=%s", called, writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_RejectsMismatchedWorkspace(t *testing.T) {
	writer := &recordingWriteCloser{}
	called := false
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(context.Context, WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		called = true
		return WorkspaceBindingResult{}, nil
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace-1", "/workspace"); err != nil {
		t.Fatalf("register workspace binding: %v", err)
	}
	process := &runtimeProcess{stdin: writer}
	id := "reverse-2"
	supervisor.handleRuntimeRequest(process, rpcEnvelope{ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace-2"}`)})
	if called || !strings.Contains(writer.String(), `"code":-32000`) {
		t.Fatalf("binding callback called=%v response=%s", called, writer.String())
	}
}

func TestSupervisor_RegisterWorkspaceBinding_RejectsConflictingWorkspace(t *testing.T) {
	writer := &recordingWriteCloser{}
	called := false
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		called = true
		return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace-1", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace-1", "/workspace-1"); err != nil {
		t.Fatalf("register original workspace binding: %v", err)
	}
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace-2", "/workspace-2"); err == nil {
		t.Fatal("accepted conflicting workspace binding")
	}
	id := "reverse-conflict"
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace-1"}`)})
	if !called || !strings.Contains(writer.String(), `"cwd":"/workspace-1"`) || !strings.Contains(writer.String(), `"generation":`) {
		t.Fatalf("original binding was not preserved with a generation: called=%v response=%s", called, writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_RejectsBindingReleasedWhileResolverRuns(t *testing.T) {
	resolverStarted := make(chan struct{})
	resolverComplete := make(chan struct{})
	writer := &signalingWriteCloser{writes: make(chan struct{}, 2)}
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		close(resolverStarted)
		<-resolverComplete
		return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
	}})
	process := &runtimeProcess{stdin: writer, pending: make(map[string]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor.mu.Lock()
	supervisor.process = process
	supervisor.health.IsReady = true
	supervisor.mu.Unlock()
	startDone := make(chan error, 1)
	go func() {
		_, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: "/workspace", SessionID: "session", Binding: SessionBinding{Version: 1, WorkspaceID: "workspace", OwnerNodeID: "node", CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}})
		startDone <- err
	}()
	<-writer.writes
	id := "reverse-admit"
	handlerDone := make(chan struct{})
	go func() {
		supervisor.handleRuntimeRequest(process, rpcEnvelope{ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace"}`)})
		close(handlerDone)
	}()
	<-resolverStarted
	startID := "dsh-2"
	process.routeResponse(rpcEnvelope{JSONRPC: "2.0", ID: &startID, Result: []byte(`{"sessionId":"other","instanceId":"run"}`)})
	if err := <-startDone; err == nil {
		t.Fatal("StartSession accepted an invalid response")
	}
	close(resolverComplete)
	<-handlerDone

	if !strings.Contains(writer.String(), `"code":-32000`) {
		t.Fatalf("reverse binding response = %s", writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_RejectsBindingReleasedBeforeResponseCommit(t *testing.T) {
	writer := &recordingWriteCloser{}
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
	}})
	lease, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace")
	if err != nil {
		t.Fatalf("register workspace binding: %v", err)
	}
	supervisor.beforeWorkspaceBindingCommit = func() {
		released := make(chan struct{})
		go func() {
			supervisor.releaseWorkspaceBinding(lease)
			close(released)
		}()
		<-released
	}
	id := "reverse-admit"
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{
		ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace"}`),
	})
	if strings.Contains(writer.String(), `"result"`) || !strings.Contains(writer.String(), `"code":-32000`) {
		t.Fatalf("reverse binding response = %s", writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_EmitsCommittedBindingBeforeCancellationRelease(t *testing.T) {
	writer := &recordingWriteCloser{}
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
	}})
	lease, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace")
	if err != nil {
		t.Fatalf("register workspace binding: %v", err)
	}
	supervisor.beforeWorkspaceBindingResponseWrite = func() {
		released := make(chan struct{})
		go func() {
			supervisor.releaseWorkspaceBinding(lease)
			close(released)
		}()
		<-released
	}
	id := "reverse-admit"
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{
		ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace"}`),
	})
	if !strings.Contains(writer.String(), `"result"`) || strings.Contains(writer.String(), `"code":-32000`) {
		t.Fatalf("reverse binding response = %s", writer.String())
	}
	if _, _, authorized := supervisor.getWorkspaceBindingLease("session", "workspace"); authorized {
		t.Fatal("cancellation release was not cleaned up after the committed response")
	}
}

type failingWriteCloser struct{}

func (failingWriteCloser) Write([]byte) (int, error) { return 0, errors.New("write failed") }
func (failingWriteCloser) Close() error              { return nil }

func TestSupervisor_HandleRuntimeRequest_ReleasesCommittedBindingAfterResponseWriteFailure(t *testing.T) {
	supervisor := NewSupervisor(Config{WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
		return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: "/workspace", Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace"); err != nil {
		t.Fatalf("register workspace binding: %v", err)
	}
	id := "reverse-admit"
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: failingWriteCloser{}}, rpcEnvelope{
		ID: &id, Method: yishanWorkspaceBindingResolveMethod, Params: []byte(`{"sessionId":"session","workspaceId":"workspace"}`),
	})
	if _, _, authorized := supervisor.getWorkspaceBindingLease("session", "workspace"); authorized {
		t.Fatal("failed response write retained workspace binding")
	}
}
