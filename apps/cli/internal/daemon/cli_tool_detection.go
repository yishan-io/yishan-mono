package daemon

import (
	clidetector "yishan/apps/cli/internal/daemon/cli_detector"
)

const (
	CLIToolCategoryAgent       = "agent"
	CLIToolCategoryIntegration = "integration"
)

type CLIToolDetectionStatus = clidetector.Status

var cliToolRegistry = clidetector.NewRegistry(agentCLIToolDetector{}, gitHubCLIToolDetector{})

func ListCLIToolDetectionStatusesWithRefresh(forceRefresh bool) []CLIToolDetectionStatus {
	return cliToolRegistry.List(forceRefresh)
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

		results = append(results, clidetector.Status{
			ToolID:         status.AgentKind,
			Category:       CLIToolCategoryAgent,
			Label:          status.AgentKind,
			Installed:      status.Detected,
			Version:        status.Version,
			StatusDetail:   detail,
			SupportsToggle: true,
		})
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
		Authenticated:  &authenticated,
		Account:        githubStatus.Username,
		StatusDetail:   githubStatus.StatusDetail,
		SupportsToggle: false,
	}}
}
