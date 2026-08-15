package node

import (
	"context"
	"errors"
	"fmt"
	"strings"

	setup "yishan/apps/cli/internal/agent/setup"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/rpcerror"
	"yishan/apps/cli/internal/workspace"
)

// SkillService implementation. Each method performs one skill operation via
// the setup package; RPC decoding happens in the agent handler.

func (s *Services) SkillList(ctx context.Context) (any, error) {
	skills, err := setup.ListSkills(s.activeWorkspaceRoot())
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	return map[string]any{"skills": skills}, nil
}

func (s *Services) SkillInfo(ctx context.Context, req rpc.SkillNameParams) (any, error) {
	name, err := requireSkillName(req.Name)
	if err != nil {
		return nil, err
	}
	info, err := setup.GetSkillInfo(name, s.activeWorkspaceRoot())
	if err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, err.Error())
	}
	return info, nil
}

func (s *Services) SkillDetail(ctx context.Context, req rpc.SkillNameParams) (any, error) {
	name, err := requireSkillName(req.Name)
	if err != nil {
		return nil, err
	}
	detail, err := setup.GetSkillDetail(name, s.activeWorkspaceRoot())
	if err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, err.Error())
	}
	return detail, nil
}

func (s *Services) SkillAdd(ctx context.Context, req rpc.SkillSourceParams) (any, error) {
	source, err := requireSkillSource(req.Source)
	if err != nil {
		return nil, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.AddSkill(commandCtx, source); err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, "add skill: "+err.Error())
	}
	return map[string]any{"added": true}, nil
}

// SkillRemove implements skill.remove with the desktop gating: only
// user-installed global skills (~/.agents/skills, CLI-managed) may be removed.
func (s *Services) SkillRemove(ctx context.Context, req rpc.SkillNameParams) (any, error) {
	name, err := requireSkillName(req.Name)
	if err != nil {
		return nil, err
	}
	if rejectErr := s.skillLifecycleTargetError(name); rejectErr != nil {
		return nil, rejectErr
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.RemoveSkill(commandCtx, name); err != nil {
		if errors.Is(err, setup.ErrInvalidSkillName) {
			return nil, workspace.NewRPCError(rpcerror.CodeInvalidParams, err.Error())
		}
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, "remove skill: "+err.Error())
	}
	return map[string]any{"removed": true}, nil
}

func (s *Services) SkillUpdate(ctx context.Context, req rpc.SkillNameParams) (any, error) {
	name, err := requireSkillName(req.Name)
	if err != nil {
		return nil, err
	}
	if rejectErr := s.skillLifecycleTargetError(name); rejectErr != nil {
		return nil, rejectErr
	}
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.UpdateSkill(commandCtx, name); err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, "update skill: "+err.Error())
	}
	return map[string]any{"updated": true}, nil
}

func (s *Services) SkillUpdateAll(ctx context.Context) (any, error) {
	commandCtx, cancel := context.WithTimeout(ctx, managedCommandTimeout)
	defer cancel()
	if err := setup.UpdateAllSkills(commandCtx); err != nil {
		return nil, workspace.NewRPCError(rpcerror.CodeServerError, "update all skills: "+err.Error())
	}
	return map[string]any{"updated": true}, nil
}

func requireSkillName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", workspace.NewRPCError(rpcerror.CodeInvalidParams, "name is required")
	}
	return name, nil
}

func requireSkillSource(source string) (string, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return "", workspace.NewRPCError(rpcerror.CodeInvalidParams, "source is required")
	}
	return source, nil
}

// skillLifecycleTargetError returns a rejection reason when the skill name is
// not a valid update/remove target, mirroring the desktop gating: only
// user-installed global skills (~/.agents/skills, CLI-managed) may be updated
// or removed. Unknown names (not in the daemon list) are allowed through to
// the CLI/fallback handling.
func (s *Services) skillLifecycleTargetError(name string) error {
	info, err := setup.GetSkillInfo(name, s.activeWorkspaceRoot())
	if err != nil {
		return nil
	}
	if info.Official {
		return workspace.NewRPCError(rpcerror.CodeInvalidParams, "official skills ship inside Yishan packages and are updated via the extensions panel")
	}
	if info.SourceKind != setup.SkillSourceGlobal {
		return workspace.NewRPCError(rpcerror.CodeInvalidParams, fmt.Sprintf("%s skills are managed by their source and cannot be updated or removed here", info.SourceKind))
	}
	return nil
}

// activeWorkspaceRoot returns the worktree path of the workspace currently
// selected in the desktop, or "" when none is selected (used to surface
// project-level skills in the skill list).
func (s *Services) activeWorkspaceRoot() string {
	state := s.context.GetState()
	workspaceID, _ := state["activeWorkspaceId"].(string)
	if workspaceID == "" {
		return ""
	}
	ws, err := s.getWorkspace(workspaceID)
	if err != nil {
		return ""
	}
	return ws.Path
}
