package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/output"
	"yishan/apps/cli/internal/workspace/terminal"
)

var terminalCmd = &cobra.Command{
	Use:   "terminal",
	Short: "Terminal session operations (requires running daemon)",
	Long:  `Manage terminal sessions running inside workspaces via the local daemon.`,
}

var terminalListCmd = &cobra.Command{
	Use:   "list",
	Short: "List terminal sessions",
	Long:  `List all active terminal sessions managed by the running daemon.`,
	Example: `  yishan terminal list
  yishan terminal list --include-exited
  yishan terminal list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		includeExited, err := cmd.Flags().GetBool("include-exited")
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err != nil {
			return err
		}

		var result []terminal.SessionSummary
		if err := client.Call(cmd.Context(), daemon.MethodTerminalListSessions,
			terminal.ListSessionsRequest{IncludeExited: includeExited},
			&result,
		); err != nil {
			return err
		}

		return output.PrintAny(map[string]any{"sessions": result})
	},
}

var terminalStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start a terminal session in a workspace",
	Long:  `Start a new terminal session in the specified workspace. Returns the session ID used for subsequent send/read/stop calls.`,
	Example: `  yishan terminal start --workspace-id <id>
  yishan terminal start --workspace-id <id> --command bash
  yishan terminal start --workspace-id <id> --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		workspaceID, err := cmd.Flags().GetString("workspace-id")
		if err != nil {
			return err
		}
		command, err := cmd.Flags().GetString("command")
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err != nil {
			return err
		}

		var result terminal.StartResponse
		if err := client.Call(cmd.Context(), daemon.MethodTerminalStart,
			terminal.StartRequest{WorkspaceID: workspaceID, Command: command},
			&result,
		); err != nil {
			return err
		}

		return output.PrintAny(result)
	},
}

var terminalStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop a terminal session",
	Long:  `Stop and remove a running terminal session by its session ID.`,
	Example: `  yishan terminal stop --session-id <id>
  yishan terminal stop --session-id <id> --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		sessionID, err := cmd.Flags().GetString("session-id")
		if err != nil {
			return err
		}

		client, err := resolveDaemonClient()
		if err != nil {
			return err
		}

		var result terminal.StopResponse
		if err := client.Call(cmd.Context(), daemon.MethodTerminalStop,
			terminal.StopRequest{SessionID: sessionID},
			&result,
		); err != nil {
			return err
		}

		return output.PrintAny(result)
	},
}

var terminalPortsCmd = &cobra.Command{
	Use:   "ports",
	Short: "List ports detected in terminal sessions",
	Long:  `List network ports that the daemon has detected as open across all terminal sessions.`,
	Example: `  yishan terminal ports
  yishan terminal ports --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		client, err := resolveDaemonClient()
		if err != nil {
			return err
		}

		var result []terminal.DetectedPort
		if err := client.Call(cmd.Context(), daemon.MethodTerminalListPorts, nil, &result); err != nil {
			return err
		}

		return output.PrintAny(map[string]any{"ports": result})
	},
}

func init() {
	rootCmd.AddCommand(terminalCmd)
	terminalCmd.AddCommand(terminalListCmd)
	terminalCmd.AddCommand(terminalStartCmd)
	terminalCmd.AddCommand(terminalStopCmd)
	terminalCmd.AddCommand(terminalPortsCmd)

	terminalListCmd.Flags().Bool("include-exited", false, "include already-exited sessions")

	terminalStartCmd.Flags().String("workspace-id", "", "workspace ID")
	terminalStartCmd.Flags().String("command", "", "command to run (defaults to workspace shell)")
	cobra.CheckErr(terminalStartCmd.MarkFlagRequired("workspace-id"))

	terminalStopCmd.Flags().String("session-id", "", "terminal session ID")
	cobra.CheckErr(terminalStopCmd.MarkFlagRequired("session-id"))
}
