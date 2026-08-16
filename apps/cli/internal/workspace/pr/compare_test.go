package pr

import (
	"testing"

	"yishan/apps/cli/internal/git"
	"yishan/apps/cli/internal/workspace"
)

func TestPrMeaningfullyChanged_NilBoth(t *testing.T) {
	if prMeaningfullyChanged(nil, nil) {
		t.Fatal("expected no change when both PRs are nil")
	}
}

func TestPrMeaningfullyChanged_NilToValue(t *testing.T) {
	if !prMeaningfullyChanged(nil, &workspace.WorkspacePullRequest{Number: 1}) {
		t.Fatal("expected change from nil to a PR")
	}
}

func TestPrMeaningfullyChanged_ValueToNil(t *testing.T) {
	if !prMeaningfullyChanged(&workspace.WorkspacePullRequest{Number: 1}, nil) {
		t.Fatal("expected change from a PR to nil")
	}
}

func TestPrMeaningfullyChanged_IgnoresUpdatedAt(t *testing.T) {
	prev := &workspace.WorkspacePullRequest{Number: 1, Status: "open", UpdatedAt: "2026-01-01T00:00:00Z"}
	next := &workspace.WorkspacePullRequest{Number: 1, Status: "open", UpdatedAt: "2026-02-01T00:00:00Z"}
	if prMeaningfullyChanged(prev, next) {
		t.Fatal("expected UpdatedAt-only difference to be ignored")
	}
}

func TestPrMeaningfullyChanged_DetectsFieldChanges(t *testing.T) {
	cases := []struct {
		name   string
		prev   *workspace.WorkspacePullRequest
		next   *workspace.WorkspacePullRequest
		change bool
	}{
		{"number", &workspace.WorkspacePullRequest{Number: 1}, &workspace.WorkspacePullRequest{Number: 2}, true},
		{"title", &workspace.WorkspacePullRequest{Title: "a"}, &workspace.WorkspacePullRequest{Title: "b"}, true},
		{"status", &workspace.WorkspacePullRequest{Status: "open"}, &workspace.WorkspacePullRequest{Status: "merged"}, true},
		{"checks", &workspace.WorkspacePullRequest{Checks: []git.GitPullRequestCheck{{Name: "ci"}}}, &workspace.WorkspacePullRequest{Checks: []git.GitPullRequestCheck{{Name: "other"}}}, true},
		{"deployments", &workspace.WorkspacePullRequest{Deployments: []git.GitPullRequestDeployment{{ID: 1}}}, &workspace.WorkspacePullRequest{Deployments: []git.GitPullRequestDeployment{{ID: 2}}}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := prMeaningfullyChanged(tc.prev, tc.next); got != tc.change {
				t.Fatalf("prMeaningfullyChanged = %v, want %v", got, tc.change)
			}
		})
	}
}

func TestChecksEqual_ComparesFields(t *testing.T) {
	base := []git.GitPullRequestCheck{{Name: "ci", State: "PASSED", Workflow: "unit"}}
	if !checksEqual(base, []git.GitPullRequestCheck{{Name: "ci", State: "PASSED", Workflow: "unit"}}) {
		t.Fatal("expected identical checks to be equal")
	}
	if checksEqual(base, []git.GitPullRequestCheck{{Name: "ci", State: "FAILED", Workflow: "unit"}}) {
		t.Fatal("expected differing state to be detected")
	}
	if checksEqual(base, []git.GitPullRequestCheck{{Name: "ci", State: "PASSED"}}) {
		t.Fatal("expected different lengths to be detected")
	}
	if !checksEqual(nil, nil) {
		t.Fatal("expected nil vs nil to be equal")
	}
}

func TestDeploymentsEqual_ComparesFields(t *testing.T) {
	base := []git.GitPullRequestDeployment{{ID: 1, Environment: "prod", State: "ACTIVE"}}
	if !deploymentsEqual(base, []git.GitPullRequestDeployment{{ID: 1, Environment: "prod", State: "ACTIVE"}}) {
		t.Fatal("expected identical deployments to be equal")
	}
	if deploymentsEqual(base, []git.GitPullRequestDeployment{{ID: 1, Environment: "staging", State: "ACTIVE"}}) {
		t.Fatal("expected differing environment to be detected")
	}
	if deploymentsEqual(base, nil) {
		t.Fatal("expected different lengths to be detected")
	}
}

func TestNormalizeWorkspacePullRequestStatus(t *testing.T) {
	cases := []struct {
		pr   git.GitBranchPullRequestStatus
		want string
	}{
		{git.GitBranchPullRequestStatus{State: "MERGED"}, "merged"},
		{git.GitBranchPullRequestStatus{State: "OPEN", MergedAt: "2026-01-01T00:00:00Z"}, "merged"},
		{git.GitBranchPullRequestStatus{State: "OPEN", IsDraft: true}, "draft"},
		{git.GitBranchPullRequestStatus{State: "OPEN", ReviewDecision: "REVIEW_REQUIRED"}, "review"},
		{git.GitBranchPullRequestStatus{State: "OPEN"}, "open"},
		{git.GitBranchPullRequestStatus{State: "CLOSED"}, "closed"},
		{git.GitBranchPullRequestStatus{State: "weird"}, "weird"},
	}
	for _, tc := range cases {
		if got := normalizeWorkspacePullRequestStatus(tc.pr); got != tc.want {
			t.Fatalf("normalizeWorkspacePullRequestStatus(%+v) = %q, want %q", tc.pr, got, tc.want)
		}
	}
}
