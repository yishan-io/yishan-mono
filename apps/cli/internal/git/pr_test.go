package git

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGitServiceBranchPullRequest(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	ghBinDir := t.TempDir()
	ghBinPath := filepath.Join(ghBinDir, "gh")
	ghScript := "#!/bin/sh\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then\n" +
		"  printf '[{\"number\":123,\"title\":\"Test PR\",\"url\":\"https://github.com/acme/repo/pull/123\",\"state\":\"OPEN\",\"reviewDecision\":\"REVIEW_REQUIRED\",\"isDraft\":false,\"mergedAt\":null,\"headRefName\":\"feature/alpha\",\"baseRefName\":\"main\",\"headRefOid\":\"abc123\"}]'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"checks\" ]; then\n" +
		"  printf '[{\"name\":\"CI\",\"workflow\":\"build\",\"state\":\"SUCCESS\",\"description\":\"All good\",\"link\":\"https://ci.example.com/run/1\"}]'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"repos/{owner}/{repo}\" ]; then\n" +
		"  printf '{\"nameWithOwner\":\"acme/repo\"}'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"repos/acme/repo/deployments\" ]; then\n" +
		"  printf '[{\"id\":99,\"environment\":\"production\",\"description\":\"Deploy\",\"original_payload\":\"{}\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:01:00Z\"}]'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"repos/acme/repo/deployments/99/statuses\" ]; then\n" +
		"  printf '[{\"state\":\"success\",\"environment_url\":\"https://prod.example.com\",\"description\":\"Live\"}]'\n" +
		"  exit 0\n" +
		"fi\n" +
		"exit 1\n"
	if err := os.WriteFile(ghBinPath, []byte(ghScript), 0o755); err != nil {
		t.Fatalf("write fake gh: %v", err)
	}

	oldPath := os.Getenv("PATH")
	t.Setenv("PATH", ghBinDir+string(os.PathListSeparator)+oldPath)

	status, err := svc.BranchPullRequest(context.Background(), root, "feature/alpha")
	if err != nil {
		t.Fatalf("BranchPullRequest: %v", err)
	}
	if !status.Found || status.Number != 123 {
		t.Fatalf("unexpected branch PR status: %+v", status)
	}
	if status.URL != "https://github.com/acme/repo/pull/123" {
		t.Fatalf("unexpected PR URL: %q", status.URL)
	}
	if status.ReviewDecision != "REVIEW_REQUIRED" {
		t.Fatalf("unexpected review decision: %q", status.ReviewDecision)
	}
	if len(status.Checks) != 1 || status.Checks[0].State != "SUCCESS" {
		t.Fatalf("unexpected checks: %+v", status.Checks)
	}
	if len(status.Deployments) != 1 || status.Deployments[0].State != "success" {
		t.Fatalf("unexpected deployments: %+v", status.Deployments)
	}

	emptyScript := "#!/bin/sh\n" +
		"printf '[]'\n" +
		"exit 0\n"
	if err := os.WriteFile(ghBinPath, []byte(emptyScript), 0o755); err != nil {
		t.Fatalf("rewrite fake gh: %v", err)
	}

	none, err := svc.BranchPullRequest(context.Background(), root, "feature/no-pr")
	if err != nil {
		t.Fatalf("BranchPullRequest without PR: %v", err)
	}
	if none.Found {
		t.Fatalf("expected no PR for branch, got %+v", none)
	}
}

