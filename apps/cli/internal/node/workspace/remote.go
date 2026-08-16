package workspace

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/api"
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"

	"github.com/rs/zerolog/log"
)

// remoteWorkspaceRecordsEnabled reports whether the daemon can write
// workspace records to the remote API. When false the remote write is skipped
// and the local SQLite row remains the only record (offline or unauthenticated
// mode).
func remoteWorkspaceRecordsEnabled(runtime *cliruntime.Runtime) bool {
	return runtime != nil && runtime.APIConfigured()
}

// CreateRemoteRecord writes the workspace record to the remote API in the
// provisioning state (empty localPath) before the worktree is provisioned. It
// is called on the origin node before dispatch, so the record exists whether
// the worktree is built locally or on a remote node. The daemon-generated
// workspace ID is passed through so local and remote IDs stay aligned.
//
// Best-effort: failures are logged and the local record remains the source of
// truth until the next remote→local cache sync reconciles the row.
func (s *Service) CreateRecord(ctx context.Context, registration application.Registration) {
	if !remoteWorkspaceRecordsEnabled(s.deps.Runtime) {
		return
	}
	_, err := s.deps.Runtime.APIClient().CreateWorkspace(registration.OrganizationID, registration.ProjectID, api.BuildCreateWorkspaceInput(registration, s.deps.NodeID))
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", registration.ID).Msg("failed to create remote workspace record")
	}
}

// UpdateRemoteRecord records the final worktree path on the remote workspace,
// transitioning it from provisioning to active once the local worktree has
// been provisioned.
//
// Best-effort: failures are logged and the local record remains the source of
// truth until the next remote→local cache sync reconciles the row.
func (s *Service) UpdateRecord(ctx context.Context, registration application.Registration, localPath string) {
	if !remoteWorkspaceRecordsEnabled(s.deps.Runtime) {
		return
	}
	_, err := s.deps.Runtime.APIClient().UpdateWorkspace(registration.OrganizationID, registration.ProjectID, api.BuildUpdateWorkspaceInput(registration, localPath, s.deps.NodeID))
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", registration.ID).Msg("failed to update remote workspace record")
	}
}

// CloseRemoteRecord marks the workspace record in the remote API. Status
// "closing" is written before the local teardown starts so live lists stop
// showing the workspace; "closed" is the terminal state written after teardown
// succeeds. Best-effort: failures are logged and the local record remains the
// source of truth until the next remote→local cache sync reconciles the row.
func (s *Service) CloseRecord(ctx context.Context, organizationID string, projectID string, workspaceID string, status string) {
	if !remoteWorkspaceRecordsEnabled(s.deps.Runtime) {
		return
	}
	if strings.TrimSpace(organizationID) == "" || strings.TrimSpace(projectID) == "" {
		return
	}
	if status == "" {
		status = "closed"
	}
	_, err := s.deps.Runtime.APIClient().CloseWorkspace(organizationID, projectID, api.BuildCloseWorkspaceInput(workspaceID, s.deps.NodeID, workspace.Status(status)))
	if err != nil {
		log.Warn().Err(err).Str("workspaceId", workspaceID).Str("status", status).Msg("failed to close remote workspace record")
	}
}
