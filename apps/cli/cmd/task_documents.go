package cmd

import (
	"strings"

	"github.com/spf13/cobra"

	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/rpc"
)

var taskWriteCmd = &cobra.Command{
	Use:   "write <id>",
	Short: "Replace a Task Context document",
	Long: `Replace one Task Context document with content from --content, --file, or stdin.

Content sources are exclusive: pass either --content or --file (use "--file -" to
read stdin), not both. Requires a running daemon.`,
	Example: `  yishan task write <task-id> --document plan --file plan.md
  cat notes.md | yishan task write <task-id> --document notes --file -`,
	Args: cobra.ExactArgs(1),
	RunE: runTaskWrite,
}

var taskAppendNoteCmd = &cobra.Command{
	Use:   "append-note <id>",
	Short: "Append content to the task notes",
	Long:  `Append content to the notes document. Requires a running daemon.`,
	Example: `  yishan task append-note <task-id> --content "Found the root cause."
  yishan task append-note <task-id> --file -`,
	Args: cobra.ExactArgs(1),
	RunE: runTaskAppendNote,
}

var taskFinishCmd = &cobra.Command{
	Use:   "finish <id>",
	Short: "Write the outcome, then mark the task done",
	Long: `Store the outcome document first, then mark the task done.

If the status update fails the outcome is already saved; run the same command
again to mark the task done without losing content.`,
	Example: `  yishan task finish <task-id> --outcome "Done; tests pass."
  yishan task finish <task-id> --file outcome.md`,
	Args: cobra.ExactArgs(1),
	RunE: runTaskFinish,
}

func runTaskWrite(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	document, err := command.Flags().GetString("document")
	if err != nil {
		return err
	}
	if strings.TrimSpace(document) == "" {
		return newUsageError("--document is required: use notes, plan, or outcome")
	}
	content, err := readContentInput(command, "content")
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		task, resolveErr := loadScopedTask(client, scope, args[0])
		if resolveErr != nil {
			return resolveErr
		}
		var result rpc.LocalTaskDocumentWriteResult
		if err := client.Call(rpc.MethodLocalTaskWriteDocument, rpc.LocalTaskWriteDocumentParams{
			ID: task.ID, Document: strings.TrimSpace(document), Content: content,
		}, &result); err != nil {
			return err
		}
		return output.PrintAny(result)
	})
}

func runTaskAppendNote(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	content, err := readContentInput(command, "content")
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		task, resolveErr := loadScopedTask(client, scope, args[0])
		if resolveErr != nil {
			return resolveErr
		}
		var result rpc.LocalTaskDocumentWriteResult
		if err := client.Call(rpc.MethodLocalTaskAppendNote, rpc.LocalTaskAppendNoteParams{
			ID: task.ID, Content: content,
		}, &result); err != nil {
			return err
		}
		return output.PrintAny(result)
	})
}

func runTaskFinish(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	outcome, err := readContentInput(command, "outcome")
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		task, resolveErr := loadScopedTask(client, scope, args[0])
		if resolveErr != nil {
			return resolveErr
		}
		var result rpc.LocalTaskFinishResult
		if err := client.Call(rpc.MethodLocalTaskFinish, rpc.LocalTaskFinishParams{
			ID: task.ID, Outcome: outcome,
		}, &result); err != nil {
			return err
		}
		return output.PrintAny(result)
	})
}

// registerTaskWriteFlags registers the document replacement flags.
func registerTaskWriteFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("document", "", "document to replace: notes, plan, or outcome")
	command.Flags().String("content", "", "document content")
	command.Flags().String("file", "", "read content from a file, or - for stdin")
}

// registerTaskAppendNoteFlags registers the note append flags.
func registerTaskAppendNoteFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("content", "", "note content")
	command.Flags().String("file", "", "read content from a file, or - for stdin")
}

// registerTaskFinishFlags registers the finish flags.
func registerTaskFinishFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("outcome", "", "task outcome content")
	command.Flags().String("file", "", "read the outcome from a file, or - for stdin")
}

func init() {
	taskCmd.AddCommand(taskStartCmd, taskListCmd, taskSearchCmd, taskReadCmd, taskUpdateCmd)
	taskCmd.AddCommand(taskLinkWorkspaceCmd, taskTemplateReadCmd)
	taskCmd.AddCommand(taskWriteCmd, taskAppendNoteCmd, taskFinishCmd)

	registerTaskStartFlags(taskStartCmd)
	registerTaskListFlags(taskListCmd)
	registerTaskListFlags(taskSearchCmd)
	registerTaskReadFlags(taskReadCmd)
	registerTaskUpdateFlags(taskUpdateCmd)
	registerTaskLinkWorkspaceFlags(taskLinkWorkspaceCmd)
	registerTaskWriteFlags(taskWriteCmd)
	registerTaskAppendNoteFlags(taskAppendNoteCmd)
	registerTaskFinishFlags(taskFinishCmd)
}
