package workspace

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGitServiceStatusTrackUnstageRevert(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runGit(t, root, "add", "a.txt")
	runGit(t, root, "commit", "-m", "seed")

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	status, err := svc.Status(context.Background(), root)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if len(status.Files) == 0 {
		t.Fatalf("expected changed files, got %+v", status)
	}

	if err := svc.TrackChanges(context.Background(), root, []string{"a.txt"}); err != nil {
		t.Fatalf("track: %v", err)
	}
	if err := svc.UnstageChanges(context.Background(), root, []string{"a.txt"}); err != nil {
		t.Fatalf("unstage: %v", err)
	}
	if err := svc.RevertChanges(context.Background(), root, []string{"a.txt"}); err != nil {
		t.Fatalf("revert: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "a.txt")); err != nil {
		t.Fatalf("expected tracked file to exist after revert: %v", err)
	}

	if err := os.WriteFile(filepath.Join(root, "tmp.txt"), []byte("tmp\n"), 0o644); err != nil {
		t.Fatalf("write untracked file: %v", err)
	}
	if err := svc.RevertChanges(context.Background(), root, []string{"tmp.txt"}); err != nil {
		t.Fatalf("revert untracked: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "tmp.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected untracked file to be removed, err=%v", err)
	}

	status, err = svc.Status(context.Background(), root)
	if err != nil {
		t.Fatalf("status after revert: %v", err)
	}
	if len(status.Files) != 0 {
		t.Fatalf("expected clean working tree, got %+v", status)
	}
}

func TestGitServiceCommitAndQueries(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if err := svc.TrackChanges(context.Background(), root, []string{"note.txt"}); err != nil {
		t.Fatalf("track: %v", err)
	}
	out, err := svc.CommitChanges(context.Background(), root, "first", false, false)
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	if strings.TrimSpace(out) == "" {
		t.Fatal("expected commit output")
	}

	runGit(t, root, "branch", "base")

	if err := os.WriteFile(filepath.Join(root, "note.txt"), []byte("v2\n"), 0o644); err != nil {
		t.Fatalf("update file: %v", err)
	}
	if err := svc.TrackChanges(context.Background(), root, []string{"note.txt"}); err != nil {
		t.Fatalf("track second: %v", err)
	}
	if _, err := svc.CommitChanges(context.Background(), root, "second", false, false); err != nil {
		t.Fatalf("second commit: %v", err)
	}

	branchStatus, err := svc.BranchStatus(context.Background(), root)
	if err != nil {
		t.Fatalf("branch status: %v", err)
	}
	if branchStatus.AheadCount < 0 {
		t.Fatalf("invalid ahead count: %+v", branchStatus)
	}

	comparison, err := svc.ListCommitsToTarget(context.Background(), root, "base")
	if err != nil {
		t.Fatalf("commits to target: %v", err)
	}
	if len(comparison.Commits) == 0 {
		t.Fatal("expected commits ahead of base")
	}
	if len(comparison.AllChangedFiles) == 0 {
		t.Fatal("expected changed files in comparison")
	}

	head := strings.TrimSpace(runGit(t, root, "rev-parse", "HEAD"))
	commitDiff, err := svc.ReadCommitDiff(context.Background(), root, head, "note.txt")
	if err != nil {
		t.Fatalf("read commit diff: %v", err)
	}
	if commitDiff.NewContent == "" {
		t.Fatalf("expected new content in commit diff: %+v", commitDiff)
	}

	branchDiff, err := svc.ReadBranchComparisonDiff(context.Background(), root, "base", "note.txt")
	if err != nil {
		t.Fatalf("read branch diff: %v", err)
	}
	if branchDiff.OldContent == "" || branchDiff.NewContent == "" {
		t.Fatalf("unexpected branch diff content: %+v", branchDiff)
	}

	branches, err := svc.ListBranches(context.Background(), root)
	if err != nil {
		t.Fatalf("list branches: %v", err)
	}
	if len(branches.Branches) == 0 {
		t.Fatal("expected at least one branch")
	}
	if branches.CurrentBranch == "" {
		t.Fatal("expected current branch")
	}

	changes, err := svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes: %v", err)
	}
	if len(changes.Unstaged) != 0 || len(changes.Staged) != 0 || len(changes.Untracked) != 0 {
		t.Fatalf("expected clean sections after commits, got %+v", changes)
	}

	author, err := svc.AuthorName(context.Background(), root)
	if err != nil {
		t.Fatalf("author name: %v", err)
	}
	if author != "Test User" {
		t.Fatalf("unexpected author name: %q", author)
	}

	runGit(t, root, "checkout", "-b", "feature/remove")
	runGit(t, root, "checkout", branches.CurrentBranch)
	if err := svc.RemoveBranch(context.Background(), root, "feature/remove", false); err != nil {
		t.Fatalf("remove branch: %v", err)
	}
}

func TestGitServiceValidation(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := svc.TrackChanges(context.Background(), root, nil); err == nil {
		t.Fatal("expected error for empty paths")
	}
	if _, err := svc.CommitChanges(context.Background(), root, "", false, false); err == nil {
		t.Fatal("expected error for empty commit message")
	}
}

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

func TestGitServiceMergePullRequestRunsOutsideWorktreeWhenDeletingBranch(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	ghBinDir := t.TempDir()
	ghBinPath := filepath.Join(ghBinDir, "gh")
	argsLogPath := filepath.Join(ghBinDir, "args.log")
	pwdLogPath := filepath.Join(ghBinDir, "pwd.log")
	ghScript := "#!/bin/sh\n" +
		"if [ \"$1\" = \"api\" ] && [ \"$2\" = \"repos/{owner}/{repo}\" ]; then\n" +
		"  printf '{\"nameWithOwner\":\"acme/repo\"}'\n" +
		"  exit 0\n" +
		"fi\n" +
		"if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"merge\" ]; then\n" +
		"  pwd > '" + pwdLogPath + "'\n" +
		"  printf '%s\n' \"$@\" > '" + argsLogPath + "'\n" +
		"  printf 'merged'\n" +
		"  exit 0\n" +
		"fi\n" +
		"printf 'unexpected gh invocation' >&2\n" +
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

	argsLog, err := os.ReadFile(argsLogPath)
	if err != nil {
		t.Fatalf("read args log: %v", err)
	}
	argsText := string(argsLog)
	if !strings.Contains(argsText, "--delete-branch") {
		t.Fatalf("expected --delete-branch in args, got %q", argsText)
	}
	if !strings.Contains(argsText, "--repo\nacme/repo\n") {
		t.Fatalf("expected --repo acme/repo in args, got %q", argsText)
	}

	pwdLog, err := os.ReadFile(pwdLogPath)
	if err != nil {
		t.Fatalf("read pwd log: %v", err)
	}
	if strings.TrimSpace(string(pwdLog)) == root {
		t.Fatalf("expected merge to run outside repo worktree, cwd=%q", strings.TrimSpace(string(pwdLog)))
	}
}

func TestGitServiceListChangesRenameScenarios(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}
	runGit(t, root, "add", "a.txt")
	runGit(t, root, "commit", "-m", "seed")

	runGit(t, root, "mv", "a.txt", "b.txt")
	runGit(t, root, "add", "-A")
	changes, err := svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes for staged rename: %v", err)
	}
	if len(changes.Untracked) != 0 {
		t.Fatalf("expected no untracked entries for staged rename, got %+v", changes.Untracked)
	}
	if len(changes.Staged) != 1 || changes.Staged[0].Kind != "renamed" || changes.Staged[0].Path != "b.txt" {
		t.Fatalf("expected one staged renamed entry for b.txt, got %+v", changes.Staged)
	}

	if err := os.WriteFile(filepath.Join(root, "b.txt"), []byte("seed\nextra\n"), 0o644); err != nil {
		t.Fatalf("update renamed file: %v", err)
	}
	changes, err = svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes for renamed+modified: %v", err)
	}
	if len(changes.Untracked) != 0 {
		t.Fatalf("expected no untracked entries for renamed+modified, got %+v", changes.Untracked)
	}
	if len(changes.Staged) != 1 || changes.Staged[0].Kind != "renamed" || changes.Staged[0].Path != "b.txt" {
		t.Fatalf("expected staged rename entry for b.txt, got %+v", changes.Staged)
	}
	if len(changes.Unstaged) != 1 || changes.Unstaged[0].Kind != "modified" || changes.Unstaged[0].Path != "b.txt" {
		t.Fatalf("expected unstaged modified entry for b.txt, got %+v", changes.Unstaged)
	}
}

