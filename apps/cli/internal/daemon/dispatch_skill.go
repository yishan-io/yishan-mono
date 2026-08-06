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
		return h.handleSkillList()
	case MethodSkillInfo:
		return h.handleSkillInfo(params)
	case MethodSkillDetail:
		return h.handleSkillDetail(params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

// activeWorkspaceRoot returns the worktree path of the workspace currently
// selected in the desktop, or "" when none is selected (used to surface
// project-level skills in the skill list).
func (h *JSONRPCHandler) activeWorkspaceRoot() string {
	state := h.context.GetState()
	workspaceID, _ := state["activeWorkspaceId"].(string)
	if workspaceID == "" {
		return ""
	}
	ws, err := h.manager.GetWorkspace(workspaceID)
	if err != nil {
		return ""
	}
	return ws.Path
}

func (h *JSONRPCHandler) handleSkillList() (any, error) {
	skills, err := setup.ListSkills(h.activeWorkspaceRoot())
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	return map[string]any{"skills": skills}, nil
}

func (h *JSONRPCHandler) handleSkillInfo(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	info, err := setup.GetSkillInfo(name, h.activeWorkspaceRoot())
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
	}
	return info, nil
}

func (h *JSONRPCHandler) handleSkillDetail(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	detail, err := setup.GetSkillDetail(name, h.activeWorkspaceRoot())
	if err != nil {
		return nil, workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
	}
	return detail, nil
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
