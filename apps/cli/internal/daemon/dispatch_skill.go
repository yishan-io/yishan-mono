package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/workspace"
)

func (h *JSONRPCHandler) dispatchSkill(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodSkillList:
		return handleSkillList()
	case MethodSkillInfo:
		return handleSkillInfo(params)
	case MethodSkillAdd:
		return handleSkillAdd(params)
	case MethodSkillRemove:
		return handleSkillRemove(params)
	case MethodSkillUpdate:
		return handleSkillUpdate(params)
	case MethodSkillDetail:
		return handleSkillDetail(params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

func handleSkillList() (any, error) {
	skills, err := setup.ListSkills()
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	return map[string]any{"skills": skills}, nil
}

func handleSkillInfo(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	info, err := setup.GetSkillInfo(name)
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
	}
	return info, nil
}

func handleSkillDetail(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	detail, err := setup.GetSkillDetail(name)
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
	}
	return detail, nil
}

func handleSkillAdd(params json.RawMessage) (any, error) {
	source, err := parseSkillSourceParam(params)
	if err != nil {
		return nil, err
	}
	if _, err := setup.AddSkill(source); err != nil {
		return nil, fmt.Errorf("add skill %q: %w", source, err)
	}
	return map[string]bool{"ok": true}, nil
}

func handleSkillRemove(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if err := setup.RemoveSkill(name); err != nil {
		return nil, fmt.Errorf("remove skill %q: %w", name, err)
	}
	return map[string]bool{"ok": true}, nil
}

func handleSkillUpdate(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if _, err := setup.UpdateSkill(name); err != nil {
		return nil, fmt.Errorf("update skill %q: %w", name, err)
	}
	return map[string]bool{"ok": true}, nil
}

func parseSkillNameParam(params json.RawMessage) (string, error) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeParams(params, &req); err != nil {
		return "", err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "name is required")
	}
	return name, nil
}

func parseSkillSourceParam(params json.RawMessage) (string, error) {
	var req struct {
		Source string `json:"source"`
	}
	if err := decodeParams(params, &req); err != nil {
		return "", err
	}
	source := strings.TrimSpace(req.Source)
	if source == "" {
		return "", workspace.NewRPCError(rpcCodeInvalidParams, "source is required")
	}
	return source, nil
}
