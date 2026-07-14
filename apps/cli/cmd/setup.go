package cmd

import (
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Manage yishan integration with AI agents",
	Long: `Install yishan integrations such as agent hooks, MCP configs, default Pi extensions,
and skills that teach AI coding agents how to use the yishan CLI.

Without a subcommand, runs all setup tasks (hook, mcp, extension, skill).`,
	Example: `  yishan setup
  yishan setup hook
  yishan setup mcp
  yishan setup extension
  yishan setup skill
  yishan setup state`,
	RunE: runSetupAll,
}

var setupHookCmd = &cobra.Command{
	Use:   "hook",
	Short: "Install agent lifecycle hooks (notifications, prompts)",
	Long: `Install managed hook integrations for Claude, Gemini, OpenCode,
Codex, and Cursor agents. These hooks send lifecycle events
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
		setup.EnsureManagedAgentRuntime(cliruntime.UsesServiceTokenAuth())
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
	Short: "Install or remove yishan workflow skills and sub-agent prompts",
	Long: `Install the current Pi workflow skills and project sub-agent prompts so AI agents
can use the tracked-task workflow, planning/review skills, and managed Pi sub-agents.
Creates skill symlinks from the project-owned sources.`,
	Example: `  yishan setup skill
  yishan setup skill --remove`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		remove, err := cmd.Flags().GetBool("remove")
		if err != nil {
			return err
		}
		if remove {
			if err := setup.RemoveOfficialSkills(); err != nil {
				return err
			}
			return output.PrintAny(map[string]any{
				"action":  "removed",
				"message": "All yishan workflow skills removed",
			})
		}
		results, err := setup.EnsureOfficialSkills()
		if err != nil {
			return err
		}
		skillPaths := make([]string, 0, len(results))
		for _, result := range results {
			skillPaths = append(skillPaths, result.SkillPath)
		}
		return output.PrintAny(map[string]any{
			"action":  "installed",
			"skills":  skillPaths,
			"message": "All yishan workflow skills installed for supported agents",
		})
	},
}

var setupExtensionCmd = &cobra.Command{
	Use:   "extension",
	Short: "Install or remove the default Pi extension set",
	Long: `Install the default Yishan Pi extensions into the managed Pi home,
so Pi sessions started from Yishan get the standard notify, sub-agent, memory, and workspace tools.`,
	Example: `  yishan setup extension
  yishan setup extension --remove`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		remove, err := cmd.Flags().GetBool("remove")
		if err != nil {
			return err
		}
		if remove {
			if err := setup.RemoveDefaultPiExtensionSetup(); err != nil {
				return err
			}
			return output.PrintAny(map[string]any{
				"action":     "removed",
				"extensions": setup.DefaultPiExtensionNames(),
				"message":    "default Pi extensions removed",
			})
		}
		if err := setup.EnsureDefaultPiExtensionSetup(); err != nil {
			return err
		}
		return output.PrintAny(map[string]any{
			"action":     "installed",
			"extensions": setup.DefaultPiExtensionNames(),
			"message":    "default Pi extensions installed",
		})
	},
}

var setupStateCmd = &cobra.Command{
	Use:   "state",
	Short: "Show installed yishan integrations",
	Long:  `List all installed yishan integrations: skills, MCP configs, Pi extensions, hooks, assets, and shell wrappers.`,
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

	disablePersona := cliruntime.UsesServiceTokenAuth()
	setup.EnsureManagedAgentRuntime(disablePersona)

	if _, err := setup.EnsureMCPConfig(); err != nil {
		log.Warn().Err(err).Msg("setup: MCP config failed")
		allErrors = append(allErrors, "mcp: "+err.Error())
	}
	if err := setup.EnsureDefaultPiExtensionSetup(); err != nil {
		log.Warn().Err(err).Msg("setup: default pi extension setup failed")
		allErrors = append(allErrors, "extension: "+err.Error())
	}
	for _, skillName := range setup.OfficialSkillNames() {
		if _, err := setup.AddSkill(skillName); err != nil {
			log.Warn().Err(err).Str("skill", skillName).Msg("setup: skill install failed")
			allErrors = append(allErrors, "skill("+skillName+"): "+err.Error())
		}
	}

	if err := setup.EnsurePersonaSetup(disablePersona); err != nil {
		log.Warn().Err(err).Msg("setup: persona template install failed")
		allErrors = append(allErrors, "persona: "+err.Error())
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
		"message": "all setup tasks completed (hooks, mcp, extensions, skill)",
	})
}

func renderSetupState(state *setup.InstalledState) output.RenderData {
	rows := []map[string]any{
		{
			"resource":  "extension",
			"installed": state.Extension.Installed,
			"details":   formatExtensionDetails(state.Extension),
		},
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

func formatExtensionDetails(e setup.ExtensionState) string {
	if !e.Installed {
		return ""
	}
	return strings.Join(e.Extensions, ", ")
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
	setupCmd.AddCommand(setupExtensionCmd)
	setupCmd.AddCommand(setupSkillCmd)
	setupCmd.AddCommand(setupStateCmd)

	setupHookCmd.Flags().Bool("remove", false, "remove managed hook entries from all agents")
	setupMCPCmd.Flags().Bool("remove", false, "remove the MCP config from all agents")
	setupExtensionCmd.Flags().Bool("remove", false, "remove the default Pi extensions")
	setupSkillCmd.Flags().Bool("remove", false, "remove the skill symlinks and clean up")
}
