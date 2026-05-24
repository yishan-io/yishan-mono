package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"yishan/apps/cli/internal/buildinfo"
	"yishan/apps/cli/internal/selfupdate"
)

var selfUpdateCmd = &cobra.Command{
	Use:   "self-update [version]",
	Short: "Update the CLI to the latest (or specified) version",
	Long: `Download and replace the current CLI binary with a newer version from GitHub Releases.

If no version is given, the latest release is used. The binary is verified
against the published SHA-256 checksum before installation.`,
	Example: `  yishan self-update
  yishan self-update 0.12.0
  yishan self-update --force`,
	Args: cobra.MaximumNArgs(1),
	RunE: runSelfUpdate,
}

var selfUpdateForce bool

func init() {
	selfUpdateCmd.Flags().BoolVarP(&selfUpdateForce, "force", "f", false, "re-install even if already up to date")
	rootCmd.AddCommand(selfUpdateCmd)
}

func runSelfUpdate(cmd *cobra.Command, args []string) error {
	ctx := cmd.Context()

	var rel *selfupdate.Release
	if len(args) == 1 {
		rel = selfupdate.ReleaseForVersion(args[0])
		fmt.Printf("Target version: %s\n", rel.Version)
	} else {
		fmt.Println("Checking for updates...")
		var err error
		rel, err = selfupdate.LatestRelease(ctx)
		if err != nil {
			return fmt.Errorf("failed to check for updates: %w", err)
		}
		fmt.Printf("Latest version: %s\n", rel.Version)
	}

	fmt.Printf("Current version: %s\n", buildinfo.Version)

	if !selfUpdateForce && !rel.IsNewer() {
		fmt.Println("Already up to date.")
		return nil
	}

	if err := rel.Apply(ctx, func(msg string) {
		fmt.Println(msg)
	}); err != nil {
		return err
	}

	fmt.Printf("\nUpdated to %s\n", rel.Version)
	return nil
}
