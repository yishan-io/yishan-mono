package node

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	piauth "yishan/apps/cli/internal/agent/auth"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/rpcerror"
)

func newPiAuthTestHandler(t *testing.T) *Service {
	t.Helper()
	s := newTestHandler(t)
	s.deps.PIAuth = piauth.NewStore(
		t.TempDir(),
		piauth.WithLockPolicy(piauth.LockPolicy{MaxAttempts: 3, MinDelay: 5 * time.Millisecond, MaxDelay: 10 * time.Millisecond}),
		piauth.WithAmbientDetector(func(string) string { return "" }), // hermetic
	)
	return s
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal test params: %v", err)
	}
	return raw
}

func assertRPCErrorCode(t *testing.T, err error, wantCode int) {
	t.Helper()
	var rpcErr *workspace.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("error = %v, want *workspace.RPCError", err)
	}
	if rpcErr.Code != wantCode {
		t.Fatalf("RPC error code = %d (%s), want %d", rpcErr.Code, rpcErr.Message, wantCode)
	}
}

func writeAuthFile(t *testing.T, dir string, content string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir auth dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), []byte(content), 0o600); err != nil {
		t.Fatalf("seed auth file: %v", err)
	}
}

func TestPiProviderDispatch_RoundTrip(t *testing.T) {
	s := newPiAuthTestHandler(t)

	saveResult, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiSaveProvider,
		mustJSON(t, map[string]any{"provider": "deepseek", "key": "sk-roundtrip"}))
	if err != nil {
		t.Fatalf("saveProvider: %v", err)
	}
	if ok, _ := saveResult.(map[string]bool)["ok"]; !ok {
		t.Fatalf("saveProvider result = %v, want ok", saveResult)
	}

	listResult, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiListProviders, nil)
	if err != nil {
		t.Fatalf("listProviders: %v", err)
	}
	payload := listResult.(map[string]any)
	providers := payload["providers"].([]piauth.Entry)
	if len(providers) != 1 || providers[0].Provider != "deepseek" || providers[0].Type != "api_key" {
		t.Fatalf("listProviders = %+v, want one deepseek/api_key entry", providers)
	}

	removeResult, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiRemoveProvider,
		mustJSON(t, map[string]any{"provider": "deepseek"}))
	if err != nil {
		t.Fatalf("removeProvider: %v", err)
	}
	if ok, _ := removeResult.(map[string]bool)["ok"]; !ok {
		t.Fatalf("removeProvider result = %v, want ok", removeResult)
	}

	listResult, err = s.callAgentRPCForTest(context.Background(), nil, MethodPiListProviders, nil)
	if err != nil {
		t.Fatalf("listProviders after remove: %v", err)
	}
	if providers := listResult.(map[string]any)["providers"].([]piauth.Entry); len(providers) != 0 {
		t.Fatalf("listProviders after remove = %+v, want empty", providers)
	}
}

func TestPiProviderDispatch_InvalidParams(t *testing.T) {
	s := newPiAuthTestHandler(t)

	cases := []struct {
		name string
		body any
	}{
		{name: "empty provider", body: map[string]any{"provider": "", "key": "sk-x"}},
		{name: "empty key and env", body: map[string]any{"provider": "deepseek", "key": " "}},
		{name: "non-allowlisted provider", body: map[string]any{"provider": "openai-codex", "key": "sk-x"}},
		{name: "malformed json", body: "not-an-object"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiSaveProvider, mustJSON(t, tc.body))
			assertRPCErrorCode(t, err, rpcerror.CodeInvalidParams)
		})
	}

	_, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiRemoveProvider, mustJSON(t, map[string]any{"provider": "  "}))
	assertRPCErrorCode(t, err, rpcerror.CodeInvalidParams)
}

func TestPiProviderDispatch_UnknownMethodStaysNotFound(t *testing.T) {
	s := newPiAuthTestHandler(t)
	_, err := s.callAgentRPCForTest(context.Background(), nil, "pi.unknownMethod", nil)
	assertRPCErrorCode(t, err, rpcerror.CodeMethodNotFound)
}

func TestPiProviderDispatch_CorruptAuthFileIsServerError(t *testing.T) {
	s := newTestHandler(t)
	dir := t.TempDir()
	writeAuthFile(t, dir, "{ broken")
	s.deps.PIAuth = piauth.NewStore(dir, piauth.WithLockPolicy(
		piauth.LockPolicy{MaxAttempts: 3, MinDelay: 5 * time.Millisecond, MaxDelay: 10 * time.Millisecond},
	))

	_, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiListProviders, nil)
	assertRPCErrorCode(t, err, rpcerror.CodeServerError)
}

func TestPiProviderDispatch_NilStoreIsServerError(t *testing.T) {
	s := newTestHandler(t)
	s.deps.PIAuth = nil
	_, err := s.callAgentRPCForTest(context.Background(), nil, MethodPiListProviders, nil)
	assertRPCErrorCode(t, err, rpcerror.CodeServerError)
}
