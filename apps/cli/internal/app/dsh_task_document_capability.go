package app

import (
	"context"
	"errors"

	"yishan/apps/cli/internal/agent/dsh"
	domain "yishan/apps/cli/internal/localtask"
	nodelocaltask "yishan/apps/cli/internal/node/localtask"
)

type dshTaskReadInput struct {
	ID       string `json:"id"`
	Document string `json:"document,omitempty"`
}

type dshTaskWriteInput struct {
	ID       string `json:"id"`
	Document string `json:"document"`
	Content  string `json:"content"`
}

type dshTaskAppendNoteInput struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

type dshTaskFinishInput struct {
	ID      string `json:"id"`
	Outcome string `json:"outcome"`
}

type dshTaskMetadataReadResult struct {
	Document string      `json:"document"`
	Task     domain.Task `json:"task"`
}

type dshTaskDocumentReadResult struct {
	ID       string `json:"id"`
	Document string `json:"document"`
	Content  string `json:"content"`
}

type dshTaskWriteResult struct {
	ID       string `json:"id"`
	Document string `json:"document,omitempty"`
}

type dshTaskFinishResult struct {
	ID     string        `json:"id"`
	Status domain.Status `json:"status"`
}

func executeDSHTaskDocument(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (any, error) {
	switch request.Operation {
	case dshTaskReadOperation:
		return executeDSHTaskRead(ctx, tasks, scope, request)
	case dshTaskWriteOperation:
		return executeDSHTaskWrite(ctx, tasks, scope, request)
	case dshTaskAppendNoteOperation:
		return executeDSHTaskAppendNote(ctx, tasks, scope, request)
	case dshTaskFinishOperation:
		return executeDSHTaskFinish(ctx, tasks, scope, request)
	default:
		return nil, errors.New("unsupported task document operation")
	}
}

func executeDSHTaskRead(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (any, error) {
	input, err := decodeDSHCapabilityInput[dshTaskReadInput](request, dshTaskReadOperation)
	if err != nil || input.ID == "" || !isTaskReadDocument(input.Document) {
		return nil, errors.New("task read input is invalid")
	}
	task, err := getAuthorizedDSHTask(ctx, tasks, scope, input.ID)
	if err != nil {
		return nil, err
	}
	if input.Document == "" || input.Document == "task" {
		return dshTaskMetadataReadResult{Document: "task", Task: task}, nil
	}
	content, err := tasks.ReadTaskDocument(ctx, taskDocumentRequest(scope, input.ID, input.Document, ""))
	if err != nil {
		return nil, err
	}
	return dshTaskDocumentReadResult{ID: input.ID, Document: input.Document, Content: content}, nil
}

func executeDSHTaskWrite(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (dshTaskWriteResult, error) {
	input, err := decodeDSHCapabilityInput[dshTaskWriteInput](request, dshTaskWriteOperation)
	if err != nil || input.ID == "" || !isWritableTaskDocument(input.Document) || !validUTF16Length(input.Content, 1, 50_000) {
		return dshTaskWriteResult{}, errors.New("task write input is invalid")
	}
	if _, err := getAuthorizedDSHTask(ctx, tasks, scope, input.ID); err != nil {
		return dshTaskWriteResult{}, err
	}
	if err := tasks.WriteTaskDocument(ctx, taskDocumentRequest(scope, input.ID, input.Document, input.Content)); err != nil {
		return dshTaskWriteResult{}, err
	}
	return dshTaskWriteResult{ID: input.ID, Document: input.Document}, nil
}

func executeDSHTaskAppendNote(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (dshTaskWriteResult, error) {
	input, err := decodeDSHCapabilityInput[dshTaskAppendNoteInput](request, dshTaskAppendNoteOperation)
	if err != nil || input.ID == "" || !validUTF16Length(input.Content, 1, 50_000) {
		return dshTaskWriteResult{}, errors.New("task append input is invalid")
	}
	if _, err := getAuthorizedDSHTask(ctx, tasks, scope, input.ID); err != nil {
		return dshTaskWriteResult{}, err
	}
	if err := tasks.AppendTaskNote(ctx, taskDocumentRequest(scope, input.ID, "notes", input.Content)); err != nil {
		return dshTaskWriteResult{}, err
	}
	return dshTaskWriteResult{ID: input.ID}, nil
}

func executeDSHTaskFinish(ctx context.Context, tasks *nodelocaltask.Service, scope dshTaskScope, request dsh.CapabilityRequest) (dshTaskFinishResult, error) {
	input, err := decodeDSHCapabilityInput[dshTaskFinishInput](request, dshTaskFinishOperation)
	if err != nil || input.ID == "" || !validUTF16Length(input.Outcome, 1, 50_000) {
		return dshTaskFinishResult{}, errors.New("task finish input is invalid")
	}
	if _, err := getAuthorizedDSHTask(ctx, tasks, scope, input.ID); err != nil {
		return dshTaskFinishResult{}, err
	}
	finished, err := tasks.FinishTask(ctx, taskDocumentRequest(scope, input.ID, "outcome", input.Outcome))
	if err != nil {
		return dshTaskFinishResult{}, err
	}
	return dshTaskFinishResult{ID: finished.ID, Status: finished.Status}, nil
}

func taskDocumentRequest(scope dshTaskScope, id, document, content string) nodelocaltask.TaskDocumentRequest {
	return nodelocaltask.TaskDocumentRequest{TaskID: id, WorkspaceRoot: scope.workspace.Path, Document: document, Content: content}
}

func isTaskReadDocument(document string) bool {
	return document == "" || document == "task" || isWritableTaskDocument(document)
}

func isWritableTaskDocument(document string) bool {
	return document == "notes" || document == "plan" || document == "outcome"
}
