package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
)

var jobCmd = &cobra.Command{
	Use:   "job",
	Short: "Scheduled job run operations",
	Long:  `Report the start and completion of scheduled job runs to the Yishan API. Intended for use by node agents executing scheduled jobs.`,
}

var jobStartRunCmd = &cobra.Command{
	Use:   "start-run",
	Short: "Report a scheduled job run as started",
	Long: `Notify the API that a scheduled job run has begun execution.

This command is called by the node agent immediately before executing a
scheduled job so the API can track run state.`,
	Example: `  yishan job start-run --node-id <id> --run-id <run-id>
  yishan job start-run --node-id <id> --run-id <run-id> --started-at 2026-01-01T00:00:00Z`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}
		runID, err := cmd.Flags().GetString("run-id")
		if err != nil {
			return err
		}
		startedAt, err := cmd.Flags().GetString("started-at")
		if err != nil {
			return err
		}

		response, err := apiClient.StartScheduledJobRun(nodeID, api.StartScheduledJobRunInput{
			RunID:     runID,
			StartedAt: startedAt,
		})
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var jobCompleteRunCmd = &cobra.Command{
	Use:   "complete-run",
	Short: "Report a scheduled job run as completed",
	Long: `Notify the API that a scheduled job run has finished execution.

This command is called by the node agent after a scheduled job exits,
passing the outcome (success or error) back to the API.`,
	Example: `  yishan job complete-run --node-id <id> --run-id <run-id> --status success
  yishan job complete-run --node-id <id> --run-id <run-id> --status error --error-code timeout --error-message "job timed out"`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}
		runID, err := cmd.Flags().GetString("run-id")
		if err != nil {
			return err
		}
		status, err := cmd.Flags().GetString("status")
		if err != nil {
			return err
		}
		finishedAt, _ := cmd.Flags().GetString("finished-at")
		responseBody, _ := cmd.Flags().GetString("response-body")
		errorCode, _ := cmd.Flags().GetString("error-code")
		errorMessage, _ := cmd.Flags().GetString("error-message")

		response, err := apiClient.CompleteScheduledJobRun(nodeID, api.CompleteScheduledJobRunInput{
			RunID:        runID,
			FinishedAt:   finishedAt,
			Status:       status,
			ResponseBody: responseBody,
			ErrorCode:    errorCode,
			ErrorMessage: errorMessage,
		})
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

func init() {
	rootCmd.AddCommand(jobCmd)
	jobCmd.AddCommand(jobStartRunCmd)
	jobCmd.AddCommand(jobCompleteRunCmd)

	jobStartRunCmd.Flags().String("node-id", "", "node ID")
	jobStartRunCmd.Flags().String("run-id", "", "scheduled job run ID")
	jobStartRunCmd.Flags().String("started-at", "", "ISO 8601 start timestamp (defaults to now on server)")
	cobra.CheckErr(jobStartRunCmd.MarkFlagRequired("node-id"))
	cobra.CheckErr(jobStartRunCmd.MarkFlagRequired("run-id"))

	jobCompleteRunCmd.Flags().String("node-id", "", "node ID")
	jobCompleteRunCmd.Flags().String("run-id", "", "scheduled job run ID")
	jobCompleteRunCmd.Flags().String("status", "", "completion status (success|error|timeout)")
	jobCompleteRunCmd.Flags().String("finished-at", "", "ISO 8601 finish timestamp (defaults to now on server)")
	jobCompleteRunCmd.Flags().String("response-body", "", "job response body")
	jobCompleteRunCmd.Flags().String("error-code", "", "error code if status is error")
	jobCompleteRunCmd.Flags().String("error-message", "", "error message if status is error")
	cobra.CheckErr(jobCompleteRunCmd.MarkFlagRequired("node-id"))
	cobra.CheckErr(jobCompleteRunCmd.MarkFlagRequired("run-id"))
	cobra.CheckErr(jobCompleteRunCmd.MarkFlagRequired("status"))
}
