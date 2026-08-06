package daemon

import (
	"encoding/json"
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
