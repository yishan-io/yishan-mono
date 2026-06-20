package daemon

import (
	"context"
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
	if len(skills) == 0 || skills[0].Name == "" {
		t.Fatalf("expected official skills in list, got %#v", skills)
	}
}

func TestDispatchSkillAddInfoUpdateAndRemove(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	handler := newTestHandler(t)

	addParams := mustMarshalSkillParams(t, map[string]any{"source": setup.StartSkillName})
	if _, err := handler.dispatchSkill(context.Background(), MethodSkillAdd, addParams); err != nil {
		t.Fatalf("dispatch add: %v", err)
	}

	infoParams := mustMarshalSkillParams(t, map[string]any{"name": setup.StartSkillName})
	infoResult, err := handler.dispatchSkill(context.Background(), MethodSkillInfo, infoParams)
	if err != nil {
		t.Fatalf("dispatch info: %v", err)
	}
	info, ok := infoResult.(*setup.SkillInfo)
	if !ok {
		t.Fatalf("expected *setup.SkillInfo, got %T", infoResult)
	}
	if !info.Installed || info.SourceKind != setup.SkillSourceOfficial {
		t.Fatalf("unexpected info payload: %#v", info)
	}

	if _, err := handler.dispatchSkill(context.Background(), MethodSkillUpdate, infoParams); err != nil {
		t.Fatalf("dispatch update: %v", err)
	}
	if _, err := handler.dispatchSkill(context.Background(), MethodSkillRemove, infoParams); err != nil {
		t.Fatalf("dispatch remove: %v", err)
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
