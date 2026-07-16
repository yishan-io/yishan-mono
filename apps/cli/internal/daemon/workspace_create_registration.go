package daemon

import (
	"context"
	"strings"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/workspace"
	createflow "yishan/apps/cli/internal/workspace/createflow"
)

func applyAuthoritativeWorkspaceID(prepared preparedWorkspaceCreate, workspaceID string) preparedWorkspaceCreate {
	normalizedWorkspaceID := strings.TrimSpace(workspaceID)
	if normalizedWorkspaceID == "" {
		return prepared
	}
	prepared.workspaceID = normalizedWorkspaceID
	prepared.startedEvent.WorkspaceID = normalizedWorkspaceID
	if prepared.registration != nil {
		prepared.registration.ID = normalizedWorkspaceID
	}
	if prepared.localCreate != nil {
		prepared.localCreate.ID = normalizedWorkspaceID
	}
	if prepared.remoteRequest != nil {
		prepared.remoteRequest.ID = normalizedWorkspaceID
	}
	return prepared
}

func (h *JSONRPCHandler) registerPreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, localPath string) (preparedWorkspaceCreate, error) {
	if prepared.registration == nil {
		return prepared, nil
	}
	registration := *prepared.registration
	registration.LocalPath = localPath
	registeredWorkspace, err := registerWorkspace(ctx, h.runtime, registration)
	if err != nil {
		return preparedWorkspaceCreate{}, err
	}
	prepared = applyAuthoritativeWorkspaceID(prepared, registeredWorkspace.ID)
	if strings.TrimSpace(registeredWorkspace.ID) != "" {
		h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.workspaceID, "created")
	}
	return prepared, nil
}

func (h *JSONRPCHandler) updatePreparedWorkspace(ctx context.Context, prepared preparedWorkspaceCreate, localPath string) error {
	if prepared.registration == nil {
		return nil
	}
	if err := updateWorkspace(ctx, h.runtime, *prepared.registration, localPath); err != nil {
		return err
	}
	h.publishWorkspaceSnapshotChanged(prepared.organizationID, prepared.projectID, prepared.registration.ID, "updated")
	return nil
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateRegistration(ctx context.Context, prepared preparedWorkspaceCreate) {
	if prepared.registration == nil {
		return
	}
	if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
		WorkspaceID:    prepared.registration.ID,
		SourceNodeID:   prepared.registration.SourceNodeID,
		OrganizationID: prepared.organizationID,
		ProjectID:      prepared.projectID,
	}); err != nil {
		log.Warn().Err(err).Str("workspaceId", prepared.registration.ID).Msg("workspace API close failed after workspace create registration")
	}
}

func (h *JSONRPCHandler) rollbackWorkspaceCreateFailure(ctx context.Context, prepared preparedWorkspaceCreate, created workspace.Workspace) {
	if prepared.registration != nil {
		if err := closeRemoteWorkspace(ctx, h.runtime, WorkspaceClose{
			WorkspaceID:    prepared.registration.ID,
			SourceNodeID:   prepared.registration.SourceNodeID,
			OrganizationID: prepared.organizationID,
			ProjectID:      prepared.projectID,
		}); err != nil {
			log.Warn().Err(err).Str("workspaceId", prepared.registration.ID).Msg("workspace API close failed after workspace create rollback")
		}
	}

	closeReq := createflow.BuildCreateFailureClosePathRequest(created, prepared.localCreate.TargetBranch)
	h.cleanupLocalWorkspaceCreateFailure(ctx, closeReq)
}
