package app

import (
	"context"
	"errors"
	"fmt"

	"yishan/apps/cli/internal/agent/dsh"
	agentkind "yishan/apps/cli/internal/agent/kind"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

const (
	dshWorkspaceListOperation   = "workspace.list"
	dshWorkspaceFindOperation   = "workspace.find"
	dshWorkspaceCreateOperation = "workspace.create"
	dshWorkspaceCloseOperation  = "workspace.close"
)

type dshWorkspaceRecord struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId,omitempty"`
	ProjectID      string `json:"projectId,omitempty"`
	NodeID         string `json:"nodeId,omitempty"`
	Kind           string `json:"kind,omitempty"`
	Status         string `json:"status,omitempty"`
	Branch         string `json:"branch,omitempty"`
	SourceBranch   string `json:"sourceBranch,omitempty"`
	LocalPath      string `json:"localPath,omitempty"`
	CreatedAt      string `json:"createdAt,omitempty"`
	UpdatedAt      string `json:"updatedAt,omitempty"`
}

type dshWorkspaceListInput struct {
	ProjectID string `json:"projectId,omitempty"`
	OrgID     string `json:"orgId,omitempty"`
}

type dshWorkspaceFindInput struct {
	ProjectID   string `json:"projectId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	OrgID       string `json:"orgId,omitempty"`
}

type dshWorkspaceCreateInput struct {
	ProjectID     string `json:"projectId,omitempty"`
	OrgID         string `json:"orgId,omitempty"`
	Branch        string `json:"branch"`
	SourceBranch  string `json:"sourceBranch,omitempty"`
	Name          string `json:"name,omitempty"`
	TargetNode    string `json:"targetNode,omitempty"`
	TaskRunPrompt string `json:"taskRunPrompt,omitempty"`
	TaskRunModel  string `json:"taskRunModel,omitempty"`
}

type dshWorkspaceCloseInput struct {
	ProjectID   string `json:"projectId,omitempty"`
	WorkspaceID string `json:"workspaceId,omitempty"`
	OrgID       string `json:"orgId,omitempty"`
}

type dshWorkspaceListResult struct {
	Workspaces []dshWorkspaceRecord `json:"workspaces"`
}

type dshWorkspaceFindResult struct {
	Workspace      dshWorkspaceRecord `json:"workspace"`
	OrganizationID string             `json:"organizationId,omitempty"`
	ProjectID      string             `json:"projectId,omitempty"`
}

type dshWorkspaceCreateResult struct {
	WorkspaceID string `json:"workspaceId"`
	LocalPath   string `json:"localPath,omitempty"`
	Stdout      string `json:"stdout"`
}

type dshWorkspaceCloseResult struct {
	Workspace dshWorkspaceRecord `json:"workspace"`
}

func resolveDSHWorkspaceCapability(service *nodeworkspace.Service) dsh.CapabilityResolver {
	return func(ctx context.Context, request dsh.CapabilityRequest) (any, error) {
		return executeDSHWorkspaceCapability(ctx, service, request)
	}
}

func executeDSHWorkspaceCapability(ctx context.Context, service *nodeworkspace.Service, request dsh.CapabilityRequest) (any, error) {
	switch request.Operation {
	case dshWorkspaceListOperation:
		input, err := decodeDSHCapabilityInput[dshWorkspaceListInput](request, dshWorkspaceListOperation)
		if err != nil {
			return nil, err
		}
		return resolveDSHWorkspaceList(service, input)
	case dshWorkspaceFindOperation:
		input, err := decodeDSHCapabilityInput[dshWorkspaceFindInput](request, dshWorkspaceFindOperation)
		if err != nil {
			return nil, err
		}
		return resolveDSHWorkspaceFind(service, request.WorkspaceID, input)
	case dshWorkspaceCreateOperation:
		input, err := decodeDSHCapabilityInput[dshWorkspaceCreateInput](request, dshWorkspaceCreateOperation)
		if err != nil || input.Branch == "" {
			return nil, errors.New("workspace create input is invalid")
		}
		return resolveDSHWorkspaceCreate(ctx, service, input)
	case dshWorkspaceCloseOperation:
		input, err := decodeDSHCapabilityInput[dshWorkspaceCloseInput](request, dshWorkspaceCloseOperation)
		if err != nil {
			return nil, err
		}
		return resolveDSHWorkspaceClose(ctx, service, request.WorkspaceID, input)
	default:
		return nil, fmt.Errorf("unsupported workspace capability operation %q", request.Operation)
	}
}

func resolveDSHWorkspaceList(service *nodeworkspace.Service, input dshWorkspaceListInput) (dshWorkspaceListResult, error) {
	listed, err := service.ListWorkspaces()
	if err != nil {
		return dshWorkspaceListResult{}, err
	}
	workspaces, ok := listed.([]workspace.Workspace)
	if !ok {
		return dshWorkspaceListResult{}, errors.New("workspace list result is invalid")
	}
	result := make([]dshWorkspaceRecord, 0, len(workspaces))
	for _, item := range workspaces {
		if (input.ProjectID == "" || item.ProjectID == input.ProjectID) && (input.OrgID == "" || item.OrgID == input.OrgID) {
			result = append(result, mapDSHWorkspaceRecord(item))
		}
	}
	return dshWorkspaceListResult{Workspaces: result}, nil
}

func resolveDSHWorkspaceFind(service *nodeworkspace.Service, admittedWorkspaceID string, input dshWorkspaceFindInput) (dshWorkspaceFindResult, error) {
	workspaceID := input.WorkspaceID
	if workspaceID == "" {
		workspaceID = admittedWorkspaceID
	}
	item, err := service.GetWorkspace(workspaceID)
	if err != nil {
		return dshWorkspaceFindResult{}, err
	}
	if input.ProjectID != "" && input.ProjectID != item.ProjectID || input.OrgID != "" && input.OrgID != item.OrgID {
		return dshWorkspaceFindResult{}, errors.New("workspace does not match requested project")
	}
	return dshWorkspaceFindResult{Workspace: mapDSHWorkspaceRecord(item), OrganizationID: item.OrgID, ProjectID: item.ProjectID}, nil
}

func resolveDSHWorkspaceCreate(ctx context.Context, service *nodeworkspace.Service, input dshWorkspaceCreateInput) (dshWorkspaceCreateResult, error) {
	created, err := service.Create(ctx, buildDSHWorkspaceCreateParams(input))
	if err != nil {
		return dshWorkspaceCreateResult{}, err
	}
	payload, ok := created.(map[string]any)
	if !ok {
		return dshWorkspaceCreateResult{}, errors.New("workspace create result is invalid")
	}
	workspaceID, ok := payload["id"].(string)
	if !ok || workspaceID == "" {
		return dshWorkspaceCreateResult{}, errors.New("workspace create result is invalid")
	}
	return dshWorkspaceCreateResult{WorkspaceID: workspaceID, Stdout: ""}, nil
}

func buildDSHWorkspaceCreateParams(input dshWorkspaceCreateInput) rpc.WorkspaceCreateParams {
	params := rpc.WorkspaceCreateParams{OrganizationID: input.OrgID, ProjectID: input.ProjectID, NodeID: input.TargetNode, WorkspaceName: input.Name, TargetBranch: input.Branch, Branch: input.Branch, SourceBranch: input.SourceBranch}
	if input.TaskRunPrompt != "" {
		params.TaskRun = &workspace.TaskRunConfig{Runtime: workspace.TaskRunRuntimeDSH, AgentKind: agentkind.Pi, Prompt: input.TaskRunPrompt, Model: input.TaskRunModel}
	}
	return params
}

func resolveDSHWorkspaceClose(ctx context.Context, service *nodeworkspace.Service, admittedWorkspaceID string, input dshWorkspaceCloseInput) (dshWorkspaceCloseResult, error) {
	workspaceID := input.WorkspaceID
	if workspaceID == "" {
		workspaceID = admittedWorkspaceID
	}
	item, err := service.GetWorkspace(workspaceID)
	if err != nil {
		return dshWorkspaceCloseResult{}, err
	}
	projectID, orgID := input.ProjectID, input.OrgID
	if projectID == "" {
		projectID = item.ProjectID
	}
	if orgID == "" {
		orgID = item.OrgID
	}
	if _, err := service.Close(ctx, rpc.WorkspaceCloseParams{WorkspaceID: workspaceID, ProjectID: projectID, OrganizationID: orgID}); err != nil {
		return dshWorkspaceCloseResult{}, err
	}
	return dshWorkspaceCloseResult{Workspace: mapDSHWorkspaceRecord(item)}, nil
}

func mapDSHWorkspaceRecord(item workspace.Workspace) dshWorkspaceRecord {
	return dshWorkspaceRecord{ID: item.ID, OrganizationID: item.OrgID, ProjectID: item.ProjectID, Kind: string(item.Kind), Status: string(item.State), LocalPath: item.Path}
}
