package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"unicode/utf16"

	"yishan/apps/cli/internal/agent/dsh"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	"yishan/apps/cli/internal/rpc"
)

type dshTaskStartInput struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Priority    domain.Priority `json:"priority,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	WorkspaceID string          `json:"workspaceId,omitempty"`
}

type dshTaskUpdateInput struct {
	ID          string           `json:"id"`
	Title       *string          `json:"title,omitempty"`
	Description *string          `json:"description,omitempty"`
	Status      *domain.Status   `json:"status,omitempty"`
	Priority    *domain.Priority `json:"priority,omitempty"`
	Tags        *[]string        `json:"tags,omitempty"`
}

type dshTaskListResult struct {
	Tasks []domain.Task `json:"tasks"`
}

type dshTaskSearchResult struct {
	Tasks []domain.SearchResult `json:"tasks"`
}

func executeDSHTaskMetadata(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (any, error) {
	switch request.Operation {
	case dshTaskStartOperation:
		return executeDSHTaskStart(ctx, tasks, scope, request)
	case dshTaskListOperation:
		return executeDSHTaskList(ctx, tasks, scope, request)
	case dshTaskSearchOperation:
		return executeDSHTaskSearch(ctx, tasks, scope, request)
	case dshTaskUpdateOperation:
		return executeDSHTaskUpdate(ctx, tasks, scope, request)
	default:
		return nil, errors.New("unsupported task metadata operation")
	}
}

func executeDSHTaskStart(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (domain.Task, error) {
	input, err := decodeDSHCapabilityInput[dshTaskStartInput](request, dshTaskStartOperation)
	if err != nil || !validUTF16Length(input.Title, 1, 200) || !validUTF16Length(input.Description, 0, 10_000) {
		return domain.Task{}, errors.New("task start input is invalid")
	}
	if err := scope.authorizeWorkspaceID(input.WorkspaceID); err != nil {
		return domain.Task{}, err
	}
	projectID, organizationID := scope.workspace.ProjectID, scope.workspace.OrgID
	value, err := tasks.Create(ctx, rpc.LocalTaskCreateParams{ProjectID: &projectID, OrganizationID: &organizationID, Title: input.Title, Description: input.Description, Priority: input.Priority, Tags: input.Tags})
	if err != nil {
		return domain.Task{}, err
	}
	created := value.(domain.Task)
	if input.WorkspaceID != "" {
		if _, err := tasks.LinkWorkspace(ctx, rpc.LocalTaskLinkWorkspaceParams{TaskID: created.ID, WorkspaceID: input.WorkspaceID}); err != nil {
			return domain.Task{}, fmt.Errorf("task %s was created but could not be linked to requested workspace %s: %w", created.ID, input.WorkspaceID, err)
		}
	}
	return created, nil
}

func executeDSHTaskList(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (dshTaskListResult, error) {
	input, err := decodeDSHCapabilityInput[dshTaskListInput](request, dshTaskListOperation)
	if err != nil {
		return dshTaskListResult{}, err
	}
	params, err := scope.taskListParams(input)
	if err != nil {
		return dshTaskListResult{}, err
	}
	value, err := tasks.List(ctx, params)
	if err != nil {
		return dshTaskListResult{}, err
	}
	return dshTaskListResult{Tasks: scope.filterTasks(value.([]domain.Task))}, nil
}

func executeDSHTaskSearch(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (dshTaskSearchResult, error) {
	input, err := decodeDSHCapabilityInput[dshTaskSearchInput](request, dshTaskSearchOperation)
	if err != nil || !validUTF16Length(input.Query, 1, 10_000) {
		return dshTaskSearchResult{}, errors.New("task search input is invalid")
	}
	params, err := scope.taskListParams(input.dshTaskListInput)
	if err != nil {
		return dshTaskSearchResult{}, err
	}
	value, err := tasks.Search(ctx, rpc.LocalTaskSearchParams{Query: input.Query, LocalTaskListParams: params})
	if err != nil {
		return dshTaskSearchResult{}, err
	}
	return dshTaskSearchResult{Tasks: scope.filterSearchResults(value.([]domain.SearchResult))}, nil
}

func executeDSHTaskUpdate(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (domain.Task, error) {
	input, err := decodeDSHCapabilityInput[dshTaskUpdateInput](request, dshTaskUpdateOperation)
	if err != nil || input.ID == "" || !validOptionalUTF16Length(input.Title, 1, 200) || !validOptionalUTF16Length(input.Description, 0, 10_000) {
		return domain.Task{}, errors.New("task update input is invalid")
	}
	if input.Status != nil && *input.Status == domain.StatusDone {
		return domain.Task{}, errors.New("task_finish owns the done transition")
	}
	if _, err := getAuthorizedDSHTask(ctx, tasks, scope, input.ID); err != nil {
		return domain.Task{}, err
	}
	value, err := tasks.Update(ctx, rpc.LocalTaskUpdateParams{ID: input.ID, Title: input.Title, Description: input.Description, Status: input.Status, Priority: input.Priority, Tags: input.Tags})
	if err != nil {
		return domain.Task{}, err
	}
	updated := value.(domain.Task)
	return updated, scope.authorizeTask(updated)
}

func (scope dshTaskScope) taskListParams(input dshTaskListInput) (rpc.LocalTaskListParams, error) {
	if err := scope.authorizeWorkspaceID(input.WorkspaceID); err != nil {
		return rpc.LocalTaskListParams{}, err
	}
	status, statuses, err := parseDSHTaskStatuses(input.Status)
	if err != nil {
		return rpc.LocalTaskListParams{}, err
	}
	projectID := scope.workspace.ProjectID
	params := rpc.LocalTaskListParams{ProjectID: &projectID, Status: status, Statuses: statuses, Priority: input.Priority, Tags: input.Tags}
	if input.WorkspaceID != "" {
		params.WorkspaceID = &input.WorkspaceID
	}
	return params, nil
}

func (scope dshTaskScope) filterTasks(tasks []domain.Task) []domain.Task {
	filtered := make([]domain.Task, 0, len(tasks))
	for _, task := range tasks {
		if scope.authorizeTask(task) == nil {
			filtered = append(filtered, task)
		}
	}
	return filtered
}

func (scope dshTaskScope) filterSearchResults(results []domain.SearchResult) []domain.SearchResult {
	filtered := make([]domain.SearchResult, 0, len(results))
	for _, result := range results {
		if scope.authorizeTask(result.Task) == nil {
			filtered = append(filtered, result)
		}
	}
	return filtered
}

func parseDSHTaskStatuses(raw json.RawMessage) (*domain.Status, []domain.Status, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil, nil
	}
	if raw[0] == '[' {
		var statuses []domain.Status
		if err := json.Unmarshal(raw, &statuses); err != nil || len(statuses) == 0 || len(statuses) > 4 {
			return nil, nil, errors.New("task status filter is invalid")
		}
		for _, status := range statuses {
			if !validDSHTaskStatus(status) {
				return nil, nil, errors.New("task status filter is invalid")
			}
		}
		return nil, statuses, nil
	}
	var status domain.Status
	if err := json.Unmarshal(raw, &status); err != nil || !validDSHTaskStatus(status) {
		return nil, nil, errors.New("task status filter is invalid")
	}
	return &status, nil, nil
}

func validDSHTaskStatus(status domain.Status) bool {
	return status == domain.StatusNew || status == domain.StatusProgressing || status == domain.StatusDone || status == domain.StatusCancelled
}

func getAuthorizedDSHTask(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, id string) (domain.Task, error) {
	value, err := tasks.Get(ctx, rpc.LocalTaskIDParams{ID: id})
	if err != nil {
		return domain.Task{}, err
	}
	task := value.(domain.Task)
	return task, scope.authorizeTask(task)
}

func validUTF16Length(value string, minimum, maximum int) bool {
	length := len(utf16.Encode([]rune(value)))
	return length >= minimum && length <= maximum
}

func validOptionalUTF16Length(value *string, minimum, maximum int) bool {
	return value == nil || validUTF16Length(*value, minimum, maximum)
}
