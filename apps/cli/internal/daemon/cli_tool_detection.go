package daemon

import (
	clidetector "yishan/apps/cli/internal/clidetector"
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