func TestGitServiceListChangesReconcilesDeleteAndUntrackedAsRename(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "AGENTS.md"), []byte("v1\n"), 0o644); err != nil {
		t.Fatalf("write AGENTS.md: %v", err)
	}
	runGit(t, root, "add", "AGENTS.md")
	runGit(t, root, "commit", "-m", "seed")

	if err := os.Remove(filepath.Join(root, "AGENTS.md")); err != nil {
		t.Fatalf("remove AGENTS.md: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "AGENTS1.md"), []byte("v2\n"), 0o644); err != nil {
		t.Fatalf("write AGENTS1.md: %v", err)
	}

	changes, err := svc.ListChanges(context.Background(), root)
	if err != nil {
		t.Fatalf("list changes: %v", err)
	}

	if len(changes.Untracked) != 0 {
		t.Fatalf("expected no untracked entries after rename reconciliation, got %+v", changes.Untracked)
	}
	if len(changes.Unstaged) != 1 {
		t.Fatalf("expected one unstaged entry after rename reconciliation, got %+v", changes.Unstaged)
	}
	if changes.Unstaged[0].Kind != "renamed" || changes.Unstaged[0].Path != "AGENTS1.md" {
		t.Fatalf("expected one renamed unstaged entry for AGENTS1.md, got %+v", changes.Unstaged)
	}
}

