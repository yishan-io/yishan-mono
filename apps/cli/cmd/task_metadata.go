package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

var taskStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Create a Local Task",
	Long: `Create a Local Task in an explicit project scope.

The project scope comes from --project-id or YISHAN_PROJECT_ID. Pass --global to
create a task that belongs to no project. Requires a running daemon.`,
	Example: `  yishan task start --project-id <id> --title "Fix login" --goal "Repair login" --acceptance-criterion "Login works"
  yishan task start --global --title "Read the release notes" --output json`,
	Args: cobra.NoArgs,
	RunE: runTaskStart,
}

var taskListCmd = &cobra.Command{
	Use:   "list",
	Short: "List Local Tasks in the resolved scope",
	Long:  `List Local Tasks. The project scope comes from --project-id, YISHAN_PROJECT_ID, or --global.`,
	Example: `  yishan task list --project-id <id> --status progressing
  yishan task list --global --output json`,
	Args: cobra.NoArgs,
	RunE: runTaskList,
}

var taskSearchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search Local Task metadata",
	Long:  `Search Local Task titles and descriptions within the resolved scope.`,
	Example: `  yishan task search --project-id <id> "login"
  yishan task search --global --output json "release"`,
	Args: cobra.ExactArgs(1),
	RunE: runTaskSearch,
}

var taskReadCmd = &cobra.Command{
	Use:   "read <id>",
	Short: "Read a Local Task brief or context document",
	Long: `Read one Local Task.

Without --document it prints the synthetic task brief. With --document it prints
the notes, plan, or outcome document from the daemon-derived context directory.`,
	Example: `  yishan task read <task-id>
  yishan task read <task-id> --document plan --output json`,
	Args: cobra.ExactArgs(1),
	RunE: runTaskRead,
}

var taskUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update Local Task metadata",
	Long: `Update task metadata and set new, progressing, or cancelled status.
Use "yishan task finish" to mark a task done.`,
	Example: `  yishan task update <task-id> --status progressing
  yishan task update <task-id> --title "Repair login" --priority high`,
	Args: cobra.ExactArgs(1),
	RunE: runTaskUpdate,
}

var taskLinkWorkspaceCmd = &cobra.Command{
	Use:     "link-workspace <id>",
	Short:   "Link a Local Task to a workspace",
	Long:    `Associate an existing Local Task with a workspace without starting a run.`,
	Example: `  yishan task link-workspace <task-id> --workspace-id <workspace-id>`,
	Args:    cobra.ExactArgs(1),
	RunE:    runTaskLinkWorkspace,
}

var taskTemplateReadCmd = &cobra.Command{
	Use:   "template-read",
	Short: "Read the Agent default task description template",
	Long:  `Print the Agent default task description template structure.`,
	Args:  cobra.NoArgs,
	RunE:  runTaskTemplateRead,
}

func runTaskStart(command *cobra.Command, _ []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	input, err := buildTaskStartInput(command, scope)
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		var task localtask.Task
		if err := client.Call(rpc.MethodLocalTaskCreate, input.create, &task); err != nil {
			return err
		}
		if input.workspaceID == "" {
			return output.PrintAny(task)
		}
		var link localtask.WorkspaceLink
		if err := client.Call(rpc.MethodLocalTaskLinkWorkspace, rpc.LocalTaskLinkWorkspaceParams{
			TaskID: task.ID, WorkspaceID: input.workspaceID,
		}, &link); err != nil {
			return fmt.Errorf("task %s was created but could not be linked to workspace %s: %w", task.ID, input.workspaceID, err)
		}
		return output.PrintAny(task)
	})
}

func runTaskList(command *cobra.Command, _ []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	request, err := buildTaskListRequest(command, scope)
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		var tasks []localtask.Task
		if err := client.Call(rpc.MethodLocalTaskList, request, &tasks); err != nil {
			return err
		}
		return output.PrintAny(filterScopedTasks(tasks, scope))
	})
}

func runTaskSearch(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	request, err := buildTaskListRequest(command, scope)
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		var results []localtask.SearchResult
		search := taskSearchRequest{taskListRequest: request, Query: strings.TrimSpace(args[0])}
		if search.Query == "" {
			return newUsageError("search query must not be empty")
		}
		if err := client.Call(rpc.MethodLocalTaskSearch, search, &results); err != nil {
			return err
		}
		tasks := make([]localtask.Task, 0, len(results))
		for _, result := range results {
			tasks = append(tasks, result.Task)
		}
		return output.PrintAny(filterScopedTasks(tasks, scope))
	})
}

func runTaskRead(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	document, err := command.Flags().GetString("document")
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		task, resolveErr := loadScopedTask(client, scope, args[0])
		if resolveErr != nil {
			return resolveErr
		}
		if strings.TrimSpace(document) == "task" {
			return printTaskDocument(task.ID, "task", formatTaskBrief(task))
		}
		var result rpc.LocalTaskDocumentResult
		if err := client.Call(rpc.MethodLocalTaskReadDocument, rpc.LocalTaskReadDocumentParams{
			ID: task.ID, Document: document,
		}, &result); err != nil {
			return err
		}
		return printTaskDocument(result.ID, result.Document, result.Content)
	})
}