func TestGitServiceBranchPullRequest_TreatsNoChecksReportedAsEmpty(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	ghBinDir := t.TempDir()
	ghBinPath := filepath.Join(ghBinDir, "gh")
	ghScript := "#!/bin/sh\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then\n" +
		"  printf '[{\"number\":123,\"title\":\"Test PR\",\"url\":\"https://github.com/acme/repo/pull/123\",\"state\":\"OPEN\",\"headRefName\":\"feature/alpha\",\"baseRefName\":\"main\",\"headRefOid\":\"abc123\"}]'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"repos/{owner}/{repo}/commits/abc123/check-runs\" ]; then\n" +
		"  printf '{\"check_runs\":[]}'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"checks\" ]; then\n" +
		"  printf \"no checks reported on the 'main' branch\" >&2\n" +
		"  exit 1\n" +
		"fi\n" +
		"exit 1\n"
	if err := os.WriteFile(ghBinPath, []byte(ghScript), 0o755); err != nil {
		t.Fatalf("write fake gh: %v", err)
	}
	t.Setenv("PATH", ghBinDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	status, err := svc.BranchPullRequest(context.Background(), root, "feature/alpha")
	if err != nil {
		t.Fatalf("BranchPullRequest: %v", err)
	}
	if !status.Found {
		t.Fatal("expected pull request to be found")
	}
	if len(status.Checks) != 0 {
		t.Fatalf("expected no checks, got %+v", status.Checks)
	}
}

func TestGitServiceMergePullRequestRunsOutsideWorktreeWhenDeletingBranch(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	ghBinDir := t.TempDir()
	ghBinPath := filepath.Join(ghBinDir, "gh")
	argsLogPath := filepath.Join(ghBinDir, "args.log")
	pwdLogPath := filepath.Join(ghBinDir, "pwd.log")
	deleteLogPath := filepath.Join(ghBinDir, "delete.log")
	// The fake gh handles four call types:
	// 1. api repos/{owner}/{repo}         → returns repo metadata
	// 2. pr view <number> --json ...      → returns head branch name
	// 3. pr merge ...                     → logs args/pwd, prints "merged"
	// 4. api --method DELETE ...          → logs the delete ref call
	ghScript := "#!/bin/sh\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"repos/{owner}/{repo}\" ]; then\n" +
		"  printf '{\"nameWithOwner\":\"acme/repo\"}'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"view\" ]; then\n" +
		"  printf '{\"headRefName\":\"feature-x\"}'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"merge\" ]; then\n" +
		"  pwd > '" + pwdLogPath + "'\n" +
		"  printf '%s\n' \"$@\" > '" + argsLogPath + "'\n" +
		"  printf 'merged'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"--method\" ] && [ \"$3\" = \"DELETE\" ]; then\n" +
		"  printf '%s\n' \"$@\" > '" + deleteLogPath + "'\n" +
		"  exit 0\n" +
		"fi\n" +
		"printf 'unexpected gh invocation: %s' \"$*\" >&2\n" +
		"exit 1\n"
	if err := os.WriteFile(ghBinPath, []byte(ghScript), 0o755); err != nil {
		t.Fatalf("write fake gh: %v", err)
	}

	oldPath := os.Getenv("PATH")
	t.Setenv("PATH", ghBinDir+string(os.PathListSeparator)+oldPath)

	out, err := svc.MergePullRequest(context.Background(), root, 123, "merge", true)
	if err != nil {
		t.Fatalf("MergePullRequest: %v", err)
	}
	if strings.TrimSpace(out) != "merged" {
		t.Fatalf("unexpected merge output: %q", out)
	}

	// --delete-branch must NOT be passed to gh pr merge (worktree-safe).
	argsLog, err := os.ReadFile(argsLogPath)
	if err != nil {
		t.Fatalf("read args log: %v", err)
	}
	argsText := string(argsLog)
	if strings.Contains(argsText, "--delete-branch") {
		t.Fatalf("--delete-branch must not be passed to gh pr merge, got %q", argsText)
	}
	if !strings.Contains(argsText, "--repo\nacme/repo\n") {
		t.Fatalf("expected --repo acme/repo in args, got %q", argsText)
	}

	// Merge must run outside the repo worktree.
	pwdLog, err := os.ReadFile(pwdLogPath)
	if err != nil {
		t.Fatalf("read pwd log: %v", err)
	}
	if strings.TrimSpace(string(pwdLog)) == root {
		t.Fatalf("expected merge to run outside repo worktree, cwd=%q", strings.TrimSpace(string(pwdLog)))
	}

	// Remote branch must be deleted via the API.
	deleteLog, err := os.ReadFile(deleteLogPath)
	if err != nil {
		t.Fatalf("read delete log: %v", err)
	}
	deleteText := string(deleteLog)
	if !strings.Contains(deleteText, "repos/acme/repo/git/refs/heads/feature-x") {
		t.Fatalf("expected remote branch deletion API call, got %q", deleteText)
	}
}
