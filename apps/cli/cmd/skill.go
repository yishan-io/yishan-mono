package cmd

import (
	setup "yishan/apps/cli/internal/agentsetup"
	"yishan/apps/cli/internal/output"

	"github.com/spf13/cobra"
)

var skillCmd = &cobra.Command{
	Use:   "skill",
	Short: "Manage Yishan and third-party skills",
	Long:  "Browse, install, update, inspect, and remove official Yishan skills and third-party skills.",
}

var skillListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available and installed skills",
	RunE: func(_ *cobra.Command, _ []string) error {
		infos, err := setup.ListSkills()
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{"skills": infos})
	},
}

var skillInfoCmd = &cobra.Command{
	Use:   "info <name>",
	Short: "Show one skill's details",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		info, err := setup.GetSkillInfo(args[0])
		if err != nil {
			return err
		}
		return output.PrintAny(info)
	},
}

var skillAddCmd = &cobra.Command{
	Use:   "add <official-name|url>",
	Short: "Install a skill from an official name or URL",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		result, err := setup.AddSkill(args[0])
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{
			"action":    "installed",
			"source":    args[0],
			"skillPath": result.SkillPath,
		})
	},
}

var skillRemoveCmd = &cobra.Command{
	Use:   "remove <name>",
	Short: "Remove an installed skill",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		if err := setup.RemoveSkill(args[0]); err != nil {
			return err
		}
		return output.PrintAny(map[string]any{"action": "removed", "name": args[0]})
	},
}

var skillUpdateCmd = &cobra.Command{
	Use:   "update <name>",
	Short: "Reinstall an installed skill from its recorded source",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		result, err := setup.UpdateSkill(args[0])
		if err != nil {
			return err
		}
		return output.PrintAny(map[string]any{
			"action":    "updated",
			"name":      args[0],
			"skillPath": result.SkillPath,
		})
	},
}

func init() {
	rootCmd.AddCommand(skillCmd)
	skillCmd.AddCommand(skillListCmd)
	skillCmd.AddCommand(skillInfoCmd)
	skillCmd.AddCommand(skillAddCmd)
	skillCmd.AddCommand(skillRemoveCmd)
	skillCmd.AddCommand(skillUpdateCmd)
}