func runTaskUpdate(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	update, err := buildTaskUpdateRequest(command)
	if err != nil {
		return err
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		task, resolveErr := loadScopedTask(client, scope, args[0])
		if resolveErr != nil {
			return resolveErr
		}
		update.ID = task.ID
		var updated localtask.Task
		if err := client.Call(rpc.MethodLocalTaskUpdate, update, &updated); err != nil {
			return err
		}
		return output.PrintAny(updated)
	})
}

func runTaskLinkWorkspace(command *cobra.Command, args []string) error {
	scope, err := readTaskScopeFlags(command)
	if err != nil {
		return err
	}
	workspaceID, err := command.Flags().GetString("workspace-id")
	if err != nil {
		return err
	}
	if strings.TrimSpace(workspaceID) == "" {
		return newUsageError("--workspace-id is required")
	}
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		task, resolveErr := loadScopedTask(client, scope, args[0])
		if resolveErr != nil {
			return resolveErr
		}
		var link localtask.WorkspaceLink
		if err := client.Call(rpc.MethodLocalTaskLinkWorkspace, rpc.LocalTaskLinkWorkspaceParams{
			TaskID: task.ID, WorkspaceID: strings.TrimSpace(workspaceID),
		}, &link); err != nil {
			return err
		}
		return output.PrintAny(link)
	})
}

func runTaskTemplateRead(_ *cobra.Command, _ []string) error {
	return withTaskDaemon(func(client persistentDaemonRPCClient) error {
		var templates rpc.LocalTaskTemplatesResult
		if err := client.Call(rpc.MethodLocalTaskGetTemplates, map[string]any{}, &templates); err != nil {
			return err
		}
		template, ok := selectAgentTemplate(templates)
		if !ok {
			return newUsageError("no task templates available (agentDefaultId %q)", templates.AgentDefaultID)
		}
		return output.PrintAny(map[string]any{
			"agentDefaultId": templates.AgentDefaultID,
			"template":       template,
		})
	})
}

func selectAgentTemplate(templates rpc.LocalTaskTemplatesResult) (localtask.Template, bool) {
	for _, template := range templates.Templates {
		if template.ID == templates.AgentDefaultID {
			return template, true
		}
	}
	if len(templates.Templates) == 0 {
		return localtask.Template{}, false
	}
	return templates.Templates[0], true
}

// registerTaskStartFlags registers the task creation flags.
func registerTaskStartFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("title", "", "task title (required)")
	command.Flags().String("description", "", "free-form task description")
	command.Flags().String("goal", "", "goal section of the task description")
	command.Flags().String("context", "", "context section of the task description")
	command.Flags().StringArray("acceptance-criterion", nil, "acceptance criterion (repeatable)")
	command.Flags().String("priority", "", "task priority: low, medium, or high")
	command.Flags().StringArray("tag", nil, "task tag (repeatable)")
	command.Flags().String("workspace-id", "", "workspace ID to link after creation")
}

// registerTaskListFlags registers the shared list and search filters.
func registerTaskListFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().StringArray("status", nil, "status filter (repeatable): new, progressing, done, cancelled")
	command.Flags().String("priority", "", "priority filter: low, medium, or high")
	command.Flags().String("workspace-id", "", "workspace ID filter")
	command.Flags().StringArray("tag", nil, "tag filter (repeatable)")
}

// registerTaskReadFlags registers the task read flags.
func registerTaskReadFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("document", "task", "document to read: task, notes, plan, or outcome")
}

// registerTaskUpdateFlags registers the metadata update flags.
func registerTaskUpdateFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("title", "", "new task title")
	command.Flags().String("description", "", "new task description")
	command.Flags().String("status", "", "new status: new, progressing, or cancelled")
	command.Flags().String("priority", "", "new priority: low, medium, or high")
	command.Flags().StringArray("tag", nil, "replacement tag set (repeatable)")
}

// registerTaskLinkWorkspaceFlags registers the workspace link flags.
func registerTaskLinkWorkspaceFlags(command *cobra.Command) {
	addTaskScopeFlags(command)
	command.Flags().String("workspace-id", "", "workspace ID to link (required)")
}

func readTaskScopeFlags(command *cobra.Command) (taskScope, error) {
	projectID, err := command.Flags().GetString("project-id")
	if err != nil {
		return taskScope{}, err
	}
	global, err := command.Flags().GetBool("global")
	if err != nil {
		return taskScope{}, err
	}
	organizationID, err := command.Flags().GetString("org-id")
	if err != nil {
		return taskScope{}, err
	}
	return resolveTaskScope(projectID, global, organizationID)
}
