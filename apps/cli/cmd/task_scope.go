package cmd

import (
	"context"
	"errors"
	"os"
	"strings"

	daemonclient "yishan/apps/cli/internal/daemon/client"
)

// taskScope is the frozen project scope of one Local Task command. A nil
// project ID means the explicit global scope; it never comes from desktop focus.
type taskScope struct {
	projectID      *string
	organizationID *string
}

// clientFactory connects to the daemon; tests replace it with a fake.
var newTaskDaemonClient = func(ctx context.Context) (persistentDaemonRPCClient, error) {
	return resolvePersistentDaemonRPCClient(ctx)
}

// resolveTaskScope reads the explicit project scope of a command:
// --project-id wins, then YISHAN_PROJECT_ID. --global selects the global scope
// and conflicts with an explicit --project-id. Missing scope is an error so a
// project-scoped write can never silently become a global write.
func resolveTaskScope(projectFlag string, globalFlag bool, organizationFlag string) (taskScope, error) {
	explicitProjectID := strings.TrimSpace(projectFlag)
	if globalFlag && explicitProjectID != "" {
		return taskScope{}, newUsageError("--global and --project-id cannot be combined")
	}
	scope := taskScope{organizationID: resolveTaskOrganizationID(organizationFlag)}
	if globalFlag {
		return scope, nil
	}
	projectID := explicitProjectID
	if projectID == "" {
		projectID = strings.TrimSpace(os.Getenv("YISHAN_PROJECT_ID"))
	}
	if projectID == "" {
		return taskScope{}, newUsageError("no project scope: pass --project-id <id>, set YISHAN_PROJECT_ID, or pass --global")
	}
	scope.projectID = &projectID
	return scope, nil
}

// resolveTaskOrganizationID reads --org-id, then YISHAN_ORG_ID. The daemon
// resolves the project's organization when neither is set.
func resolveTaskOrganizationID(organizationFlag string) *string {
	organizationID := strings.TrimSpace(organizationFlag)
	if organizationID == "" {
		organizationID = strings.TrimSpace(os.Getenv("YISHAN_ORG_ID"))
	}
	if organizationID == "" {
		return nil
	}
	return &organizationID
}

// withTaskDaemon runs one command body against a connected daemon client.
func withTaskDaemon(run func(client persistentDaemonRPCClient) error) error {
	client, err := newTaskDaemonClient(context.Background())
	if err != nil {
		return err
	}
	defer client.Close()
	return run(client)
}

// taskListRequest is the CLI wire shape for list and search filters. A status
// slice is required because the daemon accepts the array form of the filter.
type taskListRequest struct {
	ProjectID   *string  `json:"projectId,omitempty"`
	Status      []string `json:"status,omitempty"`
	Priority    string   `json:"priority,omitempty"`
	WorkspaceID string   `json:"workspaceId,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// taskSearchRequest adds the free-text query to the shared list filters.
type taskSearchRequest struct {
	taskListRequest
	Query string `json:"query"`
}

// describe renders the scope for progress and error messages.
func (scope taskScope) describe() string {
	if scope.projectID == nil {
		return "global"
	}
	return *scope.projectID
}

// isRPCCode reports whether err carries the given daemon JSON-RPC code.
func isRPCCode(err error, code int) bool {
	var rpcErr *daemonclient.RPCError
	return errors.As(err, &rpcErr) && rpcErr.Code == code
}
