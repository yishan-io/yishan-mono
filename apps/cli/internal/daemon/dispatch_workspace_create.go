package daemon

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	localdb "yishan/apps/cli/internal/db"
	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"

	"github.com/rs/zerolog/log"
)

func (h *JSONRPCHandler) handleWorkspaceCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req workspaceCreateParams
	if err := decodeParams(params, &req); err != nil {
		return nil, err
	}
	if err := h.guardWorkspaceCreateProject(ctx, req); err != nil {
		return nil, err
	}
	prepared, err := h.prepareWorkspaceCreate(ctx, req)
	if err != nil {
		return nil, err
	}
	prepared, err = h.registerPreparedWorkspace(ctx, prepared)
	if err != nil {
		return nil, err
	}
	h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.workspaceID, "created")
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
			if err := h.finalizePersistedWorkspace(ctx, prepared, created); err != nil {
				h.rollbackWorkspaceCreateFailure(ctx, prepared, created)
				return err
			}
			h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, created.ID, "updated")
			return nil
		},
		PublishProgress: reportProgress,
		PublishCompleted: func(created workspace.Workspace) {
			warnings := buildWorkspaceHookWarnings(prepared.localCreate.SetupHook, created.SetupHookResult, h.logFilePath)
			h.publishWorkspaceCreateCompleted(prepared, created, warnings)
		},
	}, reportProgress)
}

// guardWorkspaceCreateProject rejects workspace.create for non-git projects
// (sourceType "unknown"). The target project resolves from `projectId`, then
// `repoKey`, then the workspace whose local path matches `sourcePath` (the
// agent MCP workspace_create tool sends only repoKey + sourcePath, and
// desktop-created projects carry a NULL repoKey in the local db). A request
// that cannot be positively identified as non-git falls through to the
// existing create flow, which keeps working for git projects whose local
// record is missing or lacks a repoKey.
func (h *JSONRPCHandler) guardWorkspaceCreateProject(ctx context.Context, req workspaceCreateParams) error {
	if h.localDatabase == nil {
		return nil
	}
	projectID := strings.TrimSpace(req.ProjectID)
	if projectID == "" {
		projectID = h.resolveWorkspaceCreateProjectID(ctx, req)
	}
	if projectID == "" {
		return nil
	}
	project, err := h.projectStore().Get(ctx, projectID)
	if err != nil {
		return nil
	}
	if project.SourceType == "unknown" {
		return workspace.NewRPCError(rpcCodeInvalidParams, "cannot create a workspace for a non-git project")
	}
	return nil
}

// resolveWorkspaceCreateProjectID finds the target project from `repoKey`
// (local project records carry it only for API-imported projects), then from
// the workspace whose local path matches the requested sourcePath — the
// reliable signal for the direct-create and agent paths, where the folder is
// already a known workspace.
func (h *JSONRPCHandler) resolveWorkspaceCreateProjectID(ctx context.Context, req workspaceCreateParams) string {
	repoKey := strings.TrimSpace(req.RepoKey)
	if repoKey != "" {
		if project, err := h.projectStore().GetByRepoKey(ctx, repoKey); err == nil {
			return project.ID
		}
	}
	sourcePath := strings.TrimSpace(req.SourcePath)
	if sourcePath == "" {
		return ""
	}
	workspaces, err := localdb.NewWorkspaceStore(h.localDatabase).List(ctx)
	if err != nil {
		return ""
	}
	for _, workspace := range workspaces {
		if strings.TrimSpace(workspace.LocalPath) == sourcePath && strings.TrimSpace(workspace.ProjectID) != "" {
			return workspace.ProjectID
		}
	}
	return ""
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
