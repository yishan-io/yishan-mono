package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"yishan/apps/cli/internal/agent/dsh"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/workspace"
)

const (
	dshTaskStartOperation        = "task.start"
	dshTaskListOperation         = "task.list"
	dshTaskSearchOperation       = "task.search"
	dshTaskReadOperation         = "task.read"
	dshTaskUpdateOperation       = "task.update"
	dshTaskWriteOperation        = "task.write"
	dshTaskAppendNoteOperation   = "task.appendNote"
	dshTaskFinishOperation       = "task.finish"
	dshTaskTemplateReadOperation = "task.templateRead"
)

type dshTaskScope struct {
	workspace workspace.Workspace
}

type dshTaskListInput struct {
	Status      json.RawMessage  `json:"status,omitempty"`
	Priority    *domain.Priority `json:"priority,omitempty"`
	WorkspaceID string           `json:"workspaceId,omitempty"`
	Tags        []string         `json:"tags,omitempty"`
}

type dshTaskSearchInput struct {
	Query string `json:"query"`
	dshTaskListInput
}

func executeDSHTaskCapability(ctx context.Context, workspaces *nodeworkspace.Service, tasks *nodelocaltask.Service, request dsh.CapabilityRequest) (any, error) {
	if tasks == nil {
		return nil, errors.New("local task service is unavailable")
	}
	scope, err := resolveDSHTaskScope(workspaces, request.WorkspaceID)
	if err != nil {
		return nil, err
	}
	switch request.Operation {
	case dshTaskStartOperation, dshTaskListOperation, dshTaskSearchOperation, dshTaskUpdateOperation:
		return executeDSHTaskMetadata(ctx, tasks, scope, request)
	case dshTaskReadOperation, dshTaskWriteOperation, dshTaskAppendNoteOperation, dshTaskFinishOperation:
		return executeDSHTaskDocument(ctx, tasks, scope, request)
	case dshTaskTemplateReadOperation:
		return executeDSHTaskTemplateRead(ctx, tasks, request)
	default:
		return nil, fmt.Errorf("unsupported task capability operation %q", request.Operation)
	}
}

func resolveDSHTaskScope(workspaces *nodeworkspace.Service, workspaceID string) (dshTaskScope, error) {
	admitted, err := workspaces.GetWorkspace(workspaceID)
	if err != nil {
		return dshTaskScope{}, err
	}
	if admitted.Path == "" || admitted.State != workspace.StateActive || admitted.Health != workspace.HealthOK {
		return dshTaskScope{}, errors.New("task workspace is not active")
	}
	return dshTaskScope{workspace: admitted}, nil
}

func (scope dshTaskScope) authorizeTask(task domain.Task) error {
	if task.ProjectID == nil || *task.ProjectID != scope.workspace.ProjectID {
		return errors.New("task does not belong to the authorized project")
	}
	if !optionalStringMatches(task.OrganizationID, scope.workspace.OrgID) {
		return errors.New("task does not belong to the authorized organization")
	}
	return nil
}

func (scope dshTaskScope) authorizeWorkspaceID(workspaceID string) error {
	if workspaceID != "" && workspaceID != scope.workspace.ID {
		return errors.New("task workspace filter must use the authorized workspace")
	}
	return nil
}

func optionalStringMatches(value *string, expected string) bool {
	if value == nil {
		return expected == ""
	}
	return *value == expected
}
