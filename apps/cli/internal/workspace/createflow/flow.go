package createflow

import (
	"context"
	"yishan/apps/cli/internal/workspace"
)

type PreparedPlan struct {
	WorkspaceID   string
	LocalCreate   *workspace.CreateRequest
	RemoteRequest *WorkspaceCreateParams
}

type ExecutePreparedPlanDependencies struct {
	Now                  func() string
	DispatchRemote       func(req WorkspaceCreateParams) error
	RollbackRegistration func(context.Context)
	ExecuteLocalCreate   func(context.Context, workspace.CreateProgressReporter) error
	PublishProgress      func(workspace.CreateProgressEvent)
	PublishFailed        func(WorkspaceCreateFailedEvent)
}

type ExecuteLocalCreateDependencies struct {
	Now                         func() string
	CreateWorkspaceWithProgress func(context.Context, workspace.CreateRequest, workspace.CreateProgressReporter) (workspace.Workspace, error)
	RollbackRegistration        func(context.Context)
	FinalizeLocalCreate         func(context.Context, workspace.Workspace) error
	PublishProgress             func(workspace.CreateProgressEvent)
	PublishCompleted            func(workspace.Workspace)
}

func ExecutePreparedPlan(ctx context.Context, plan PreparedPlan, deps ExecutePreparedPlanDependencies) {
	reportProgress := func(event workspace.CreateProgressEvent) {
		if deps.PublishProgress != nil {
			deps.PublishProgress(event)
		}
	}

	reportFailed := func(message string) {
		reportProgress(BuildFailedProgressEvent(plan.WorkspaceID, message, deps.Now))
		if deps.PublishFailed != nil {
			deps.PublishFailed(WorkspaceCreateFailedEvent{WorkspaceID: plan.WorkspaceID, Message: message})
		}
	}

	if plan.RemoteRequest != nil {
		if deps.DispatchRemote != nil {
			if err := deps.DispatchRemote(*plan.RemoteRequest); err != nil {
				if deps.RollbackRegistration != nil {
					deps.RollbackRegistration(ctx)
				}
				reportFailed(err.Error())
			}
		}
		return
	}
	if plan.LocalCreate != nil && deps.ExecuteLocalCreate != nil {
		if err := deps.ExecuteLocalCreate(ctx, reportProgress); err != nil {
			reportFailed(err.Error())
		}
	}
}

func ExecuteLocalCreate(ctx context.Context, workspaceID string, req workspace.CreateRequest, deps ExecuteLocalCreateDependencies, reportProgress workspace.CreateProgressReporter) error {
	created, err := deps.CreateWorkspaceWithProgress(ctx, req, reportProgress)
	if err != nil {
		if deps.RollbackRegistration != nil {
			deps.RollbackRegistration(ctx)
		}
		return err
	}
	if deps.FinalizeLocalCreate != nil {
		if err := deps.FinalizeLocalCreate(ctx, created); err != nil {
			return err
		}
	}
	if reportProgress != nil {
		reportProgress(BuildCompletedProgressEvent(created.ID, deps.Now))
	}
	if deps.PublishCompleted != nil {
		deps.PublishCompleted(created)
	}
	return nil
}

func BuildFailedProgressEvent(workspaceID string, message string, now func() string) workspace.CreateProgressEvent {
	createdAt := ""
	if now != nil {
		createdAt = now()
	}
	return workspace.CreateProgressEvent{
		WorkspaceID: workspaceID,
		StepID:      "complete",
		Label:       "Prepare workspace",
		Status:      workspace.CreateProgressFailed,
		Message:     message,
		CreatedAt:   createdAt,
	}
}

func BuildCompletedProgressEvent(workspaceID string, now func() string) workspace.CreateProgressEvent {
	createdAt := ""
	if now != nil {
		createdAt = now()
	}
	return workspace.CreateProgressEvent{
		WorkspaceID: workspaceID,
		StepID:      "complete",
		Label:       "Prepare workspace",
		Status:      workspace.CreateProgressCompleted,
		CreatedAt:   createdAt,
	}
}
