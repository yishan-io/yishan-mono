package daemon

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"runtime"
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
	NodeID         string
	OrganizationID string
	ProjectID      string
	Kind           string
	Branch         string
	LocalPath      string
}

func createRemoteWorkspace(ctx context.Context, creation WorkspaceCreation) error {
	if !cliruntime.APIConfigured() {
		return nil
	}
	orgID := strings.TrimSpace(creation.OrganizationID)
	if orgID == "" {
		return fmt.Errorf("organizationId is required")
	}

	_, err := cliruntime.APIClient().CreateWorkspace(orgID, creation.ProjectID, api.CreateWorkspaceInput{
		ID:           creation.ID,
		NodeID:       creation.NodeID,
		LocalPath:    creation.LocalPath,
		Kind:         creation.Kind,
		Branch:       creation.Branch,
		SourceBranch: creation.SourceBranch,
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return fmt.Errorf("%s: %w", formatReauthRequiredMessage("remote workspace creation"), err)
		}
		return fmt.Errorf("create API workspace for project %q: %w", creation.ProjectID, err)
	}
	return nil
}

func closeRemoteWorkspace(ctx context.Context, closing WorkspaceClose) error {
	if !cliruntime.APIConfigured() {
		return nil
	}
	orgID := strings.TrimSpace(closing.OrganizationID)
	if orgID == "" {
		return fmt.Errorf("organizationId is required")
	}

	_, err := cliruntime.APIClient().CloseWorkspace(orgID, closing.ProjectID, api.CloseWorkspaceInput{
		NodeID:    closing.NodeID,
		LocalPath: closing.LocalPath,
		Kind:      closing.Kind,
		Branch:    closing.Branch,
	})
	if err != nil {
		if isReauthRequiredError(err) {
			return fmt.Errorf("%s: %w", formatReauthRequiredMessage("remote workspace close"), err)
		}
		return fmt.Errorf("close API workspace for project %q: %w", closing.ProjectID, err)
	}
	return nil
}

func registerRemoteNode(registration NodeRegistration) error {
	if !cliruntime.APIConfigured() {
		return nil
	}
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "local-daemon"
	}

	agentDetection := make([]map[string]any, 0, len(registration.AgentDetectionStatus))
	for _, status := range registration.AgentDetectionStatus {
		entry := map[string]any{
			"agentKind": status.AgentKind,
			"detected":  status.Detected,
		}
		if strings.TrimSpace(status.Version) != "" {
			entry["version"] = status.Version
		}
		agentDetection = append(agentDetection, entry)
	}

	_, err = cliruntime.APIClient().RegisterNode(api.RegisterNodeInput{
		NodeID:   registration.ID,
		Name:     hostname,
		Scope:    "private",
		Endpoint: registration.Endpoint,
		Metadata: map[string]any{
			"os":      runtime.GOOS,
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
