package dsh

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestSupervisor_HandleRuntimeRequest_ExecutesAuthorizedWorkspaceList(t *testing.T) {
	writer := &recordingWriteCloser{}
	called := false
	supervisor := NewSupervisor(Config{CapabilityResolver: func(ctx context.Context, request CapabilityRequest) (any, error) {
		called = true
		if request.Operation != "workspace.list" || request.SessionID != "session" || request.CancellationID != "cancel" {
			t.Fatalf("request = %#v", request)
		}
		var input map[string]any
		if err := json.Unmarshal(request.Input, &input); err != nil || len(input) != 0 {
			t.Fatalf("input = %s err=%v", request.Input, err)
		}
		if _, hasDeadline := ctx.Deadline(); !hasDeadline {
			t.Fatal("resolver context has no deadline")
		}
		return map[string]any{"workspaces": []map[string]string{{"id": "workspace"}}}, nil
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace"); err != nil {
		t.Fatalf("register workspace binding: %v", err)
	}
	identity, _, authorized := supervisor.getWorkspaceBindingLease("session", "workspace")
	if !authorized {
		t.Fatal("workspace binding was not authorized")
	}
	id := "reverse-capability"
	deadline := time.Now().Add(time.Minute).UnixMilli()
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanCapabilityRequestMethod, Params: []byte(`{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":` + strconv.FormatUint(identity.generation, 10) + `,"deadlineAtMs":` + strconv.FormatInt(deadline, 10) + `,"operation":"workspace.list","input":{}}`)})
	if !called || !strings.Contains(writer.String(), `"workspaces":[{"id":"workspace"}]`) {
		t.Fatalf("called=%v response=%s", called, writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_ExecutesAuthorizedMemoryStore(t *testing.T) {
	writer := &recordingWriteCloser{}
	supervisor := NewSupervisor(Config{CapabilityResolver: func(_ context.Context, request CapabilityRequest) (any, error) {
		var input struct {
			Section string `json:"section"`
			Entry   string `json:"entry"`
		}
		if err := json.Unmarshal(request.Input, &input); err != nil || input.Section != "locked_decisions" || input.Entry != "Use typed capabilities" {
			t.Fatalf("request = %#v err=%v", request, err)
		}
		return map[string]string{"path": "/workspace/.my-context/MEMORY.md", "section": input.Section}, nil
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace"); err != nil {
		t.Fatal(err)
	}
	identity, _, _ := supervisor.getWorkspaceBindingLease("session", "workspace")
	id := "reverse-memory"
	params := `{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":` + strconv.FormatUint(identity.generation, 10) + `,"deadlineAtMs":` + strconv.FormatInt(time.Now().Add(time.Minute).UnixMilli(), 10) + `,"operation":"memory.store","input":{"section":"locked_decisions","entry":"Use typed capabilities","date":"2026-09-01"}}`
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanCapabilityRequestMethod, Params: []byte(params)})
	if !strings.Contains(writer.String(), `"section":"locked_decisions"`) {
		t.Fatalf("response=%s", writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_ForwardsDomainOwnedOperation(t *testing.T) {
	writer := &recordingWriteCloser{}
	called := false
	supervisor := NewSupervisor(Config{CapabilityResolver: func(_ context.Context, request CapabilityRequest) (any, error) {
		called = request.Operation == "domain.inspect" && string(request.Input) == `{"value":true}`
		return map[string]bool{"ok": true}, nil
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace"); err != nil {
		t.Fatal(err)
	}
	identity, _, _ := supervisor.getWorkspaceBindingLease("session", "workspace")
	id := "reverse-domain"
	params := `{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":` + strconv.FormatUint(identity.generation, 10) + `,"deadlineAtMs":` + strconv.FormatInt(time.Now().Add(time.Minute).UnixMilli(), 10) + `,"operation":"domain.inspect","input":{"value":true}}`
	supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanCapabilityRequestMethod, Params: []byte(params)})
	if !called || !strings.Contains(writer.String(), `"ok":true`) {
		t.Fatalf("called=%v response=%s", called, writer.String())
	}
}

func TestSupervisor_HandleRuntimeRequest_RejectsUnauthorizedOrInvalidCapability(t *testing.T) {
	testCases := []struct {
		name   string
		params string
	}{
		{"non-object input", `{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":1,"deadlineAtMs":4102444800000,"operation":"workspace.list","input":[]}`},
		{"expired deadline", `{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":1,"deadlineAtMs":1,"operation":"workspace.list","input":{}}`},
		{"wrong generation", `{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":999,"deadlineAtMs":4102444800000,"operation":"workspace.list","input":{}}`},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			writer := &recordingWriteCloser{}
			called := false
			supervisor := NewSupervisor(Config{CapabilityResolver: func(context.Context, CapabilityRequest) (any, error) {
				called = true
				return nil, nil
			}})
			if _, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace"); err != nil {
				t.Fatalf("register workspace binding: %v", err)
			}
			id := "reverse-capability"
			supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanCapabilityRequestMethod, Params: []byte(testCase.params)})
			if called || !strings.Contains(writer.String(), `"code":-32602`) && !strings.Contains(writer.String(), `"code":-32000`) {
				t.Fatalf("called=%v response=%s", called, writer.String())
			}
		})
	}
}

func TestSupervisor_HandleRuntimeRequest_CancelsResolverOnSupervisorShutdown(t *testing.T) {
	writer := &recordingWriteCloser{}
	started := make(chan struct{})
	cancelled := make(chan struct{})
	supervisor := NewSupervisor(Config{CapabilityResolver: func(ctx context.Context, _ CapabilityRequest) (any, error) {
		close(started)
		<-ctx.Done()
		close(cancelled)
		return nil, ctx.Err()
	}})
	if _, err := supervisor.registerWorkspaceBinding("session", "workspace", "/workspace"); err != nil {
		t.Fatalf("register workspace binding: %v", err)
	}
	identity, _, _ := supervisor.getWorkspaceBindingLease("session", "workspace")
	id := "reverse-capability"
	params := `{"id":"request","cancellationId":"cancel","sessionId":"session","workspaceId":"workspace","generation":` + strconv.FormatUint(identity.generation, 10) + `,"deadlineAtMs":` + strconv.FormatInt(time.Now().Add(time.Minute).UnixMilli(), 10) + `,"operation":"workspace.list","input":{}}`
	done := make(chan struct{})
	go func() {
		supervisor.handleRuntimeRequest(&runtimeProcess{stdin: writer}, rpcEnvelope{ID: &id, Method: yishanCapabilityRequestMethod, Params: []byte(params)})
		close(done)
	}()
	<-started
	supervisor.cancel()
	<-cancelled
	<-done
	if !strings.Contains(writer.String(), "daemon capability cancelled") {
		t.Fatalf("response=%s", writer.String())
	}
}
