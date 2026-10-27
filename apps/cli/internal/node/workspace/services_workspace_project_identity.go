package workspace

import (
	"context"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/workspace"
)

// reconcileOpenedProjectIdentity checks both owners before any local write or
// runtime replacement. Unlike Open's legacy stale-ID registration, openProject
// cannot claim a path already owned by another workspace.
func (s *Service) reconcileOpenedProjectIdentity(ctx context.Context, req *workspace.OpenRequest, path string) error {
	for _, existing := range s.deps.Registry.List() {
		if err := reconcileOpenedProjectOwner(req, path, existing.ID, existing.Path, existing.ProjectID, existing.OrgID); err != nil {
			return err
		}
	}
	if s.deps.Database == nil {
		return nil
	}
	rows, err := sqlite.NewWorkspaceStore(s.deps.Database).List(ctx)
	if err != nil {
		return fmt.Errorf("read opened workspace ownership: %w", err)
	}
	for _, row := range rows {
		if err := reconcileOpenedProjectOwner(req, path, row.ID, row.LocalPath, row.ProjectID, row.OrganizationID); err != nil {
			return err
		}
	}
	return nil
}

func reconcileOpenedProjectOwner(req *workspace.OpenRequest, path, id, ownedPath, projectID, orgID string) error {
	if id != req.ID {
		if strings.TrimSpace(ownedPath) != "" && normalizeWorkspaceOpenProjectPath(ownedPath) == path {
			return workspace.NewError(workspace.ErrCodeInvalidParams, "workspace path belongs to another workspace")
		}
		return nil
	}
	for _, ownership := range []struct {
		requested *string
		existing  string
	}{
		{&req.ProjectID, projectID}, {&req.OrgID, orgID},
	} {
		requested, existing := strings.TrimSpace(*ownership.requested), strings.TrimSpace(ownership.existing)
		if requested != "" && existing != "" && requested != existing {
			return workspace.NewError(workspace.ErrCodeInvalidParams, "workspace ownership does not match existing workspace")
		}
		if requested == "" {
			requested = existing
		}
		*ownership.requested = requested
	}
	return nil
}
