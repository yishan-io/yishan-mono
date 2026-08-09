package daemon

import (
	"context"
	"encoding/json"
	"errors"
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
	case MethodSkillAdd:
		return h.handleSkillAdd(ctx, params)
	case MethodSkillRemove:
		return h.handleSkillRemove(ctx, params)
	case MethodSkillUpdate:
		return h.handleSkillUpdate(ctx, params)
	case MethodSkillUpdateAll:
		return h.handleSkillUpdateAll(ctx)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

func (h *JSONRPCHandler) handleSkillAdd(ctx context.Context, params json.RawMessage) (any, error) {
	source, err := parseSkillSourceParam(params)
	if err != nil {
		return nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.AddSkill(commandCtx, source); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "add skill: "+err.Error())
	}
	return map[string]any{"added": true}, nil
}

// skillLifecycleTargetError returns a rejection reason when the skill name is
// not a valid update/remove target, mirroring the desktop gating: only
// user-installed global skills (~/.agents/skills, CLI-managed) may be updated
// or removed. Unknown names (not in the daemon list) are allowed through to
// the CLI/fallback handling.
func (h *JSONRPCHandler) skillLifecycleTargetError(name string) error {
	info, err := setup.GetSkillInfo(name, h.activeWorkspaceRoot())
	if err != nil {
		return nil
	}
	if info.Official {
		return workspace.NewRPCError(rpcCodeInvalidParams, "official skills ship inside Yishan packages and are updated via the extensions panel")
	}
	if info.SourceKind != setup.SkillSourceGlobal {
		return workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("%s skills are managed by their source and cannot be updated or removed here", info.SourceKind))
	}
	return nil
}

func (h *JSONRPCHandler) handleSkillRemove(ctx context.Context, params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if rejectErr := h.skillLifecycleTargetError(name); rejectErr != nil {
		return nil, rejectErr
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.RemoveSkill(commandCtx, name); err != nil {
		if errors.Is(err, setup.ErrInvalidSkillName) {
			return nil, workspace.NewRPCError(rpcCodeInvalidParams, err.Error())
		}
		return nil, workspace.NewRPCError(rpcCodeServerError, "remove skill: "+err.Error())
	}
	return map[string]any{"removed": true}, nil
}

func (h *JSONRPCHandler) handleSkillUpdate(ctx context.Context, params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if rejectErr := h.skillLifecycleTargetError(name); rejectErr != nil {
		return nil, rejectErr
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.UpdateSkill(commandCtx, name); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "update skill: "+err.Error())
	}
	return map[string]any{"updated": true}, nil
}

func (h *JSONRPCHandler) handleSkillUpdateAll(ctx context.Context) (any, error) {
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.UpdateAllSkills(commandCtx); err != nil {
		return nil, workspace.NewRPCError(rpcCodeServerError, "update all skills: "+err.Error())
	}
	return map[string]any{"updated": true}, nil
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
