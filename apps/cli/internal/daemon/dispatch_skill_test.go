package daemon

import (
	"encoding/json"
	"testing"

	setup "yishan/apps/cli/internal/agentsetup"
)

func TestDispatchSkillListIncludesOfficialSkills(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	result, err := handleSkillList()
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
		t.Fatalf("expected no standalone official skills, got %#v", skills)
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
