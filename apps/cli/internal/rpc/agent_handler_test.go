package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

type recordingAgentFacade struct {
	calls  int
	method string
}

func (s *recordingAgentFacade) called(method string) (any, error) {
	s.calls++
	s.method = method
	return AgentAckResult{Runtime: AgentRuntimePi, OK: true}, nil
}

func (s *recordingAgentFacade) AgentGetCapabilities(context.Context) (any, error) {
	return s.called(MethodAgentGetCapabilities)
}
func (s *recordingAgentFacade) AgentStart(context.Context, *Connection, AgentStartParams) (any, error) {
	return s.called(MethodAgentStart)
}
func (s *recordingAgentFacade) AgentAttach(context.Context, *Connection, AgentAttachParams) (any, error) {
	return s.called(MethodAgentAttach)
}
func (s *recordingAgentFacade) AgentPrompt(context.Context, AgentPromptParams) (any, error) {
	return s.called(MethodAgentPrompt)
}
func (s *recordingAgentFacade) AgentAbort(context.Context, AgentAbortParams) (any, error) {
	return s.called(MethodAgentAbort)
}
func (s *recordingAgentFacade) AgentDispose(context.Context, AgentDisposeParams) (any, error) {
	return s.called(MethodAgentDispose)
}
func (s *recordingAgentFacade) AgentListSessions(context.Context, AgentListSessionsParams) (any, error) {
	return s.called(MethodAgentListSessions)
}
func (s *recordingAgentFacade) AgentReadHistory(context.Context, AgentReadHistoryParams) (any, error) {
	return s.called(MethodAgentReadHistory)
}

func TestAgentHandler_RoutesRuntimeNeutralMethods(t *testing.T) {
	tests := []struct{ method, params string }{
		{MethodAgentStart, `{"runtime":"pi","sessionId":"s","tabId":"t","workspaceId":"w","cwd":"/w"}`},
		{MethodAgentAttach, `{"runtime":"pi","sessionId":"s","workspaceId":"w","cwd":"/w"}`},
		{MethodAgentPrompt, `{"runtime":"pi","sessionId":"s","workspaceId":"w","cwd":"/w","message":"hello","streamingBehavior":"steer"}`},
		{MethodAgentAbort, `{"runtime":"pi","sessionId":"s","workspaceId":"w","cwd":"/w"}`},
		{MethodAgentDispose, `{"runtime":"pi","sessionId":"s","workspaceId":"w","cwd":"/w"}`},
		{MethodAgentListSessions, `{"runtime":"pi","workspaceId":"w","cwd":"/w"}`},
		{MethodAgentReadHistory, `{"runtime":"pi","sessionId":"s","workspaceId":"w","cwd":"/w"}`},
	}
	for _, test := range tests {
		t.Run(test.method, func(t *testing.T) {
			facade := &recordingAgentFacade{}
			handler := &AgentHandler{Agent: facade}
			_, err := handler.Call(context.Background(), &Connection{}, test.method, json.RawMessage(test.params))
			if err != nil || facade.calls != 1 || facade.method != test.method {
				t.Fatalf("Call = %v, calls = %d, method = %q", err, facade.calls, facade.method)
			}
		})
	}
}

func TestAgentHandler_InvalidRuntimeNeutralParamsDoNotCallService(t *testing.T) {
	facade := &recordingAgentFacade{}
	handler := &AgentHandler{Agent: facade}
	_, err := handler.Call(context.Background(), &Connection{}, MethodAgentStart, json.RawMessage(`{`))
	var rpcErr *Error
	if !errors.As(err, &rpcErr) || rpcErr.Code != CodeInvalidParams || facade.calls != 0 {
		t.Fatalf("Call error = %v, calls = %d", err, facade.calls)
	}
}

type recordingAgentCatalog struct{ method string }

func (s *recordingAgentCatalog) AgentListDetectionStatuses(context.Context, json.RawMessage) (any, error) {
	s.method = MethodAgentListDetectionStatuses
	return s.method, nil
}
func (s *recordingAgentCatalog) AgentListModels(context.Context, SystemAgentListModelsParams) (any, error) {
	s.method = MethodAgentListModels
	return s.method, nil
}

func TestAgentHandler_PreservesExistingCatalogRoutes(t *testing.T) {
	for _, method := range []string{MethodAgentListDetectionStatuses, MethodAgentListModels} {
		t.Run(method, func(t *testing.T) {
			catalog := &recordingAgentCatalog{}
			handler := &AgentHandler{Catalog: catalog}
			got, err := handler.Call(context.Background(), &Connection{}, method, json.RawMessage(`{}`))
			if err != nil || got != method || catalog.method != method {
				t.Fatalf("Call = %v, result = %v, catalog method = %q", err, got, catalog.method)
			}
		})
	}
}
