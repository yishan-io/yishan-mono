package sqlite

import (
	"context"
	"database/sql"
	"fmt"
)

// fillMissingHourlyUsageOrganizations attributes usage rows that have no
// organization using local records: first the row's workspace, then its
// project. Scans only know the org of workspaces open in memory, so without
// this rows from closed or never-opened workspaces stay unattributed and are
// never uploaded. Rows whose workspace and project are both unknown keep an
// empty organization.
func fillMissingHourlyUsageOrganizations(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `UPDATE token_usage_hourly SET organization_id = COALESCE(
			(SELECT NULLIF(w.organization_id, '') FROM workspaces w WHERE w.id = token_usage_hourly.workspace_id),
			(SELECT NULLIF(p.organization_id, '') FROM projects p WHERE p.id = token_usage_hourly.project_id),
			'')
		WHERE organization_id = ''`); err != nil {
		return fmt.Errorf("fill missing usage organizations: %w", err)
	}
	return nil
}
