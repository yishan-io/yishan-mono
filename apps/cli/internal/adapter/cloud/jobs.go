package cloud

import (
	"context"
	"fmt"

	"yishan/apps/cli/internal/scheduledjob"
)

// Scheduled jobs live in the daemon now. These read-only endpoints remain
// for the one-time import of jobs created while api-service owned them.

// importPageLimit is api-service's maximum list page size.
const importPageLimit = 100

// ListScheduledJobsContext lists an organization's scheduled jobs.
func (c *Client) ListScheduledJobsContext(ctx context.Context, orgID string) ([]scheduledjob.Job, error) {
	var response struct {
		Jobs []scheduledjob.Job `json:"jobs"`
	}
	err := c.DoDecodeContext(ctx, "GET", fmt.Sprintf("/orgs/%s/scheduled-jobs?limit=%d", orgID, importPageLimit), nil, &response)
	return response.Jobs, err
}

// ListScheduledJobRunsContext lists a job's most recent runs.
func (c *Client) ListScheduledJobRunsContext(ctx context.Context, orgID string, jobID string, limit int) ([]scheduledjob.Run, error) {
	var response struct {
		Runs []scheduledjob.Run `json:"runs"`
	}
	err := c.DoDecodeContext(ctx, "GET", fmt.Sprintf("/orgs/%s/scheduled-jobs/%s/runs?limit=%d", orgID, jobID, limit), nil, &response)
	return response.Runs, err
}
