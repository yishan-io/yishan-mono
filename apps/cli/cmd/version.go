package cmd

import (
	"fmt"
	"github.com/spf13/cobra"
	release "yishan/apps/cli/internal/release"
	"yishan/apps/cli/internal/output"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print CLI version",
	Long:  `Print the current CLI version string.`,
	Example: `  yishan version
  yishan version --output json`,
	RunE: func(_ *cobra.Command, _ []string) error {
		if !output.IsJSONOutput() {
			fmt.Println(release.Version)
			return nil
		}

		return output.PrintAny(map[string]string{"version": release.Version})
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
