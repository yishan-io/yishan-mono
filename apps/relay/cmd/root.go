package cmd

import "github.com/spf13/cobra"

var rootCmd = &cobra.Command{
	Use:   "relay",
	Short: "Yishan relay service",
}

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start relay server",
	RunE: func(_ *cobra.Command, _ []string) error {
		return startServer()
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)
	rootCmd.RunE = serveCmd.RunE
}

// Execute is the top-level entry point for the relay server.
func Execute() error {
	return rootCmd.Execute()
}