func TestGitServiceCreateAndRemoveWorktree(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := os.WriteFile(filepath.Join(root, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	runGit(t, root, "add", "seed.txt")
	runGit(t, root, "commit", "-m", "seed")

	worktreePath := filepath.Join(t.TempDir(), "wt-feature")
	if err := svc.CreateWorktree(context.Background(), root, "feature/worktree", worktreePath, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	branch := strings.TrimSpace(runGit(t, worktreePath, "rev-parse", "--abbrev-ref", "HEAD"))
	if branch != "feature/worktree" {
		t.Fatalf("expected worktree branch feature/worktree, got %q", branch)
	}
	currentBranch, err := svc.CurrentBranch(context.Background(), worktreePath)
	if err != nil {
		t.Fatalf("current branch: %v", err)
	}
	if currentBranch != "feature/worktree" {
		t.Fatalf("expected current branch feature/worktree, got %q", currentBranch)
	}
	mainWorktreePath, err := svc.MainWorktreePath(context.Background(), worktreePath)
	if err != nil {
		t.Fatalf("main worktree path: %v", err)
	}
	expectedMainWorktreePath, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve root symlink: %v", err)
	}
	actualMainWorktreePath, err := filepath.EvalSymlinks(mainWorktreePath)
	if err != nil {
		t.Fatalf("resolve main worktree symlink: %v", err)
	}
	if actualMainWorktreePath != expectedMainWorktreePath {
		t.Fatalf("expected main worktree path %q, got %q", root, mainWorktreePath)
	}

	if err := svc.RemoveWorktree(context.Background(), root, worktreePath, true); err != nil {
		t.Fatalf("remove worktree: %v", err)
	}
	if _, err := os.Stat(worktreePath); !os.IsNotExist(err) {
		t.Fatalf("expected removed worktree path to not exist, err=%v", err)
	}
	if err := svc.RemoveBranch(context.Background(), root, "feature/worktree", true); err != nil {
		t.Fatalf("remove worktree branch: %v", err)
	}
	if branches := strings.TrimSpace(runGit(t, root, "branch", "--list", "feature/worktree")); branches != "" {
		t.Fatalf("expected worktree branch removed, got %q", branches)
	}
}

func TestGitServiceFetchRef(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	root := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, root)
	runGit(t, root, "config", "user.name", "Test User")
	runGit(t, root, "config", "user.email", "test@example.com")

	if err := os.WriteFile(filepath.Join(root, "seed.txt"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	runGit(t, root, "add", "seed.txt")
	runGit(t, root, "commit", "-m", "seed")
	runGit(t, root, "push", "origin", "HEAD:main")

	other := filepath.Join(t.TempDir(), "other")
	runGit(t, t.TempDir(), "clone", remote, other)
	runGit(t, other, "checkout", "-B", "main", "origin/main")
	runGit(t, other, "config", "user.name", "Test User")
	runGit(t, other, "config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(other, "latest.txt"), []byte("latest\n"), 0o644); err != nil {
		t.Fatalf("write latest: %v", err)
	}
	runGit(t, other, "add", "latest.txt")
	runGit(t, other, "commit", "-m", "latest")
	runGit(t, other, "push", "origin", "HEAD:main")

	before := strings.TrimSpace(runGit(t, root, "rev-parse", "origin/main"))
	latest := strings.TrimSpace(runGit(t, other, "rev-parse", "HEAD"))
	if before == latest {
		t.Fatal("expected local remote-tracking branch to be stale before fetch")
	}

	svc := NewGitService()
	if err := svc.FetchRef(context.Background(), root, "main"); err != nil {
		t.Fatalf("FetchRef: %v", err)
	}

	after := strings.TrimSpace(runGit(t, root, "rev-parse", "origin/main"))
	if after != latest {
		t.Fatalf("expected origin/main %q after fetch, got %q", latest, after)
	}
}

func TestGitServiceBranchDiffSummaryDivergedBranch(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	repo := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, repo)
	runGit(t, repo, "config", "user.name", "Test User")
	runGit(t, repo, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(repo, "shared.txt"), []byte("v1\n"), 0o644)
	runGit(t, repo, "add", "shared.txt")
	runGit(t, repo, "commit", "-m", "shared v1")
	runGit(t, repo, "push", "origin", "HEAD:main")

	worktree := filepath.Join(t.TempDir(), "wt-feature")
	svc := NewGitService()
	if err := svc.CreateWorktree(context.Background(), repo, "feature", worktree, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	os.WriteFile(filepath.Join(worktree, "feature.txt"), []byte("feature work\n"), 0o644)
	runGit(t, worktree, "add", "feature.txt")
	runGit(t, worktree, "commit", "-m", "add feature file")

	runGit(t, repo, "checkout", "main")
	os.WriteFile(filepath.Join(repo, "main-only.txt"), []byte("main work\n"), 0o644)
	runGit(t, repo, "add", "main-only.txt")
	runGit(t, repo, "commit", "-m", "add main-only file")
	runGit(t, repo, "push", "origin", "HEAD:main")

	runGit(t, worktree, "fetch", "origin")

	summary, err := svc.BranchDiffSummary(context.Background(), worktree, "origin/main")
	if err != nil {
		t.Fatalf("BranchDiffSummary: %v", err)
	}
	if summary.FileCount != 1 {
		t.Fatalf("expected 1 file in branch diff summary (feature.txt only), got %d", summary.FileCount)
	}

	comparison, err := svc.ListCommitsToTarget(context.Background(), worktree, "origin/main")
	if err != nil {
		t.Fatalf("ListCommitsToTarget: %v", err)
	}
	if len(comparison.Commits) != 1 {
		t.Fatalf("expected 1 commit ahead of origin/main, got %d", len(comparison.Commits))
	}
	if len(comparison.AllChangedFiles) != 1 {
		t.Fatalf("expected 1 changed file (feature.txt only), got %d: %v", len(comparison.AllChangedFiles), comparison.AllChangedFiles)
	}
	if comparison.AllChangedFiles[0] != "feature.txt" {
		t.Fatalf("expected changed file feature.txt, got %q", comparison.AllChangedFiles[0])
	}
}

func TestGitServiceFetchRefNoRemote(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	svc := NewGitService()

	if err := svc.FetchRef(context.Background(), root, "main"); err != nil {
		t.Fatalf("expected no error for repo without remotes, got: %v", err)
	}
}

func TestGitServiceListCommitsToTargetFallsBackWhenOriginRefMissing(t *testing.T) {
	remote := filepath.Join(t.TempDir(), "remote.git")
	runGit(t, t.TempDir(), "init", "--bare", remote)

	repo := filepath.Join(t.TempDir(), "repo")
	runGit(t, t.TempDir(), "clone", remote, repo)
	runGit(t, repo, "config", "user.name", "Test User")
	runGit(t, repo, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(repo, "base.txt"), []byte("base\n"), 0o644)
	runGit(t, repo, "add", "base.txt")
	runGit(t, repo, "commit", "-m", "base commit")
	runGit(t, repo, "push", "origin", "HEAD:main")

	runGit(t, repo, "remote", "rename", "origin", "upstream")

	worktree := filepath.Join(t.TempDir(), "wt-feature")
	svc := NewGitService()
	if err := svc.CreateWorktree(context.Background(), repo, "feature", worktree, true, "HEAD"); err != nil {
		t.Fatalf("create worktree: %v", err)
	}

	os.WriteFile(filepath.Join(worktree, "feature.txt"), []byte("feature\n"), 0o644)
	runGit(t, worktree, "add", "feature.txt")
	runGit(t, worktree, "commit", "-m", "feature commit")

	comparison, err := svc.ListCommitsToTarget(context.Background(), worktree, "origin/main")
	if err != nil {
		t.Fatalf("ListCommitsToTarget: %v", err)
	}
	if len(comparison.Commits) != 1 {
		t.Fatalf("expected 1 commit after fallback target resolution, got %d", len(comparison.Commits))
	}
	if comparison.TargetBranch != "main" && comparison.TargetBranch != "upstream/main" {
		t.Fatalf("expected fallback target branch, got %q", comparison.TargetBranch)
	}
}

func TestGitServiceListCommitsToTargetReturnsEmptyWhenTargetMissing(t *testing.T) {
	root := t.TempDir()
	initGitRepo(t, root)
	runGit(t, root, "config", "user.name", "Test User")
	runGit(t, root, "config", "user.email", "test@example.com")

	os.WriteFile(filepath.Join(root, "file.txt"), []byte("content\n"), 0o644)
	runGit(t, root, "add", "file.txt")
	runGit(t, root, "commit", "-m", "initial")

	svc := NewGitService()
	comparison, err := svc.ListCommitsToTarget(context.Background(), root, "origin/main")
	if err != nil {
		t.Fatalf("expected no error when target branch is missing, got: %v", err)
	}
	if len(comparison.Commits) != 0 {
		t.Fatalf("expected no commits when target branch is missing, got %d", len(comparison.Commits))
	}
	if len(comparison.AllChangedFiles) != 0 {
		t.Fatalf("expected no changed files when target branch is missing, got %d", len(comparison.AllChangedFiles))
	}
}
