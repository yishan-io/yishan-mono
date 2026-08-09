package daemon

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/workspace"
)

func newSkillTestHandler(t *testing.T) *JSONRPCHandler {
	t.Helper()
	return NewJSONRPCHandler(
		workspace.NewManager(),
		nil,
		"node-1",
		filepath.Join(t.TempDir(), "daemon.log"),
		nil,
		filepath.Join(t.TempDir(), "config.yml"),
		NewAppContextStore(""),
	)
}

// TestDispatchSkillListEmptyOnCleanHome verifies skill.list returns no skills
// when no pi source dirs and no registry exist yet.
func TestDispatchSkillListEmptyOnCleanHome(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	handler := newSkillTestHandler(t)
	result, err := handler.handleSkillList()
	if err != nil {
		t.Fatalf("handleSkillList: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	skills, ok := payload["skills"].([]setup.SkillInfo)
	if !ok {
		t.Fatalf("expected []setup.SkillInfo, got %T", payload["skills"])
	}
	if len(skills) != 0 {
		t.Fatalf("expected no skills on clean home, got %#v", skills)
	}
}

func mustMarshalSkillParams(t *testing.T, payload map[string]any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	return raw
}

func TestHandleSkillAdd_MissingSource(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleSkillAdd(context.Background(), mustMarshalSkillParams(t, map[string]any{}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleSkillUpdate_MissingName(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleSkillUpdate(context.Background(), mustMarshalSkillParams(t, map[string]any{}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleSkillRemove_InvalidName(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleSkillRemove(context.Background(), mustMarshalSkillParams(t, map[string]any{"name": "../evil"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleSkillRemove_OfficialSkillRejected(t *testing.T) {
	withOfficialPackageSkillHome(t)
	handler := newSkillTestHandler(t)
	_, err := handler.handleSkillRemove(context.Background(), mustMarshalSkillParams(t, map[string]any{"name": "starting-task"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestHandleSkillUpdate_OfficialSkillRejected(t *testing.T) {
	withOfficialPackageSkillHome(t)
	handler := newSkillTestHandler(t)
	_, err := handler.handleSkillUpdate(context.Background(), mustMarshalSkillParams(t, map[string]any{"name": "starting-task"}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

// withOfficialPackageSkillHome lays out a temp pi home with an official
// @yishan-io package skill so the lifecycle guards can classify it.
func withOfficialPackageSkillHome(t *testing.T) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	homeDir, _ := os.UserHomeDir()
	agentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	skillDir := filepath.Join(agentDir, "npm", "node_modules", "@yishan-io", "pi-task", "skills", "starting-task")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatalf("create package skill dir: %v", err)
	}
	pkgJSON := []byte(`{"name":"@yishan-io/pi-task","version":"1.0.0","pi":{"skills":["./skills"]}}`)
	if err := os.WriteFile(filepath.Join(agentDir, "npm", "node_modules", "@yishan-io", "pi-task", "package.json"), pkgJSON, 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}
	if err := os.WriteFile(filepath.Join(agentDir, "settings.json"), []byte(`{"packages":["npm:@yishan-io/pi-task"]}`), 0o644); err != nil {
		t.Fatalf("write settings.json: %v", err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("---\nname: starting-task\ndescription: Start tasks\n---\n"), 0o644); err != nil {
		t.Fatalf("write SKILL.md: %v", err)
	}
}

func TestHandleSkillRemove_MissingName(t *testing.T) {
	handler := newSkillTestHandler(t)
	_, err := handler.handleSkillRemove(context.Background(), mustMarshalSkillParams(t, map[string]any{}))
	assertRPCErrorCode(t, err, rpcCodeInvalidParams)
}

func TestDispatchSkill_RoutesMutationMethods(t *testing.T) {
	handler := newSkillTestHandler(t)
	for _, method := range []string{MethodSkillAdd, MethodSkillRemove, MethodSkillUpdate, MethodSkillUpdateAll} {
		_, err := handler.dispatchSkill(context.Background(), method, mustMarshalSkillParams(t, map[string]any{}))
		assertNotRPCErrorCode(t, err, rpcCodeMethodNotFound, method)
	}
}
