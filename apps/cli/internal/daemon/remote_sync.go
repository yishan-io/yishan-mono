package daemon

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	goruntime "runtime"
	"strings"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/buildinfo"
	cliruntime "yishan/apps/cli/internal/runtime"
)

func isReauthRequiredError(err error) bool {
	if err == nil {
		return false
	}

	var refreshErr *api.TokenRefreshError
	if errors.As(err, &refreshErr) {
		return true
	}

	var apiErr *api.APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode == http.StatusUnauthorized
	}

	return false
}

func formatReauthRequiredMessage(operation string) string {
	return fmt.Sprintf("%s requires an authenticated API session; your refresh token may be expired. Run `yishan login` and retry", operation)
}

type WorkspaceCreation struct {
	ID             string
	NodeID         string
	OrganizationID string
	ProjectID      string
	Kind           string
	Branch         string
	SourceBranch   string
	LocalPath      string
}

type WorkspaceClose struct {
	WorkspaceID    string
	OrganizationID string
	ProjectID      string
}

func registerWorkspace(ctx context.Context, runtime *cliruntime.Runtime, creation WorkspaceCreation) (api.Workspace, error) {
	if runtime == nil || !runtime.APIConfigured() {
		return api.Workspace{}, nil
	}
	orgID := strings.TrimSpace(creation.OrganizationID)
	if orgID == "" {
		return api.Workspace{}, fmt.Errorf("organizationId is required")
	}

	response, err := runtime.APIClient().CreateWorkspace(orgID, creation.ProjectID, api.CreateWorkspaceInput{
		NodeID:       creation.NodeID,
		LocalPath:    creation.LocalPath,
		Kind:         creation.Kind,
		Branch:       creation.Branch,
		SourceBranch: creation.SourceBranch,
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return api.Workspace{}, fmt.Errorf("%s: %w", formatReauthRequiredMessage("remote workspace creation"), err)
		}
		return api.Workspace{}, fmt.Errorf("create API workspace for project %q: %w", creation.ProjectID, err)
	}
	return response.Workspace, nil
}

func updateWorkspace(_ context.Context, runtime *cliruntime.Runtime, creation WorkspaceCreation, localPath string) error {
	if runtime == nil || !runtime.APIConfigured() {
		return nil
	}
	orgID := strings.TrimSpace(creation.OrganizationID)
	if orgID == "" || strings.TrimSpace(creation.ID) == "" {
		return fmt.Errorf("organizationId and workspaceId are required")
	}
	_, err := runtime.APIClient().UpdateWorkspace(orgID, creation.ProjectID, api.UpdateWorkspaceInput{
		WorkspaceID: creation.ID,
		LocalPath:   localPath,
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return fmt.Errorf("%s: %w", formatReauthRequiredMessage("remote workspace path update"), err)
		}
		return fmt.Errorf("update API workspace %q with local path: %w", creation.ID, err)
	}
	return nil
}

func closeRemoteWorkspace(_ context.Context, runtime *cliruntime.Runtime, closing WorkspaceClose) error {
	if runtime == nil || !runtime.APIConfigured() {
		return nil
	}
	orgID := strings.TrimSpace(closing.OrganizationID)
	if orgID == "" {
		return fmt.Errorf("organizationId is required")
	}

	_, err := runtime.APIClient().CloseWorkspace(orgID, closing.ProjectID, api.CloseWorkspaceInput{
		WorkspaceID: closing.WorkspaceID,
		Source:      "daemon",
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return fmt.Errorf("%s: %w", formatReauthRequiredMessage("remote workspace close"), err)
		}
		return fmt.Errorf("close API workspace for project %q: %w", closing.ProjectID, err)
	}
	return nil
}

func registerRemoteNode(runtime *cliruntime.Runtime, registration NodeRegistration) error {
	if runtime == nil || !runtime.APIConfigured() {
		return nil
	}
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "local-daemon"
	}

	agentDetection := make([]map[string]any, 0, len(registration.AgentDetectionStatus))
	for _, status := range registration.AgentDetectionStatus {
		entry := map[string]any{
			"agentKind": status.ToolID,
			"detected":  status.Installed,
		}
		if strings.TrimSpace(status.Version) != "" {
			entry["version"] = status.Version
		}
		agentDetection = append(agentDetection, entry)
	}

	_, err = runtime.APIClient().RegisterNode(api.RegisterNodeInput{
		NodeID:   registration.ID,
		Name:     hostname,
		Kind:     "managed",
		Scope:    "private",
		Endpoint: registration.Endpoint,
		Metadata: map[string]any{
			"os":      goruntime.GOOS,
			"version": buildinfo.Version,
			"agents":  agentDetection,
		},
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return fmt.Errorf("%s: %w", formatReauthRequiredMessage("daemon node registration"), err)
		}
		return fmt.Errorf("register node %q: %w", registration.ID, err)
	}
	return nil
}
