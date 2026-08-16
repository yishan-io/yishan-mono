package pr

import (
	"strings"
	"time"

	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/workspace"
)

// Pure comparison and normalization logic for pull-request state. No I/O, no
// tracker state: these functions are unit-testable in isolation.

// prMeaningfullyChanged returns true when the PR fields that matter for
// persistence have changed, ignoring UpdatedAt which is always refreshed.
func prMeaningfullyChanged(prev, next *workspace.WorkspacePullRequest) bool {
	if prev == nil && next == nil {
		return false
	}
	if prev == nil || next == nil {
		return true
	}
	return prev.Number != next.Number ||
		prev.Title != next.Title ||
		prev.URL != next.URL ||
		prev.Branch != next.Branch ||
		prev.BaseBranch != next.BaseBranch ||
		prev.GitHubState != next.GitHubState ||
		prev.Status != next.Status ||
		prev.ReviewDecision != next.ReviewDecision ||
		prev.IsDraft != next.IsDraft ||
		prev.Complete != next.Complete ||
		!checksEqual(prev.Checks, next.Checks) ||
		!deploymentsEqual(prev.Deployments, next.Deployments)
}

// checksEqual compares two check slices field-by-field.
// Length-first comparison short-circuits the common case of different counts.
func checksEqual(a, b []git.GitPullRequestCheck) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Name != b[i].Name ||
			a[i].State != b[i].State ||
			a[i].Workflow != b[i].Workflow ||
			a[i].Description != b[i].Description ||
			a[i].URL != b[i].URL {
			return false
		}
	}
	return true
}

// deploymentsEqual compares two deployment slices field-by-field.
// Length-first comparison short-circuits the common case of different counts.
func deploymentsEqual(a, b []git.GitPullRequestDeployment) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID ||
			a[i].Environment != b[i].Environment ||
			a[i].State != b[i].State ||
			a[i].Description != b[i].Description ||
			a[i].EnvironmentURL != b[i].EnvironmentURL {
			return false
		}
	}
	return true
}

// normalizeWorkspacePullRequestStatus maps the git provider's raw PR state
// into the daemon's status vocabulary (merged|draft|review|open|closed).
func normalizeWorkspacePullRequestStatus(pr git.GitBranchPullRequestStatus) string {
	state := strings.ToUpper(strings.TrimSpace(pr.State))
	if state == "MERGED" || strings.TrimSpace(pr.MergedAt) != "" {
		return "merged"
	}
	if pr.IsDraft {
		return "draft"
	}
	if strings.EqualFold(strings.TrimSpace(pr.ReviewDecision), "REVIEW_REQUIRED") {
		return "review"
	}
	if state == "OPEN" {
		return "open"
	}
	if state == "CLOSED" {
		return "closed"
	}
	return strings.ToLower(state)
}

// nowRFC3339Nano renders the current UTC time in the wire timestamp format.
func nowRFC3339Nano() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
