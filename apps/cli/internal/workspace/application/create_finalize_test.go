package application

import (
	"context"
	"errors"
	"testing"

	"yishan/apps/cli/internal/workspace"
)

type createFinalizeEvents struct{}

func (createFinalizeEvents) Publish(string, any)                                      {}
func (createFinalizeEvents) SnapshotChanged(string, string, string, string)           {}
func (createFinalizeEvents) CreateStarted(StartedEvent)                               {}
func (createFinalizeEvents) CreateProgress(CreatePlan, workspace.CreateProgressEvent) {}
func (createFinalizeEvents) CreateFailed(CreatePlan, FailedEvent)                     {}
func (createFinalizeEvents) CreateCompleted(CreatePlan, workspace.Workspace, []any)   {}

func TestExecuteLocalCreate_WorkspaceAvailabilityChangesOnlyAfterSuccessfulFinalization(t *testing.T) {
	finalizeFailure := errors.New("finalize failed")
	tests := []struct {
		name          string
		finalizeErr   error
		wantErr       error
		wantRefreshes int
	}{
		{name: "failed finalization", finalizeErr: finalizeFailure, wantErr: finalizeFailure},
		{name: "successful finalization", wantRefreshes: 1},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			instances := &retryInstances{workspace: workspace.Workspace{ID: "workspace-1", Path: "/workspace"}}
			records := &retryRecords{finalizeErr: test.finalizeErr}
			refreshes := 0
			service := New(Dependencies{
				Instances: instances,
				Records:   records,
				Events:    createFinalizeEvents{},
				WorkspaceAvailabilityChanged: func() {
					if !records.didFinalize {
						t.Fatal("workspace availability changed before persistence finalized")
					}
					refreshes++
				},
			})
			request := workspace.CreateRequest{ID: "workspace-1", TargetBranch: "task-branch"}
			plan := CreatePlan{WorkspaceID: request.ID, LocalCreate: &request}

			err := service.executeLocalCreate(context.Background(), plan, nil)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("executeLocalCreate error = %v, want %v", err, test.wantErr)
			}
			if refreshes != test.wantRefreshes {
				t.Fatalf("workspace availability refreshes = %d, want %d", refreshes, test.wantRefreshes)
			}
		})
	}
}
