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
	if fn, ok := installSkillFns[name]; ok {
		if err := fn(); err != nil {
			return nil, fmt.Errorf("install skill %q: %w", name, err)
		}
		return map[string]bool{"ok": true}, nil
	}
	return nil, workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("unknown skill %q", name))
}

func handleSkillUninstall(params json.RawMessage) (any, error) {
	name, err := parseSkillNameParam(params)
	if err != nil {
		return nil, err
	}
	if fn, ok := removeSkillFns[name]; ok {
		if err := fn(); err != nil {
			return nil, fmt.Errorf("uninstall skill %q: %w", name, err)
		}
		return map[string]bool{"ok": true}, nil
	}
	return nil, workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("unknown skill %q", name))
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

var installSkillFns = map[string]func() error{
	setup.WorkspaceSkillName: func() error { _, err := setup.EnsureWorkspaceSkill(); return err },
	setup.MemorySkillName:    func() error { _, err := setup.EnsureMemorySkill(); return err },
	setup.StartSkillName:     func() error { _, err := setup.EnsureStartSkill(); return err },
	setup.ResearchSkillName:  func() error { _, err := setup.EnsureResearchSkill(); return err },
	setup.PlanSkillName:      func() error { _, err := setup.EnsurePlanSkill(); return err },
	setup.BuildSkillName:     func() error { _, err := setup.EnsureBuildSkill(); return err },
	setup.VerifySkillName:    func() error { _, err := setup.EnsureVerifySkill(); return err },
	setup.DoneSkillName:      func() error { _, err := setup.EnsureDoneSkill(); return err },
}

var removeSkillFns = map[string]func() error{
	setup.WorkspaceSkillName: setup.RemoveWorkspaceSkill,
	setup.MemorySkillName:    setup.RemoveMemorySkill,
	setup.StartSkillName:     setup.RemoveStartSkill,
	setup.ResearchSkillName:  setup.RemoveResearchSkill,
	setup.PlanSkillName:      setup.RemovePlanSkill,
	setup.BuildSkillName:     setup.RemoveBuildSkill,
	setup.VerifySkillName:    setup.RemoveVerifySkill,
	setup.DoneSkillName:      setup.RemoveDoneSkill,
}
