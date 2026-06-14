package setup

import (
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/config"
)

type InstalledState struct {
	Skill  SkillState      `json:"skill"`
	Skills []PerSkillState `json:"skills,omitempty"`
	MCP    MCPState        `json:"mcp"`
	Hooks  HookState       `json:"hooks"`
	Assets AssetState      `json:"assets"`
	Shell  ShellState      `json:"shell"`
}

type SkillState struct {
	Installed bool     `json:"installed"`
	SkillPath string   `json:"skillPath,omitempty"`
	Symlinks  []string `json:"symlinks,omitempty"`
}

// PerSkillState tracks the install status for one individual skill.
type PerSkillState struct {
	Name               string   `json:"name"`
	Installed          bool     `json:"installed"`
	InstalledForAgents []string `json:"installedForAgents,omitempty"`
}

type MCPState struct {
	Configured bool     `json:"configured"`
	Configs    []string `json:"configs,omitempty"`
}

type HookState struct {
	Configured bool     `json:"configured"`
	Agents     []string `json:"agents,omitempty"`
}

type AssetState struct {
	Installed bool     `json:"installed"`
	AssetsDir string   `json:"assetsDir,omitempty"`
	Binaries  []string `json:"binaries,omitempty"`
}

type ShellState struct {
	Configured bool   `json:"configured"`
	ShellDir   string `json:"shellDir,omitempty"`
}

func GetInstalledState() (*InstalledState, error) {
	state := &InstalledState{
		Skill:  SkillState{},
		MCP:    MCPState{},
		Hooks:  HookState{},
		Assets: AssetState{},
		Shell:  ShellState{},
	}

	yishanHome, err := config.HomeDir()
	if err != nil {
		return nil, err
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	fillSkillState(state, yishanHome, homeDir)
	fillMCPState(state, homeDir)
	fillHookState(state, homeDir)
	fillAssetState(state, yishanHome)
	fillShellState(state, yishanHome)

	return state, nil
}

func fillSkillState(state *InstalledState, yishanHome string, homeDir string) {
	// agentLinks maps a symlink directory (for one skill name) to its agent label.
	// The slice order determines the display order.
	type agentLink struct {
		agent   string
		linkDir func(name string) string
	}
	agentLinks := []agentLink{
		{"opencode", func(name string) string {
			return filepath.Join(homeDir, ".config", "opencode", "skills", name)
		}},
		{"claude", func(name string) string {
			return filepath.Join(homeDir, ".claude", "skills", name)
		}},
		{"agents", func(name string) string {
			return filepath.Join(homeDir, ".agents", "skills", name)
		}},
	}

	for _, name := range []string{
		workspaceSkillName, memorySkillName,
		startSkillName, researchSkillName, planSkillName,
		buildSkillName, verifySkillName, doneSkillName,
	} {
		skillDir := filepath.Join(yishanHome, "skills", name)
		skillPath := filepath.Join(skillDir, "SKILL.md")

		installed := false
		var installedForAgents []string

		if _, err := os.Stat(skillPath); err == nil {
			installed = true
			state.Skill.Installed = true
			state.Skill.SkillPath = skillPath // last one wins; SkillPath is legacy single-value field

			for _, al := range agentLinks {
				linkDir := al.linkDir(name)
				if info, err := os.Lstat(linkDir); err == nil && info.Mode()&os.ModeSymlink != 0 {
					state.Skill.Symlinks = append(state.Skill.Symlinks, linkDir)
					installedForAgents = append(installedForAgents, al.agent)
				}
			}
		}

		state.Skills = append(state.Skills, PerSkillState{
			Name:               name,
			Installed:          installed,
			InstalledForAgents: installedForAgents,
		})
	}
}

func fillMCPState(state *InstalledState, homeDir string) {
	opencodePath := filepath.Join(homeDir, ".config", "opencode", "opencode.json")
	if config, err := readJSONConfig(opencodePath); err == nil {
		if mcpServers, ok := config["mcpServers"].(map[string]any); ok {
			if _, ok := mcpServers[yishanMCPServerName]; ok {
				state.MCP.Configured = true
				state.MCP.Configs = append(state.MCP.Configs, opencodePath)
			}
		}
	}

	claudePath := filepath.Join(homeDir, ".claude", "claude_desktop_config.json")
	if config, err := readJSONConfig(claudePath); err == nil {
		if mcpServers, ok := config["mcpServers"].(map[string]any); ok {
			if _, ok := mcpServers[yishanMCPServerName]; ok {
				state.MCP.Configured = true
				state.MCP.Configs = append(state.MCP.Configs, claudePath)
			}
		}
	}
}

func fillHookState(state *InstalledState, homeDir string) {
	marker := "YISHAN_MANAGED_HOOK"
	agentDirs := map[string]string{
		"claude":  filepath.Join(homeDir, ".claude", "settings.json"),
		"gemini":  filepath.Join(homeDir, ".gemini", "settings.json"),
		"codex":   filepath.Join(homeDir, ".codex", "hooks.json"),
		"cursor":  filepath.Join(homeDir, ".cursor", "hooks.json"),
	}

	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(homeDir, ".config")
	}
	opencodePlugin := filepath.Join(configHome, "opencode", "plugin", "yishan-notify.js")
	piExtension := filepath.Join(homeDir, ".pi", "agent", "extensions", "yishan-notify.ts")

	for agent, path := range agentDirs {
		if data, err := os.ReadFile(path); err == nil && strings.Contains(string(data), marker) {
			state.Hooks.Agents = append(state.Hooks.Agents, agent)
		}
	}
	if _, err := os.Stat(opencodePlugin); err == nil {
		state.Hooks.Agents = append(state.Hooks.Agents, "opencode")
	}
	if _, err := os.Stat(piExtension); err == nil {
		state.Hooks.Agents = append(state.Hooks.Agents, "pi")
	}

	if len(state.Hooks.Agents) > 0 {
		state.Hooks.Configured = true
	}
}

func fillAssetState(state *InstalledState, yishanHome string) {
	binDir := filepath.Join(yishanHome, "bin")
	expectedBinaries := []string{"claude", "codex", "opencode", "gemini", "pi", "copilot", "cursor"}
	for _, bin := range expectedBinaries {
		if _, err := os.Stat(filepath.Join(binDir, bin)); err == nil {
			state.Assets.Binaries = append(state.Assets.Binaries, bin)
		}
	}
	if len(state.Assets.Binaries) > 0 {
		state.Assets.Installed = true
		state.Assets.AssetsDir = yishanHome
	}
}

func fillShellState(state *InstalledState, yishanHome string) {
	zshDir := filepath.Join(yishanHome, "shell", "zsh")
	if _, err := os.Stat(filepath.Join(zshDir, ".zshenv")); err == nil {
		state.Shell.Configured = true
		state.Shell.ShellDir = zshDir
	}
}
