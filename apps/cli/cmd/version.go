package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/buildinfo"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print CLI version",
	Run: func(_ *cobra.Command, _ []string) {
		fmt.Println(buildinfo.Version)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
