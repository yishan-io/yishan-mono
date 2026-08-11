package daemon

import (
	"context"
	"errors"
	"testing"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/workspace"
)

func TestDispatchCustomizeExtensionsList_OnCleanHome(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)

	result, err := handler.handleCustomizeExtensionsList(context.Background())
	if err != nil {
		t.Fatalf("handleCustomizeExtensionsList: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	extensions, ok := payload["extensions"].([]setup.PiExtensionInfo)
	if !ok {
		t.Fatalf("expected []PiExtensionInfo, got %T", payload["extensions"])
	}
	if len(extensions) == 0 {
		t.Fatal("expected default extensions listed on clean home")
	}
	for _, ext := range extensions {
		if !ext.Official {
			t.Fatalf("expected only official extensions on clean home, got %#v", ext)
		}
	}
}

func TestDispatchCustomize_UnknownNamespace(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.dispatchCustomize(context.Background(), "customize.themes.list", nil)
	assertRPCErrorCode(t, err, rpcCodeMethodNotFound)
}

func TestDispatchCustomizeExtensions_UnknownMethod(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.dispatchCustomizeExtensions(context.Background(), "customize.extensions.frobnicate", nil)
	assertRPCErrorCode(t, err, rpcCodeMethodNotFound)
}

func TestHandleCustomizeExtensionsInstall_MissingSource(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeExtensionsInstall(context.Background(), mustMarshalSkillParams(t, map[string]any{}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeExtensionsRemove_MissingSource(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeExtensionsRemove(context.Background(), mustMarshalSkillParams(t, map[string]any{}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeExtensionsRemove_OfficialRejected(t *testing.T) {
	// Official extensions are rejected even on a clean home (they are listed
	// as managed defaults by ListPiExtensions).
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeExtensionsRemove(context.Background(), mustMarshalSkillParams(t, map[string]any{"source": "npm:@yishan-io/pi-notify"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestDispatchCustomize_RoutesExtensionsMethods(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)

	for _, method := range []string{
		MethodCustomizeExtensionsList,
		MethodCustomizeExtensionsInstall,
		MethodCustomizeExtensionsRemove,
		MethodCustomizeExtensionsUpdate,
	} {
		_, err := handler.dispatchCustomize(context.Background(), method, mustMarshalSkillParams(t, map[string]any{}))
		if err == nil {
			continue // list succeeds on clean home; mutations fail on missing params
		}
		assertNotRPCErrorCode(t, err, rpcCodeMethodNotFound, method)
	}
}

// assertNotRPCErrorCode fails when err is a method-not-found RPC error, used to
// prove a method routed into the customize namespace rather than falling
// through to the unknown-method branch.
func assertNotRPCErrorCode(t *testing.T, err error, notWantCode int, method string) {
	t.Helper()
	var rpcErr *workspace.RPCError
	if errors.As(err, &rpcErr) && rpcErr.Code == notWantCode {
		t.Fatalf("%s: expected routing into customize namespace, got method-not-found", method)
	}
}

func TestDispatchCustomizeAgentsList_OnCleanHome(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)

	result, err := handler.handleCustomizeAgentsList()
	if err != nil {
		t.Fatalf("handleCustomizeAgentsList: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	agents, ok := payload["agents"].([]setup.PiAgentInfo)
	if !ok {
		t.Fatalf("expected []PiAgentInfo, got %T", payload["agents"])
	}
	if len(agents) != 0 {
		t.Fatalf("expected no agents on clean home, got %#v", agents)
	}
}

func TestHandleCustomizeAgentsCreate_MissingContent(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeAgentsCreate(mustMarshalSkillParams(t, map[string]any{"name": "helper", "description": "d"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsCreate_InvalidName(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeAgentsCreate(mustMarshalSkillParams(t, map[string]any{"name": "My Agent", "description": "d", "content": "body"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsCreate_ManagedNameRejected(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeAgentsCreate(mustMarshalSkillParams(t, map[string]any{"name": "general", "description": "d", "content": "body"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsRemove_OfficialRejected(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeAgentsRemove(mustMarshalSkillParams(t, map[string]any{"name": "general"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsRestore_UserAgentNotManaged(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeAgentsRestore(mustMarshalSkillParams(t, map[string]any{"name": "custom-helper"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsDetail_UnknownName(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.handleCustomizeAgentsDetail(mustMarshalSkillParams(t, map[string]any{"name": "missing-agent"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestDispatchCustomize_RoutesAgentsMethods(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	for _, method := range []string{
		MethodCustomizeAgentsList,
		MethodCustomizeAgentsDetail,
		MethodCustomizeAgentsCreate,
		MethodCustomizeAgentsUpdate,
		MethodCustomizeAgentsRemove,
		MethodCustomizeAgentsRestore,
	} {
		_, err := handler.dispatchCustomize(context.Background(), method, mustMarshalSkillParams(t, map[string]any{}))
		if err == nil {
			continue
		}
		assertNotRPCErrorCode(t, err, rpcCodeMethodNotFound, method)
	}
}
