package daemon

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"

	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) handleWorkspaceCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCreateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	prepared, err := h.prepareWorkspaceCreate(ctx, req)
	if err != nil {
		return nil, err
	}
	prepared, err = h.registerPreparedWorkspace(ctx, prepared, "")
	if err != nil {
		return nil, err
	}
	h.events.Publish(frontendEvent{Topic: "workspaceCreateStarted", Payload: prepared.startedEvent})

	go h.executeWorkspaceCreate(context.Background(), prepared)

	return map[string]any{"id": prepared.workspaceID, "status": "pending"}, nil
}

func (h *JSONRPCHandler) executeWorkspaceCreate(ctx context.Context, prepared preparedWorkspaceCreate) {
	defer func() {
		if r := recover(); r != nil {
			log.Error().Interface("panic", r).Str("workspaceId", prepared.workspaceID).Msg("panic in executeWorkspaceCreate")
		}
	}()

	createflow.ExecutePreparedPlan(ctx, createflow.PreparedPlan{
		WorkspaceID:   prepared.workspaceID,
		LocalCreate:   prepared.localCreate,
		RemoteRequest: prepared.remoteRequest,
	}, createflow.ExecutePreparedPlanDependencies{
		Now:            nowRFC3339Nano,
		DispatchRemote: h.dispatchRemoteWorkspaceCreate,
		RollbackRegistration: func(ctx context.Context) {
			h.rollbackWorkspaceCreateRegistration(ctx, prepared)
		},
		ExecuteLocalCreate: func(ctx context.Context, report workspace.CreateProgressReporter) error {
			return h.executeWorktreeWorkspaceCreate(ctx, prepared, report)
		},
		PublishProgress: func(event workspace.CreateProgressEvent) {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateProgress", Payload: event})
			h.relayWorkspaceCreateProgress(prepared, event)
		},
		PublishFailed: func(failed createflow.WorkspaceCreateFailedEvent) {
			h.events.Publish(frontendEvent{Topic: "workspaceCreateFailed", Payload: failed})
			h.relayWorkspaceCreateFailed(prepared, workspaceCreateFailedEvent(failed))
		},
	})
}

func (h *JSONRPCHandler) executeWorktreeWorkspaceCreate(ctx context.Context, prepared preparedWorkspaceCreate, reportProgress workspace.CreateProgressReporter) error {
	return createflow.ExecuteLocalCreate(ctx, prepared.workspaceID, *prepared.localCreate, createflow.ExecuteLocalCreateDependencies{
		Now:                         nowRFC3339Nano,
		CreateWorkspaceWithProgress: h.manager.CreateWorkspaceWithProgress,
		RollbackRegistration: func(ctx context.Context) {
			h.rollbackWorkspaceCreateRegistration(ctx, prepared)
		},
		FinalizeLocalCreate: func(ctx context.Context, created workspace.Workspace) error {
			h.watchAndTrack(created.ID, created.Path)
			h.upsertWorkspaceIndex(created)
			if err := h.updatePreparedWorkspace(ctx, prepared, created.Path); err != nil {
				h.rollbackWorkspaceCreateFailure(ctx, prepared, created)
				return err
			}
			return nil
		},
		PublishProgress: reportProgress,
		PublishCompleted: func(created workspace.Workspace) {
			warnings := buildWorkspaceHookWarnings(prepared.localCreate.SetupHook, created.SetupHookResult, h.logFilePath)
			h.publishWorkspaceCreateCompleted(prepared, created, warnings)
		},
	}, reportProgress)
}

func generateWorkspaceID() string {
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
			uint32(time.Now().UnixNano()),
			uint16(time.Now().UnixNano()>>16),
			0x4000,
			0x8000,
			uint64(time.Now().UnixNano()))
	}
	id[6] = (id[6] & 0x0f) | 0x40
	id[8] = (id[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
}
