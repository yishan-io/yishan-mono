package app

import (
	"context"
	"errors"
	"fmt"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/memory"
	nodeworkspace "yishan/apps/cli/internal/node/workspace"
	"yishan/apps/cli/internal/workspace"
)

const (
	dshMemorySearchOperation    = "memory.search"
	dshMemoryReadOperation      = "memory.read"
	dshMemoryStoreOperation     = "memory.store"
	dshMemoryReconcileOperation = "memory.reconcile"
)

type dshMemorySearchInput struct {
	Query     string `json:"query"`
	ProjectID string `json:"projectId,omitempty"`
	Scope     string `json:"scope,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

type dshMemoryReadInput struct {
	ProjectRoot string `json:"projectRoot,omitempty"`
	Path        string `json:"path"`
}

type dshMemoryStoreInput struct {
	ProjectRoot string `json:"projectRoot,omitempty"`
	Section     string `json:"section"`
	Entry       string `json:"entry"`
	Date        string `json:"date"`
}

type dshMemorySearchResult struct {
	Path         string  `json:"path"`
	Snippet      string  `json:"snippet"`
	Score        float64 `json:"score"`
	Source       string  `json:"source,omitempty"`
	TaskID       string  `json:"taskId,omitempty"`
	TaskTitle    string  `json:"taskTitle,omitempty"`
	DocumentType string  `json:"documentType,omitempty"`
}

type dshMemoryReadResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type dshMemoryStoreResult struct {
	Path    string `json:"path"`
	Section string `json:"section"`
}

type dshMemoryReconcileResult struct {
	Inserted int `json:"inserted"`
	Updated  int `json:"updated"`
	Deleted  int `json:"deleted"`
}

func executeDSHMemoryCapability(ctx context.Context, workspaces *nodeworkspace.Service, memories *memory.Service, request dsh.CapabilityRequest) (any, error) {
	if memories == nil {
		return nil, errors.New("memory service is unavailable")
	}
	admitted, err := workspaces.GetWorkspace(request.WorkspaceID)
	if err != nil {
		return nil, err
	}
	switch request.Operation {
	case dshMemorySearchOperation:
		return executeDSHMemorySearch(ctx, memories, admitted, request)
	case dshMemoryReadOperation:
		return executeDSHMemoryRead(memories, admitted, request)
	case dshMemoryStoreOperation:
		return executeDSHMemoryStore(memories, admitted, request)
	case dshMemoryReconcileOperation:
		return executeDSHMemoryReconcile(memories, workspaces, request)
	default:
		return nil, fmt.Errorf("unsupported memory capability operation %q", request.Operation)
	}
}

func executeDSHMemorySearch(ctx context.Context, service *memory.Service, admitted workspace.Workspace, request dsh.CapabilityRequest) ([]dshMemorySearchResult, error) {
	input, err := decodeDSHCapabilityInput[dshMemorySearchInput](request, dshMemorySearchOperation)
	if err != nil || input.Query == "" || input.Limit < 0 || input.Limit > 100 || input.Scope != "" && input.Scope != "project" && input.Scope != "global" {
		return nil, errors.New("memory search input is invalid")
	}
	return resolveDSHMemorySearch(ctx, service, admitted, input)
}

func executeDSHMemoryRead(service *memory.Service, admitted workspace.Workspace, request dsh.CapabilityRequest) (dshMemoryReadResult, error) {
	input, err := decodeDSHCapabilityInput[dshMemoryReadInput](request, dshMemoryReadOperation)
	if err != nil || input.Path == "" {
		return dshMemoryReadResult{}, errors.New("memory read input is invalid")
	}
	return resolveDSHMemoryRead(service, admitted, input)
}

func executeDSHMemoryStore(service *memory.Service, admitted workspace.Workspace, request dsh.CapabilityRequest) (dshMemoryStoreResult, error) {
	input, err := decodeDSHCapabilityInput[dshMemoryStoreInput](request, dshMemoryStoreOperation)
	if err != nil || input.Entry == "" || input.Date == "" || input.Section != "locked_decisions" && input.Section != "durable_discoveries" {
		return dshMemoryStoreResult{}, errors.New("memory store input is invalid")
	}
	return resolveDSHMemoryStore(service, admitted, input)
}

func executeDSHMemoryReconcile(service *memory.Service, workspaces *nodeworkspace.Service, request dsh.CapabilityRequest) (dshMemoryReconcileResult, error) {
	if _, err := decodeDSHCapabilityInput[struct{}](request, dshMemoryReconcileOperation); err != nil {
		return dshMemoryReconcileResult{}, errors.New("memory reconcile input is invalid")
	}
	return resolveDSHMemoryReconcile(service, workspaces)
}

func resolveDSHMemorySearch(ctx context.Context, service *memory.Service, admitted workspace.Workspace, input dshMemorySearchInput) ([]dshMemorySearchResult, error) {
	if input.ProjectID != "" && input.ProjectID != admitted.ProjectID {
		return nil, errors.New("memory project is not authorized for this workspace")
	}
	projectID := admitted.ProjectID
	if input.Scope == "global" {
		projectID = ""
	}
	results, err := service.Search(ctx, input.Query, projectID, input.Scope, input.Limit)
	if err != nil {
		return nil, err
	}
	mapped := make([]dshMemorySearchResult, 0, len(results))
	for _, result := range results {
		mapped = append(mapped, dshMemorySearchResult{Path: result.Path, Snippet: result.Snippet, Score: result.Score, Source: result.Source, TaskID: result.TaskID, TaskTitle: result.TaskTitle, DocumentType: result.DocumentType})
	}
	return mapped, nil
}

func resolveDSHMemoryRead(service *memory.Service, admitted workspace.Workspace, input dshMemoryReadInput) (dshMemoryReadResult, error) {
	file, err := service.ReadProjectFile(admitted.Path, input.ProjectRoot, input.Path)
	if err != nil {
		return dshMemoryReadResult{}, err
	}
	return dshMemoryReadResult{Path: file.Path, Content: file.Content}, nil
}

func resolveDSHMemoryStore(service *memory.Service, admitted workspace.Workspace, input dshMemoryStoreInput) (dshMemoryStoreResult, error) {
	path, err := service.StoreProjectEntry(admitted.Path, input.ProjectRoot, admitted.ProjectID, input.Section, input.Entry, input.Date)
	if err != nil {
		return dshMemoryStoreResult{}, err
	}
	return dshMemoryStoreResult{Path: path, Section: input.Section}, nil
}

func resolveDSHMemoryReconcile(service *memory.Service, workspaces *nodeworkspace.Service) (dshMemoryReconcileResult, error) {
	listed, err := workspaces.ListWorkspaces()
	if err != nil {
		return dshMemoryReconcileResult{}, err
	}
	items, ok := listed.([]workspace.Workspace)
	if !ok {
		return dshMemoryReconcileResult{}, errors.New("workspace list result is invalid")
	}
	refs := make([]memory.WorkspaceRef, 0, len(items))
	for _, item := range items {
		if item.Path != "" {
			refs = append(refs, memory.WorkspaceRef{WorktreePath: item.Path, ProjectID: item.ProjectID})
		}
	}
	result, err := service.ReconcileRegistered(refs)
	return dshMemoryReconcileResult{Inserted: result.Inserted, Updated: result.Updated, Deleted: result.Deleted}, err
}
