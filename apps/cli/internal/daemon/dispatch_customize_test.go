package daemon

import (
	"context"
	"errors"
	"testing"

	setup "yishan/apps/cli/internal/agent/setup"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestDispatchCustomizeExtensionsList_OnCleanHome(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)

	result, err := handler.CustomizeExtensionsList(context.Background())
	if err != nil {
		t.Fatalf("CustomizeExtensionsList: %v", err)
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
	_, err := handler.callRPCForTest(context.Background(), "customize.themes.list", nil)
	assertRPCErrorCode(t, err, rpcCodeMethodNotFound)
}

func TestDispatchCustomizeExtensions_UnknownMethod(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.callRPCForTest(context.Background(), "customize.extensions.frobnicate", nil)
	assertRPCErrorCode(t, err, rpcCodeMethodNotFound)
}

func TestHandleCustomizeExtensionsInstall_MissingSource(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeExtensionsInstall(context.Background(), rpc.CustomizeExtensionSourceParams{})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeExtensionsRemove_MissingSource(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeExtensionsRemove(context.Background(), rpc.CustomizeExtensionSourceParams{})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeExtensionsRemove_OfficialRejected(t *testing.T) {
	// Official extensions are rejected even on a clean home (they are listed
	// as managed defaults by ListPiExtensions).
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeExtensionsRemove(context.Background(), rpc.CustomizeExtensionSourceParams{Source: "npm:@yishan-io/pi-notify"})
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
		_, err := handler.callRPCForTest(context.Background(), method, mustMarshalSkillParams(t, map[string]any{}))
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

	result, err := handler.CustomizeAgentsList(context.Background())
	if err != nil {
		t.Fatalf("CustomizeAgentsList: %v", err)
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
	_, err := handler.CustomizeAgentsCreate(context.Background(), rpc.CustomizeAgentCreateParams{Name: "helper", Description: "d"})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsCreate_InvalidName(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeAgentsCreate(context.Background(), rpc.CustomizeAgentCreateParams{Name: "My Agent", Description: "d", Content: "body"})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsCreate_ManagedNameRejected(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeAgentsCreate(context.Background(), rpc.CustomizeAgentCreateParams{Name: "general", Description: "d", Content: "body"})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsCreate_WritesToolsFrontmatter(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	result, err := handler.CustomizeAgentsCreate(context.Background(), rpc.CustomizeAgentCreateParams{
		Name:        "tool-helper",
		Description: "Helper",
		Content:     "# body\n",
		Tools:       []string{"read", "grep"},
	})
	if err != nil {
		t.Fatalf("CustomizeAgentsCreate: %v", err)
	}
	if created, ok := result.(map[string]any)["created"]; !ok || created != true {
		t.Fatalf("expected created response, got %#v", result)
	}
	detail, err := setup.GetPiAgentDetail("tool-helper")
	if err != nil {
		t.Fatalf("GetPiAgentDetail: %v", err)
	}
	if len(detail.Tools) != 2 || detail.Tools[0] != "read" || detail.Tools[1] != "grep" {
		t.Fatalf("expected tools in created agent, got %#v", detail.Tools)
	}
}

func TestHandleCustomizeAgentsRemove_OfficialRejected(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeAgentsRemove(context.Background(), rpc.CustomizeAgentNameParams{Name: "general"})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsRestore_UserAgentNotManaged(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeAgentsRestore(context.Background(), rpc.CustomizeAgentNameParams{Name: "custom-helper"})
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleCustomizeAgentsDetail_UnknownName(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newSkillTestHandler(t)
	_, err := handler.CustomizeAgentsDetail(context.Background(), rpc.CustomizeAgentNameParams{Name: "missing-agent"})
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
		_, err := handler.callRPCForTest(context.Background(), method, mustMarshalSkillParams(t, map[string]any{}))
		if err == nil {
			continue
		}
		assertNotRPCErrorCode(t, err, rpcCodeMethodNotFound, method)
	}
}
