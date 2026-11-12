package cmd

import (
	"strings"

	"github.com/spf13/cobra"

	"yishan/apps/cli/cmd/output"
	"yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

// taskStartInput is the validated create request plus an optional workspace link.
type taskStartInput struct {
	create      rpc.LocalTaskCreateParams
	workspaceID string
}

// addTaskScopeFlags registers the explicit scope flags every task command shares.
func addTaskScopeFlags(command *cobra.Command) {
	command.Flags().String("project-id", "", "project ID (defaults to YISHAN_PROJECT_ID)")
	command.Flags().Bool("global", false, "use the global scope instead of a project")
	addOrgIDFlag(command)
}

func buildTaskStartInput(command *cobra.Command, scope taskScope) (taskStartInput, error) {
	title, err := command.Flags().GetString("title")
	if err != nil {
		return taskStartInput{}, err
	}
	if strings.TrimSpace(title) == "" {
		return taskStartInput{}, newUsageError("--title is required")
	}
	description, err := buildTaskDescription(command)
	if err != nil {
		return taskStartInput{}, err
	}
	priority, err := readTaskPriority(command)
	if err != nil {
		return taskStartInput{}, err
	}
	tags, err := command.Flags().GetStringArray("tag")
	if err != nil {
		return taskStartInput{}, err
	}
	workspaceID, err := command.Flags().GetString("workspace-id")
	if err != nil {
		return taskStartInput{}, err
	}
	return taskStartInput{
		create: rpc.LocalTaskCreateParams{
			ProjectID:      scope.projectID,
			OrganizationID: scope.organizationID,
			Title:          strings.TrimSpace(title),
			Description:    description,
			Priority:       priority,
			Tags:           trimEmptyValues(tags),
		},
		workspaceID: strings.TrimSpace(workspaceID),
	}, nil
}

// buildTaskDescription builds the same description sections Pi task tools use.
// A free-form description and section inputs are mutually exclusive.
func buildTaskDescription(command *cobra.Command) (string, error) {
	description, err := command.Flags().GetString("description")
	if err != nil {
		return "", err
	}
	goal, err := command.Flags().GetString("goal")
	if err != nil {
		return "", err
	}
	contextText, err := command.Flags().GetString("context")
	if err != nil {
		return "", err
	}
	rawCriteria, err := command.Flags().GetStringArray("acceptance-criterion")
	if err != nil {
		return "", err
	}
	criteria, err := trimCriteria(rawCriteria)
	if err != nil {
		return "", err
	}
	description = strings.TrimSpace(description)
	if description != "" && (strings.TrimSpace(goal) != "" || strings.TrimSpace(contextText) != "" || len(criteria) > 0) {
		return "", newUsageError("provide --description or --goal/--context/--acceptance-criterion, not both")
	}
	if description != "" {
		return description, nil
	}
	return joinTaskDescriptionSections(goal, contextText, criteria), nil
}

func joinTaskDescriptionSections(goal string, contextText string, criteria []string) string {
	sections := make([]string, 0, 3)
	if trimmedGoal := strings.TrimSpace(goal); trimmedGoal != "" {
		sections = append(sections, "## Goal\n\n"+trimmedGoal)
	}
	if trimmedContext := strings.TrimSpace(contextText); trimmedContext != "" {
		sections = append(sections, "## Context\n\n"+trimmedContext)
	}
	if len(criteria) > 0 {
		bullets := make([]string, 0, len(criteria))
		for _, criterion := range criteria {
			bullets = append(bullets, "- "+criterion)
		}
		sections = append(sections, "## Acceptance Criteria\n\n"+strings.Join(bullets, "\n"))
	}
	return strings.Join(sections, "\n\n")
}

func trimCriteria(rawCriteria []string) ([]string, error) {
	criteria := make([]string, 0, len(rawCriteria))
	for _, criterion := range rawCriteria {
		trimmed := strings.TrimSpace(criterion)
		if trimmed == "" {
			return nil, newUsageError("--acceptance-criterion must not be empty")
		}
		criteria = append(criteria, trimmed)
	}
	return criteria, nil
}

func buildTaskListRequest(command *cobra.Command, scope taskScope) (taskListRequest, error) {
	statuses, err := command.Flags().GetStringArray("status")
	if err != nil {
		return taskListRequest{}, err
	}
	if err := validateTaskStatuses(statuses); err != nil {
		return taskListRequest{}, err
	}
	priority, err := readTaskPriority(command)
	if err != nil {
		return taskListRequest{}, err
	}
	workspaceID, err := command.Flags().GetString("workspace-id")
	if err != nil {
		return taskListRequest{}, err
	}
	tags, err := command.Flags().GetStringArray("tag")
	if err != nil {
		return taskListRequest{}, err
	}
	return taskListRequest{
		ProjectID:   scope.projectID,
		Status:      trimEmptyValues(statuses),
		Priority:    string(priority),
		WorkspaceID: strings.TrimSpace(workspaceID),
		Tags:        trimEmptyValues(tags),
	}, nil
}

func buildTaskUpdateRequest(command *cobra.Command) (rpc.LocalTaskUpdateParams, error) {
	update := rpc.LocalTaskUpdateParams{}
	hasChange := false
	for _, apply := range taskUpdateApplyFunctions {
		changed, err := apply(command, &update)
		if err != nil {
			return update, err
		}
		hasChange = hasChange || changed
	}
	if !hasChange {
		return update, newUsageError("no update fields given: pass --title, --description, --status, --priority, or --tag")
	}
	return update, nil
}

// taskUpdateApplyFunctions lists the field appliers in flag order.
var taskUpdateApplyFunctions = []func(*cobra.Command, *rpc.LocalTaskUpdateParams) (bool, error){
	applyTaskTitleUpdate, applyTaskDescriptionUpdate, applyTaskStatusUpdate,
	applyTaskPriorityUpdate, applyTaskTagsUpdate,
}

func applyTaskTitleUpdate(command *cobra.Command, update *rpc.LocalTaskUpdateParams) (bool, error) {
	if !command.Flags().Changed("title") {
		return false, nil
	}
	title, err := command.Flags().GetString("title")
	if err != nil {
		return false, err
	}
	trimmedTitle := strings.TrimSpace(title)
	if trimmedTitle == "" {
		return false, newUsageError("--title must not be empty")
	}
	update.Title = &trimmedTitle
	return true, nil
}

func applyTaskDescriptionUpdate(command *cobra.Command, update *rpc.LocalTaskUpdateParams) (bool, error) {
	if !command.Flags().Changed("description") {
		return false, nil
	}
	description, err := command.Flags().GetString("description")
	if err != nil {
		return false, err
	}
	update.Description = &description
	return true, nil
}

func applyTaskStatusUpdate(command *cobra.Command, update *rpc.LocalTaskUpdateParams) (bool, error) {
	if !command.Flags().Changed("status") {
		return false, nil
	}
	status, err := readTaskUpdateStatus(command)
	if err != nil {
		return false, err
	}
	update.Status = &status
	return true, nil
}

func applyTaskPriorityUpdate(command *cobra.Command, update *rpc.LocalTaskUpdateParams) (bool, error) {
	if !command.Flags().Changed("priority") {
		return false, nil
	}
	priority, err := readTaskPriority(command)
	if err != nil {
		return false, err
	}
	update.Priority = &priority
	return true, nil
}

func applyTaskTagsUpdate(command *cobra.Command, update *rpc.LocalTaskUpdateParams) (bool, error) {
	if !command.Flags().Changed("tag") {
		return false, nil
	}
	tags, err := command.Flags().GetStringArray("tag")
	if err != nil {
		return false, err
	}
	trimmedTags := trimEmptyValues(tags)
	update.Tags = &trimmedTags
	return true, nil
}

func readTaskUpdateStatus(command *cobra.Command) (localtask.Status, error) {
	raw, err := command.Flags().GetString("status")
	if err != nil {
		return "", err
	}
	status := localtask.Status(strings.TrimSpace(raw))
	switch status {
	case localtask.StatusNew, localtask.StatusProgressing, localtask.StatusCancelled:
		return status, nil
	case localtask.StatusDone:
		return "", newUsageError("task update cannot set done: use \"yishan task finish <id>\"")
	default:
		return "", newUsageError("invalid --status %q: use new, progressing, or cancelled", raw)
	}
}

func readTaskPriority(command *cobra.Command) (localtask.Priority, error) {
	raw, err := command.Flags().GetString("priority")
	if err != nil {
		return "", err
	}
	priority := localtask.Priority(strings.TrimSpace(raw))
	switch priority {
	case "":
		return "", nil
	case localtask.PriorityLow, localtask.PriorityMedium, localtask.PriorityHigh:
		return priority, nil
	default:
		return "", newUsageError("invalid --priority %q: use low, medium, or high", raw)
	}
}

func validateTaskStatuses(statuses []string) error {
	for _, raw := range statuses {
		status := localtask.Status(strings.TrimSpace(raw))
		switch status {
		case localtask.StatusNew, localtask.StatusProgressing, localtask.StatusDone, localtask.StatusCancelled:
		case "":
			return newUsageError("--status must not be empty")
		default:
			return newUsageError("invalid --status %q: use new, progressing, done, or cancelled", raw)
		}
	}
	return nil
}

// loadScopedTask resolves one task by opaque ID or stable key and rejects tasks
// outside the command's explicit scope.
func loadScopedTask(client persistentDaemonRPCClient, scope taskScope, identifier string) (localtask.Task, error) {
	taskIdentifier := strings.TrimSpace(identifier)
	if taskIdentifier == "" {
		return localtask.Task{}, newUsageError("task id must not be empty")
	}
	var task localtask.Task
	err := client.Call(rpc.MethodLocalTaskGet, rpc.LocalTaskIDParams{ID: taskIdentifier}, &task)
	if err == nil {
		return assertTaskScope(task, scope)
	}
	if !isRPCCode(err, rpc.CodeNotFound) {
		return localtask.Task{}, err
	}
	keyedTask, keyErr := findTaskByKey(client, scope, taskIdentifier)
	if keyErr != nil {
		return localtask.Task{}, keyErr
	}
	if keyedTask != nil {
		return *keyedTask, nil
	}
	return localtask.Task{}, err
}

func findTaskByKey(client persistentDaemonRPCClient, scope taskScope, key string) (*localtask.Task, error) {
	var results []localtask.SearchResult
	request := taskSearchRequest{
		taskListRequest: taskListRequest{ProjectID: scope.projectID},
		Query:           key,
	}
	if err := client.Call(rpc.MethodLocalTaskSearch, request, &results); err != nil {
		return nil, err
	}
	for index := range results {
		if results[index].TaskKey != nil && *results[index].TaskKey == key && taskInScope(results[index].Task, scope) {
			return &results[index].Task, nil
		}
	}
	return nil, nil
}

func assertTaskScope(task localtask.Task, scope taskScope) (localtask.Task, error) {
	if !taskInScope(task, scope) {
		return localtask.Task{}, newUsageError("task %s does not belong to scope %s", task.ID, scope.describe())
	}
	return task, nil
}

// filterScopedTasks drops tasks outside the command scope. The daemon list and
// search filters tolerate a missing project ID (all projects), so a global
// scope must still be enforced here instead of trusting the wire filter.
func filterScopedTasks(tasks []localtask.Task, scope taskScope) []localtask.Task {
	scoped := make([]localtask.Task, 0, len(tasks))
	for _, task := range tasks {
		if taskInScope(task, scope) {
			scoped = append(scoped, task)
		}
	}
	return scoped
}

func taskInScope(task localtask.Task, scope taskScope) bool {
	if scope.projectID == nil {
		return task.ProjectID == nil
	}
	return task.ProjectID != nil && *task.ProjectID == *scope.projectID
}

// formatTaskBrief renders the read-only synthetic task brief, matching the Pi
// task_read brief so both clients show the same document.
func formatTaskBrief(task localtask.Task) string {
	tags := "none"
	if len(task.Tags) > 0 {
		tags = strings.Join(task.Tags, ", ")
	}
	project := "global"
	if task.ProjectID != nil {
		project = *task.ProjectID
	}
	description := task.Description
	if strings.TrimSpace(description) == "" {
		description = "No description provided."
	}
	lines := []string{
		"# " + task.Title, "",
		"**ID:** " + task.ID,
		"**Project:** " + project,
		"**Created:** " + task.CreatedAt,
		"**Updated:** " + task.UpdatedAt,
		"**Status:** " + string(task.Status),
		"**Priority:** " + string(task.Priority),
		"**Tags:** " + tags,
		"", "## Description", "", description, "",
	}
	return strings.Join(lines, "\n")
}

// printTaskDocument prints document text for humans and a JSON envelope for agents.
func printTaskDocument(id string, document string, content string) error {
	if !output.IsJSONOutput() {
		printContent(content)
		return nil
	}
	return output.PrintAny(map[string]any{"id": id, "document": document, "content": content})
}

func trimEmptyValues(values []string) []string {
	trimmed := make([]string, 0, len(values))
	for _, value := range values {
		if candidate := strings.TrimSpace(value); candidate != "" {
			trimmed = append(trimmed, candidate)
		}
	}
	return trimmed
}
