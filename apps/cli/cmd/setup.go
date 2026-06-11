package cmd

import (
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/output"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Manage yishan integration with AI agents",
	Long: `Install yishan integrations such as agent hooks, MCP configs, and skills
that teach AI coding agents how to use the yishan CLI.

Without a subcommand, runs all setup tasks (hook, mcp, skill).`,
	Example: `  yishan setup
  yishan setup hook
  yishan setup mcp
  yishan setup skill
  yishan setup state`,
	RunE: runSetupAll,
}

var setupHookCmd = &cobra.Command{
	Use:   "hook",
	Short: "Install agent lifecycle hooks (notifications, prompts)",
	Long: `Install managed hook integrations for Claude, Gemini, OpenCode,
Codex, Cursor, and Pi agents. These hooks send lifecycle events
(Start, Stop, UserPromptSubmit, etc.) to the yishan daemon.`,
	Example: `  yishan setup hook
  yishan setup hook --remove`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		remove, err := cmd.Flags().GetBool("remove")
		if err != nil {
			return err
		}
		if remove {
			if err := setup.RemoveManagedAgentRuntime(); err != nil {
				return err
			}
			return output.PrintAny(map[string]any{
				"action":  "removed",
				"message": "agent hooks removed from all supported agents",
			})
		}
		setup.EnsureManagedAgentRuntime()
		return output.PrintAny(map[string]any{
			"action":  "installed",
			"message": "agent hooks installed for all supported agents",
		})
	},
}

var setupMCPCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Configure agent MCP servers to connect to yishan",
	Long: `Write MCP server configuration for OpenCode and Claude,
so they can discover the yishan MCP server (yishan mcp)
and use it to manage workspaces.`,
	Example: `  yishan setup mcp
  yishan setup mcp --remove`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		remove, err := cmd.Flags().GetBool("remove")
		if err != nil {
			return err
		}
		if remove {
			if err := setup.RemoveMCPConfig(); err != nil {
				return err
			}
			return output.PrintAny(map[string]any{
				"action":  "removed",
				"message": "MCP config removed from all agents",
			})
		}
		result, err := setup.EnsureMCPConfig()
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{
			"action":  "installed",
			"configs": result.ConfigPaths,
			"message": "MCP config written for OpenCode and Claude",
		})
	},
}

var setupSkillCmd = &cobra.Command{
	Use:   "skill",
	Short: "Install or remove yishan agent skills",
	Long: `Install the ys-workspace and ys-memory skills so AI agents can use the
yishan CLI to create and close workspaces, and keep project memory
up to date. Creates symlinks in opencode, claude, and agents config directories.`,
	Example: `  yishan setup skill
  yishan setup skill --remove`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		remove, err := cmd.Flags().GetBool("remove")
		if err != nil {
			return err
		}
		if remove {
			if err := setup.RemoveWorkspaceSkill(); err != nil {
				return err
			}
			if err := setup.RemoveMemorySkill(); err != nil {
				return err
			}
			return output.PrintAny(map[string]any{
				"action":  "removed",
				"message": "ys-workspace and ys-memory skills removed from all agent config directories",
			})
		}
		wsResult, err := setup.EnsureWorkspaceSkill()
		if err != nil {
			return err
		}
		memResult, err := setup.EnsureMemorySkill()
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{
			"action":   "installed",
			"skills":   []string{wsResult.SkillPath, memResult.SkillPath},
			"symlinks": append(wsResult.Symlinks, memResult.Symlinks...),
			"message":  "ys-workspace and ys-memory skills installed for opencode, claude, and other agents",
		})
	},
}

var setupStateCmd = &cobra.Command{
	Use:   "state",
	Short: "Show installed yishan integrations",
	Long:  `List all installed yishan integrations: skills, MCP configs, hooks, assets, and shell wrappers.`,
	Example: `  yishan setup state
  yishan setup state --output json`,
	RunE: func(_ *cobra.Command, _ []string) error {
		state, err := setup.GetInstalledState()
		if err != nil {
			return err
		}
		return output.PrintRenderData(renderSetupState(state))
	},
}

func runSetupAll(_ *cobra.Command, _ []string) error {
	var allErrors []string

	setup.EnsureManagedAgentRuntime()

	if _, err := setup.EnsureMCPConfig(); err != nil {
		log.Warn().Err(err).Msg("setup: MCP config failed")
		allErrors = append(allErrors, "mcp: "+err.Error())
	}

	if _, err := setup.EnsureWorkspaceSkill(); err != nil {
		log.Warn().Err(err).Msg("setup: workspace skill install failed")
		allErrors = append(allErrors, "skill(ys-workspace): "+err.Error())
	}

	if _, err := setup.EnsureMemorySkill(); err != nil {
		log.Warn().Err(err).Msg("setup: memory skill install failed")
		allErrors = append(allErrors, "skill(ys-memory): "+err.Error())
	}

	if len(allErrors) > 0 {
		return output.PrintAny(map[string]any{
			"action":  "partial",
			"message": "some setup tasks failed",
			"errors":  allErrors,
		})
	}

	return output.PrintAny(map[string]any{
		"action":  "installed",
		"message": "all setup tasks completed (hooks, mcp, skill)",
	})
}

func renderSetupState(state *setup.InstalledState) output.RenderData {
	rows := []map[string]any{
		{
			"resource":  "hooks",
			"installed": state.Hooks.Configured,
			"details":   formatHookDetails(state.Hooks),
		},
		{
			"resource":  "mcp",
			"installed": state.MCP.Configured,
			"details":   formatMCPDetails(state.MCP),
		},
		{
			"resource":  "skill",
			"installed": state.Skill.Installed,
			"details":   formatSkillDetails(state.Skill),
		},
	}

	return output.RenderData{
		Title:   "setup state",
		Columns: []string{"resource", "installed", "details"},
		Rows:    rows,
	}
}

func formatSkillDetails(s setup.SkillState) string {
	if !s.Installed {
		return ""
	}
	return s.SkillPath
}

func formatMCPDetails(m setup.MCPState) string {
	if !m.Configured {
		return ""
	}
	return strings.Join(m.Configs, ", ")
}

func formatHookDetails(h setup.HookState) string {
	if !h.Configured {
		return ""
	}
	return strings.Join(h.Agents, ", ")
}

func init() {
	rootCmd.AddCommand(setupCmd)
	setupCmd.AddCommand(setupHookCmd)
	setupCmd.AddCommand(setupMCPCmd)
	setupCmd.AddCommand(setupSkillCmd)
	setupCmd.AddCommand(setupStateCmd)

	setupHookCmd.Flags().Bool("remove", false, "remove managed hook entries from all agents")
	setupMCPCmd.Flags().Bool("remove", false, "remove the MCP config from all agents")
	setupSkillCmd.Flags().Bool("remove", false, "remove the skill symlinks and clean up")
}
