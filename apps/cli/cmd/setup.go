package cmd

import (
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	setup "yishan/apps/cli/internal/agent/setup"
	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/adapter/cloud/session"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Manage yishan integration with AI agents",
	Long: `Install yishan integrations such as agent hooks, default Pi extensions,
and shell wrappers for AI coding agents.

Without a subcommand, runs all setup tasks (hook, extension).`,
	Example: `  yishan setup
  yishan setup hook
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
		setup.EnsureManagedAgentRuntime(session.UsesServiceTokenAuth())
		return output.PrintAny(map[string]any{
			"action":  "installed",
			"message": "agent hooks installed for all supported agents",
		})
	},
}

var setupStateCmd = &cobra.Command{
	Use:   "state",
	Short: "Show installed yishan integrations",
	Long:  `List all installed yishan integrations: Pi extensions, hooks, MCP, assets, and shell wrappers.`,
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

	disablePersona := session.UsesServiceTokenAuth()
	setup.EnsureManagedAgentRuntime(disablePersona)

	if err := setup.EnsureDefaultPiExtensionSetup(); err != nil {
		log.Warn().Err(err).Msg("setup: default pi extension setup failed")
		allErrors = append(allErrors, "extension: "+err.Error())
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
		"message": "all setup tasks completed (hooks, extensions)",
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
	setupCmd.AddCommand(setupStateCmd)

	setupHookCmd.Flags().Bool("remove", false, "remove managed hook entries from all agents")
}
