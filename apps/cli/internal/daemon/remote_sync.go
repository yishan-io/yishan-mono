package daemon

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"

	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/buildinfo"
	cliruntime "yishan/apps/cli/internal/runtime"
)

type WorkspaceCreation struct {
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

func createRemoteWorkspace(_ context.Context, creation WorkspaceCreation) error {
	if !cliruntime.APIConfigured() {
		return nil
	}
	orgID := strings.TrimSpace(creation.OrganizationID)
	if orgID == "" {
		return fmt.Errorf("organizationId is required")
	}

	_, err := cliruntime.APIClient().CreateWorkspace(orgID, creation.ProjectID, api.CreateWorkspaceInput{
		NodeID:       creation.NodeID,
		LocalPath:    creation.LocalPath,
		Kind:         creation.Kind,
		Branch:       creation.Branch,
		SourceBranch: creation.SourceBranch,
	})
	if err != nil {
		return fmt.Errorf("create API workspace for project %q: %w", creation.ProjectID, err)
	}
	return nil
}

func closeRemoteWorkspace(_ context.Context, closing WorkspaceClose) error {
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
		return fmt.Errorf("register node %q: %w", registration.ID, err)
	}
	return nil
}
