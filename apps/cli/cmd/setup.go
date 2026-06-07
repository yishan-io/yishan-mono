package cmd

import (
	"github.com/spf13/cobra"
	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/output"
)

var setupSkillCmd = &cobra.Command{
	Use:   "skill",
	Short: "Install or remove the yishan agent skill",
	Long:  `Install the yishan-workspace skill so AI agents can use the yishan CLI to create and close workspaces. Creates symlinks in opencode, claude, and agents config directories.`,
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
			return output.PrintAny(map[string]any{
				"action":  "removed",
				"message": "yishan-workspace skill removed from all agent config directories",
			})
		}

		result, err := setup.EnsureWorkspaceSkill()
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{
			"action":    "installed",
			"skill":     result.SkillPath,
			"symlinks":  result.Symlinks,
			"message":   "yishan-workspace skill installed for opencode, claude, and other agents",
		})
	},
}

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Manage yishan integration with AI agents",
	Long:  `Install yishan integrations such as agent skills that teach AI coding agents how to use the yishan CLI.`,
}

func init() {
	rootCmd.AddCommand(setupCmd)
	setupCmd.AddCommand(setupSkillCmd)

	setupSkillCmd.Flags().Bool("remove", false, "remove the skill symlinks and clean up")
}
