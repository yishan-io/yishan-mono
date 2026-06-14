package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/workspace"
)

// skillInfo describes one built-in skill returned by skill.list.
type skillInfo struct {
	Name               string   `json:"name"`
	Description        string   `json:"description"`
	Installed          bool     `json:"installed"`
	InstalledForAgents []string `json:"installedForAgents"`
}

// allSkillNames is the canonical ordered list of built-in skills.
var allSkillNames = []string{
	setup.WorkspaceSkillName,
	setup.MemorySkillName,
	setup.StartSkillName,
	setup.ResearchSkillName,
	setup.PlanSkillName,
	setup.BuildSkillName,
	setup.VerifySkillName,
	setup.DoneSkillName,
}

var skillDescriptions = map[string]string{
	setup.WorkspaceSkillName: "Workspace management — open, close, and navigate yishan workspaces from an agent.",
	setup.MemorySkillName:    "Project memory — keep a persistent MEMORY.md context file up to date across sessions.",
	setup.StartSkillName:     "Start a new task — create a ticket folder in .my-context/tasks/ and register it.",
	setup.ResearchSkillName:  "Task research — investigate requirements, search project memory, and record findings.",
	setup.PlanSkillName:      "Task planning — draft an execution plan with ordered steps based on research.",
	setup.BuildSkillName:     "Task build — execute the plan, write code, and ensure unit tests are covered.",
	setup.VerifySkillName:    "Task verification — review code, run lint/typecheck, and ensure tests pass.",
	setup.DoneSkillName:      "Task finalization — update architecture docs, move to completed/, update MEMORY.md.",
}

func (h *JSONRPCHandler) dispatchSkill(ctx context.Context, method string, params json.RawMessage) (any, error) {
	switch method {
	case MethodSkillList:
		return handleSkillList()
	case MethodSkillInstall:
		return handleSkillInstall(params)
	case MethodSkillUninstall:
		return handleSkillUninstall(params)
	default:
		return nil, workspace.NewRPCError(rpcCodeMethodNotFound, fmt.Sprintf("method not found: %s", method))
	}
}

func handleSkillList() (any, error) {
	state, err := setup.GetInstalledState()
	if err != nil {
		return nil, fmt.Errorf("read skill state: %w", err)
	}

	perSkill := make(map[string]setup.PerSkillState, len(state.Skills))
	for _, s := range state.Skills {
		perSkill[s.Name] = s
	}

	skills := make([]skillInfo, 0, len(allSkillNames))
	for _, name := range allSkillNames {
		ps := perSkill[name]
		agents := ps.InstalledForAgents
		if agents == nil {
			agents = []string{}
		}
		skills = append(skills, skillInfo{
			Name:               name,
			Description:        skillDescriptions[name],
			Installed:          ps.Installed,
			InstalledForAgents: agents,
		})
	}
	return map[string]any{"skills": skills}, nil
}

func handleSkillInstall(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if err := installSkillByName(name); err != nil {
		return nil, fmt.Errorf("install skill %q: %w", name, err)
	}
	return map[string]bool{"ok": true}, nil
}

func handleSkillUninstall(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if err := removeSkillByName(name); err != nil {
		return nil, fmt.Errorf("uninstall skill %q: %w", name, err)
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
	for _, valid := range allSkillNames {
		if name == valid {
			return name, nil
		}
	}
	return "", workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("unknown skill %q", name))
}

func installSkillByName(name string) error {
	switch name {
	case setup.WorkspaceSkillName:
		_, err := setup.EnsureWorkspaceSkill()
		return err
	case setup.MemorySkillName:
		_, err := setup.EnsureMemorySkill()
		return err
	case setup.StartSkillName:
		_, err := setup.EnsureStartSkill()
		return err
	case setup.ResearchSkillName:
		_, err := setup.EnsureResearchSkill()
		return err
	case setup.PlanSkillName:
		_, err := setup.EnsurePlanSkill()
		return err
	case setup.BuildSkillName:
		_, err := setup.EnsureBuildSkill()
		return err
	case setup.VerifySkillName:
		_, err := setup.EnsureVerifySkill()
		return err
	case setup.DoneSkillName:
		_, err := setup.EnsureDoneSkill()
		return err
	default:
		return fmt.Errorf("unknown skill: %s", name)
	}
}

func removeSkillByName(name string) error {
	switch name {
	case setup.WorkspaceSkillName:
		return setup.RemoveWorkspaceSkill()
	case setup.MemorySkillName:
		return setup.RemoveMemorySkill()
	case setup.StartSkillName:
		return setup.RemoveStartSkill()
	case setup.ResearchSkillName:
		return setup.RemoveResearchSkill()
	case setup.PlanSkillName:
		return setup.RemovePlanSkill()
	case setup.BuildSkillName:
		return setup.RemoveBuildSkill()
	case setup.VerifySkillName:
		return setup.RemoveVerifySkill()
	case setup.DoneSkillName:
		return setup.RemoveDoneSkill()
	default:
		return fmt.Errorf("unknown skill: %s", name)
	}
}
