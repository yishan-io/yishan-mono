package daemon

import (
	"context"
	"fmt"

	"yishan/apps/cli/internal/agentkind"
	clidetector "yishan/apps/cli/internal/clidetector"
	"yishan/apps/cli/internal/clitoolinstall"
	"yishan/apps/cli/internal/workspace"
)

const (
	CLIToolCategoryAgent       = "agent"
	CLIToolCategoryIntegration = "integration"
	CLIToolCategoryManaged     = "managed"
)

type CLIToolDetectionStatus = clidetector.Status

var cliToolRegistry = clidetector.NewRegistry(agentCLIToolDetector{}, gitHubCLIToolDetector{}, yishanCLIToolDetector{})

var cliToolInstallerRegistry = clitoolinstall.NewRegistry(clitoolinstall.PiInstaller{}, clitoolinstall.YishanInstaller{})

func ListCLIToolDetectionStatusesWithRefresh(forceRefresh bool) []CLIToolDetectionStatus {
	return cliToolRegistry.List(forceRefresh)
}

func listAgentDetectionStatuses(forceRefresh bool) []clidetector.Status {
	all := cliToolRegistry.List(forceRefresh)
	agents := make([]clidetector.Status, 0, len(all))
	for _, s := range all {
		if s.Category == CLIToolCategoryAgent {
			agents = append(agents, s)
		}
	}
	return agents
}

func getGitHubDetectionStatus(forceRefresh bool) clidetector.GitHubConnectionStatus {
	all := cliToolRegistry.List(forceRefresh)
	for _, s := range all {
		if s.ToolID == "github" {
			authenticated := false
			if s.Authenticated != nil {
				authenticated = *s.Authenticated
			}
			return clidetector.GitHubConnectionStatus{
				Installed:    s.Installed,
				LoggedIn:     authenticated,
				Username:     s.Account,
				StatusDetail: s.StatusDetail,
			}
		}
	}
	return clidetector.GitHubConnectionStatus{
		Installed:    false,
		LoggedIn:     false,
		StatusDetail: "GitHub CLI (gh) is not installed",
	}
}

type agentCLIToolDetector struct{}

func (agentCLIToolDetector) Detect(forceRefresh bool) []clidetector.Status {
	statuses := clidetector.ListAgentCLIDetectionStatusesWithRefresh(forceRefresh)
	results := make([]clidetector.Status, 0, len(statuses))
	for _, status := range statuses {
		detail := "Not detected"
		if status.Detected {
			detail = "Detected"
			if status.Version != "" {
				detail = "Detected version " + status.Version
			}
		}

		entry := clidetector.Status{
			ToolID:         status.AgentKind,
			Category:       CLIToolCategoryAgent,
			Label:          status.AgentKind,
			Installed:      status.Detected,
			Version:        status.Version,
			StatusDetail:   detail,
			SupportsToggle: true,
		}
		if status.AgentKind == agentkind.Pi {
			entry.LatestVersion = clitoolinstall.PiLatestVersion(context.Background())
		}
		results = append(results, entry)
	}
	return results
}

type gitHubCLIToolDetector struct{}

func (gitHubCLIToolDetector) Detect(forceRefresh bool) []clidetector.Status {
	githubStatus := clidetector.CheckGitHubConnectionStatusRaw(forceRefresh)
	authenticated := githubStatus.LoggedIn
	return []clidetector.Status{{
		ToolID:         "github",
		Category:       CLIToolCategoryIntegration,
		Label:          "GitHub",
		Installed:      githubStatus.Installed,
		Version:        githubStatus.Version,
		Authenticated:  &authenticated,
		Account:        githubStatus.Username,
		StatusDetail:   githubStatus.StatusDetail,
		SupportsToggle: false,
	}}
}

// yishanCLIToolDetector reports the managed yishan CLI availability on this node.
type yishanCLIToolDetector struct{}

func (yishanCLIToolDetector) Detect(forceRefresh bool) []clidetector.Status {
	status := clitoolinstall.CurrentYishanInstallStatus()
	statusDetail := "Not detected"
	if status.IsAvailableInPath {
		statusDetail = "Detected"
	}
	return []clidetector.Status{{
		ToolID:         clitoolinstall.YishanToolID,
		Category:       CLIToolCategoryManaged,
		Label:          "Yishan",
		Installed:      status.IsAvailableInPath,
		StatusDetail:   statusDetail,
		ResolvedPath:   status.ResolvedPath,
		ManagedInstall: status.IsManagedInstall,
	}}
}

// installCLITool installs one registered CLI tool and returns its fresh status.
func installCLITool(ctx context.Context, toolID string) (clidetector.Status, error) {
	installer, ok := cliToolInstallerRegistry.Get(toolID)
	if !ok {
		return clidetector.Status{}, workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("unknown CLI tool: %s", toolID))
	}
	if err := installer.Install(ctx); err != nil {
		return clidetector.Status{}, err
	}
	return findCLIToolStatus(toolID)
}

// uninstallCLITool uninstalls one registered CLI tool and returns its fresh status.
func uninstallCLITool(ctx context.Context, toolID string) (clidetector.Status, error) {
	installer, ok := cliToolInstallerRegistry.Get(toolID)
	if !ok {
		return clidetector.Status{}, workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("unknown CLI tool: %s", toolID))
	}
	if !installer.SupportsUninstall() {
		return clidetector.Status{}, workspace.NewRPCError(rpcCodeInvalidParams, fmt.Sprintf("uninstall is not supported for %s", toolID))
	}
	if err := installer.Uninstall(ctx); err != nil {
		return clidetector.Status{}, err
	}
	return findCLIToolStatus(toolID)
}

// findCLIToolStatus returns one tool's status with a force-refreshed detection.
func findCLIToolStatus(toolID string) (clidetector.Status, error) {
	for _, status := range ListCLIToolDetectionStatusesWithRefresh(true) {
		if status.ToolID == toolID {
			return status, nil
		}
	}
	return clidetector.Status{}, workspace.NewRPCError(rpcCodeNotFound, fmt.Sprintf("CLI tool %s not found", toolID))
}
