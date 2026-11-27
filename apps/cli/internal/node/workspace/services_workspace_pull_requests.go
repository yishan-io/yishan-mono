package workspace

import (
	"context"
	"strings"

	"yishan/apps/cli/internal/rpc"
)

// ListPullRequests returns the pull requests the PR tracker has recorded for a
// workspace, newest detection first. History is read from the local store, so
// it is available for workspaces that are not currently open.
func (s *Service) ListPullRequests(ctx context.Context, req rpc.WorkspaceListPullRequestsParams) (any, error) {
	workspaceID := strings.TrimSpace(req.WorkspaceID)
	if workspaceID == "" {
		return nil, rpc.NewRPCError(rpc.CodeInvalidParams, "workspaceId is required")
	}
	if s.deps.Store == nil {
		return nil, rpc.NewRPCError(rpc.CodeServerError, "local database is not configured")
	}
	stored, err := s.deps.Store.ListPRsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	records := make([]rpc.WorkspacePullRequestRecord, 0, len(stored))
	for _, pullRequest := range stored {
		records = append(records, rpc.WorkspacePullRequestRecord{
			ID: pullRequest.ID, WorkspaceID: pullRequest.WorkspaceID, OrganizationID: pullRequest.OrganizationID,
			PRID: pullRequest.PRID, Title: pullRequest.Title, URL: pullRequest.URL, Branch: pullRequest.Branch,
			BaseBranch: pullRequest.BaseBranch, State: pullRequest.State, Metadata: pullRequest.Metadata,
			DetectedAt: pullRequest.DetectedAt, ResolvedAt: pullRequest.ResolvedAt,
		})
	}
	return rpc.WorkspaceListPullRequestsResult{PullRequests: records}, nil
}
