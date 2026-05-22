package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/output"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print CLI version",
	RunE: func(_ *cobra.Command, _ []string) error {
		return output.PrintAny(map[string]string{"version": buildinfo.Version})
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
