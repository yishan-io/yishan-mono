package workspace

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

type GitStatusResponse struct {
	Branch string   `json:"branch"`
	Files  []string `json:"files"`
	Raw    string   `json:"raw"`
}

type GitChange struct {
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type GitChangesBySection struct {
	Unstaged  []GitChange `json:"unstaged"`
	Staged    []GitChange `json:"staged"`
	Untracked []GitChange `json:"untracked"`
}

type GitBranchStatus struct {
	HasUpstream bool `json:"hasUpstream"`
	AheadCount  int  `json:"aheadCount"`
}

type GitCommit struct {
	Hash         string   `json:"hash"`
	ShortHash    string   `json:"shortHash"`
	AuthorName   string   `json:"authorName"`
	CommittedAt  string   `json:"committedAt"`
	Subject      string   `json:"subject"`
	ChangedFiles []string `json:"changedFiles"`
}

type GitCommitComparison struct {
	CurrentBranch   string      `json:"currentBranch"`
	TargetBranch    string      `json:"targetBranch"`
	AllChangedFiles []string    `json:"allChangedFiles"`
	Commits         []GitCommit `json:"commits"`
}

type GitDiffContent struct {
	OldContent string `json:"oldContent"`
	NewContent string `json:"newContent"`
}

type GitBranchList struct {
	CurrentBranch string   `json:"currentBranch"`
	Branches      []string `json:"branches"`
}

type GitInspectResult struct {
	IsGitRepository bool   `json:"isGitRepository"`
	RemoteURL       string `json:"remoteUrl,omitempty"`
	CurrentBranch   string `json:"currentBranch,omitempty"`
}

type GitService struct{}

func NewGitService() *GitService {
	return &GitService{}
}

func (s *GitService) Status(ctx context.Context, root string) (GitStatusResponse, error) {
	out, err := gitCommand(ctx, root, "status", "--porcelain", "--branch")
	if err != nil {
		return GitStatusResponse{}, err
	}
	return parseStatusOutput(out), nil
}

func (s *GitService) Inspect(ctx context.Context, path string) (GitInspectResult, error) {
	candidatePath := strings.TrimSpace(path)
	if candidatePath == "" {
		return GitInspectResult{}, NewRPCError(-32602, "path is required")
	}

	absPath, err := filepath.Abs(candidatePath)
	if err != nil {
		return GitInspectResult{}, err
	}

	statInfo, err := os.Stat(absPath)
	if err == nil && !statInfo.IsDir() {
		absPath = filepath.Dir(absPath)
	}

	topLevel, err := gitCommand(ctx, absPath, "rev-parse", "--show-toplevel")
	if err != nil || strings.TrimSpace(topLevel) == "" {
		return GitInspectResult{IsGitRepository: false}, nil
	}

	repoRoot := strings.TrimSpace(topLevel)
	remoteURL, _ := gitCommand(ctx, repoRoot, "config", "--get", "remote.origin.url")
	currentBranch, _ := gitCommand(ctx, repoRoot, "rev-parse", "--abbrev-ref", "HEAD")

	return GitInspectResult{
		IsGitRepository: true,
		RemoteURL:       strings.TrimSpace(remoteURL),
		CurrentBranch:   strings.TrimSpace(currentBranch),
	}, nil
}

func (s *GitService) ListChanges(ctx context.Context, root string) (GitChangesBySection, error) {
	porcelain, err := gitCommand(ctx, root, "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return GitChangesBySection{}, err
	}
	unstagedNumstat, err := gitCommand(ctx, root, "diff", "--numstat")
	if err != nil {
		return GitChangesBySection{}, err
	}
	stagedNumstat, err := gitCommand(ctx, root, "diff", "--cached", "--numstat")
	if err != nil {
		return GitChangesBySection{}, err
	}

	unstagedStats := parseNumstat(unstagedNumstat)
	stagedStats := parseNumstat(stagedNumstat)

	sections := GitChangesBySection{
		Unstaged:  []GitChange{},
		Staged:    []GitChange{},
		Untracked: []GitChange{},
	}

	for line := range strings.SplitSeq(porcelain, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.TrimSpace(line) == "" || len(line) < 3 {
			continue
		}

		indexStatus := line[0]
		worktreeStatus := line[1]
		path := strings.TrimSpace(line[3:])
		if path == "" {
			continue
		}

		if indexStatus == '?' && worktreeStatus == '?' {
			sections.Untracked = append(sections.Untracked, GitChange{Path: path, Kind: "added"})
			continue
		}

		if indexStatus != ' ' && indexStatus != '?' {
			add, del := statValue(stagedStats[path])
			sections.Staged = append(sections.Staged, GitChange{Path: path, Kind: mapStatusToKind(indexStatus), Additions: add, Deletions: del})
		}
		if worktreeStatus != ' ' && worktreeStatus != '?' {
			add, del := statValue(unstagedStats[path])
			sections.Unstaged = append(sections.Unstaged, GitChange{Path: path, Kind: mapStatusToKind(worktreeStatus), Additions: add, Deletions: del})
		}
	}

	return sections, nil
}

func (s *GitService) TrackChanges(ctx context.Context, root string, paths []string) error {
	if len(paths) == 0 {
		return NewRPCError(-32602, "paths are required")
	}
	_, err := gitCommandCombined(ctx, root, append([]string{"add", "--"}, paths...)...)
	return err
}

func (s *GitService) UnstageChanges(ctx context.Context, root string, paths []string) error {
	if len(paths) == 0 {
		return NewRPCError(-32602, "paths are required")
	}
	_, err := gitCommandCombined(ctx, root, append([]string{"restore", "--staged", "--"}, paths...)...)
	return err
}

func (s *GitService) RevertChanges(ctx context.Context, root string, paths []string) error {
	if len(paths) == 0 {
		return NewRPCError(-32602, "paths are required")
	}

	untrackedPaths, err := s.listUntrackedPaths(ctx, root, paths)
	if err != nil {
		return err
	}

	tracked := make([]string, 0, len(paths))
	untracked := make([]string, 0, len(paths))
	for _, p := range paths {
		if untrackedPaths[p] {
			untracked = append(untracked, p)
		} else {
			tracked = append(tracked, p)
		}
	}

	if len(tracked) > 0 {
		if _, err := gitCommandCombined(ctx, root, append([]string{"restore", "--staged", "--worktree", "--"}, tracked...)...); err != nil {
			return err
		}
	}
	if len(untracked) > 0 {
		if _, err := gitCommandCombined(ctx, root, append([]string{"clean", "-f", "--"}, untracked...)...); err != nil {
			return err
		}
	}

	return nil
}

func (s *GitService) CommitChanges(ctx context.Context, root string, message string, amend bool, signoff bool) (string, error) {
	if strings.TrimSpace(message) == "" {
		return "", NewRPCError(-32602, "message is required")
	}

	args := []string{"commit", "-m", message}
	if amend {
		args = append(args, "--amend")
	}
	if signoff {
		args = append(args, "--signoff")
	}
	if _, err := gitCommandCombined(ctx, root, args...); err != nil {
		return "", err
	}

	hash, err := gitCommand(ctx, root, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(hash), nil
}

func (s *GitService) BranchStatus(ctx context.Context, root string) (GitBranchStatus, error) {
	tracking, err := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
	hasUpstream := err == nil && strings.TrimSpace(tracking) != ""

	ahead := 0
	if hasUpstream {
		count, err := gitCommand(ctx, root, "rev-list", "--count", "@{u}..HEAD")
		if err == nil {
			fmt.Sscanf(strings.TrimSpace(count), "%d", &ahead)
		}
	}

	return GitBranchStatus{HasUpstream: hasUpstream, AheadCount: ahead}, nil
}

func (s *GitService) ListCommitsToTarget(ctx context.Context, root string, targetBranch string) (GitCommitComparison, error) {
	if strings.TrimSpace(targetBranch) == "" {
		return GitCommitComparison{}, NewRPCError(-32602, "targetBranch is required")
	}

	currentBranch, _ := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	logOut, err := gitCommand(ctx, root, "log", "--no-decorate", "--date=iso-strict", "--name-only", "--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%aI%x1f%s", fmt.Sprintf("%s..HEAD", targetBranch))
	if err != nil {
		return GitCommitComparison{}, err
	}
	allChanged, err := gitCommand(ctx, root, "diff", "--name-only", fmt.Sprintf("%s..HEAD", targetBranch))
	if err != nil {
		return GitCommitComparison{}, err
	}

	commits := make([]GitCommit, 0)
	for record := range strings.SplitSeq(logOut, "\x1e") {
		record = strings.TrimSpace(record)
		if record == "" {
			continue
		}
		lines := make([]string, 0)
		for line := range strings.SplitSeq(record, "\n") {
			lines = append(lines, line)
		}
		meta := strings.Split(lines[0], "\x1f")
		if len(meta) < 5 {
			continue
		}
		changed := make([]string, 0)
		for _, line := range lines[1:] {
			line = strings.TrimSpace(line)
			if line != "" {
				changed = append(changed, line)
			}
		}
		commits = append(commits, GitCommit{
			Hash:         meta[0],
			ShortHash:    meta[1],
			AuthorName:   meta[2],
			CommittedAt:  meta[3],
			Subject:      meta[4],
			ChangedFiles: changed,
		})
	}

	allChangedFiles := make([]string, 0)
	for line := range strings.SplitSeq(allChanged, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			allChangedFiles = append(allChangedFiles, line)
		}
	}

	return GitCommitComparison{
		CurrentBranch:   strings.TrimSpace(currentBranch),
		TargetBranch:    strings.TrimSpace(targetBranch),
		AllChangedFiles: allChangedFiles,
		Commits:         commits,
	}, nil
}

func (s *GitService) ReadCommitDiff(ctx context.Context, root string, commitHash string, path string) (GitDiffContent, error) {
	if strings.TrimSpace(commitHash) == "" || strings.TrimSpace(path) == "" {
		return GitDiffContent{}, NewRPCError(-32602, "commitHash and path are required")
	}
	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("%s^:%s", commitHash, path))
	newContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("%s:%s", commitHash, path))
	return GitDiffContent{OldContent: oldContent, NewContent: newContent}, nil
}

func (s *GitService) ReadBranchComparisonDiff(ctx context.Context, root string, targetBranch string, path string) (GitDiffContent, error) {
	if strings.TrimSpace(targetBranch) == "" || strings.TrimSpace(path) == "" {
		return GitDiffContent{}, NewRPCError(-32602, "targetBranch and path are required")
	}
	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("%s:%s", targetBranch, path))
	newContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("HEAD:%s", path))
	return GitDiffContent{OldContent: oldContent, NewContent: newContent}, nil
}

func (s *GitService) ListBranches(ctx context.Context, root string) (GitBranchList, error) {
	out, err := gitCommand(ctx, root, "branch", "--all")
	if err != nil {
		return GitBranchList{}, err
	}
	currentOut, _ := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	current := strings.TrimSpace(currentOut)
	set := map[string]bool{}
	for line := range strings.SplitSeq(out, "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "*"))
		line = strings.TrimPrefix(line, "remotes/")
		if line != "" {
			set[line] = true
		}
	}
	branches := make([]string, 0, len(set))
	for b := range set {
		branches = append(branches, b)
	}
	sort.Strings(branches)
	if current != "" && !set[current] {
		branches = append([]string{current}, branches...)
	}
	return GitBranchList{CurrentBranch: current, Branches: branches}, nil
}

func (s *GitService) PushBranch(ctx context.Context, root string) (string, error) {
	out, err := gitCommandCombined(ctx, root, "push")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (s *GitService) PublishBranch(ctx context.Context, root string) (string, error) {
	remote := "origin"
	remotesOut, err := gitCommand(ctx, root, "remote")
	if err == nil {
		remotes := splitNonEmptyLines(remotesOut)
		if !slices.Contains(remotes, "origin") {
			if len(remotes) == 0 {
				return "", NewRPCError(-32010, "no git remote configured")
			}
			remote = remotes[0]
		}
	}

	out, err := gitCommandCombined(ctx, root, "push", remote, "HEAD", "-u")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (s *GitService) RenameBranch(ctx context.Context, root string, nextBranch string) error {
	if strings.TrimSpace(nextBranch) == "" {
		return NewRPCError(-32602, "nextBranch is required")
	}
	_, err := gitCommandCombined(ctx, root, "branch", "-m", nextBranch)
	return err
}

func (s *GitService) RemoveBranch(ctx context.Context, root string, branch string, force bool) error {
	if strings.TrimSpace(branch) == "" {
		return NewRPCError(-32602, "branch is required")
	}
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := gitCommandCombined(ctx, root, "branch", flag, branch)
	return err
}

func (s *GitService) CreateWorktree(ctx context.Context, root string, branch string, worktreePath string, createBranch bool, fromRef string) error {
	if strings.TrimSpace(branch) == "" {
		return NewRPCError(-32602, "branch is required")
	}
	if strings.TrimSpace(worktreePath) == "" {
		return NewRPCError(-32602, "worktreePath is required")
	}

	absWorktreePath, err := filepath.Abs(worktreePath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absWorktreePath), 0o755); err != nil {
		return err
	}

	if createBranch {
		ref := strings.TrimSpace(fromRef)
		if ref == "" {
			ref = "HEAD"
		}
		_, err := gitCommandCombined(ctx, root, "worktree", "add", "-b", branch, absWorktreePath, ref)
		return err
	}

	_, err = gitCommandCombined(ctx, root, "worktree", "add", absWorktreePath, branch)
	return err
}

func (s *GitService) RemoveWorktree(ctx context.Context, root string, worktreePath string, force bool) error {
	if strings.TrimSpace(worktreePath) == "" {
		return NewRPCError(-32602, "worktreePath is required")
	}

	absWorktreePath, err := filepath.Abs(worktreePath)
	if err != nil {
		return err
	}

	args := []string{"worktree", "remove"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, absWorktreePath)
	_, err = gitCommandCombined(ctx, root, args...)
	return err
}

func (s *GitService) AuthorName(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "config", "user.name")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (s *GitService) listUntrackedPaths(ctx context.Context, root string, paths []string) (map[string]bool, error) {
	if len(paths) == 0 {
		return map[string]bool{}, nil
	}
	out, err := gitCommand(ctx, root, append([]string{"ls-files", "--others", "--exclude-standard", "--"}, paths...)...)
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, line := range splitNonEmptyLines(out) {
		set[line] = true
	}
	return set, nil
}

func parseStatusOutput(raw string) GitStatusResponse {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return GitStatusResponse{Branch: "", Files: nil, Raw: ""}
	}

	lines := make([]string, 0)
	for line := range strings.SplitSeq(raw, "\n") {
		lines = append(lines, line)
	}
	resp := GitStatusResponse{Raw: raw}
	if len(lines) > 0 && strings.HasPrefix(lines[0], "##") {
		resp.Branch = strings.TrimSpace(strings.TrimPrefix(lines[0], "##"))
		lines = lines[1:]
	}

	files := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) > 3 {
			files = append(files, strings.TrimSpace(line[3:]))
		} else {
			files = append(files, line)
		}
	}
	resp.Files = files
	return resp
}

func gitCommand(ctx context.Context, cwd string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", cwd}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return "", NewRPCError(-32010, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", err
	}
	return string(out), nil
}

func gitCommandCombined(ctx context.Context, cwd string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", cwd}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", NewRPCError(-32010, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func splitNonEmptyLines(input string) []string {
	out := make([]string, 0)
	for line := range strings.SplitSeq(input, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func parseNumstat(raw string) map[string][2]int {
	out := map[string][2]int{}
	for line := range strings.SplitSeq(strings.TrimSpace(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 3 {
			continue
		}
		var add, del int
		fmt.Sscanf(parts[0], "%d", &add)
		fmt.Sscanf(parts[1], "%d", &del)
		out[parts[2]] = [2]int{add, del}
	}
	return out
}

func statValue(v [2]int) (int, int) {
	return v[0], v[1]
}

func mapStatusToKind(status byte) string {
	switch status {
	case 'A':
		return "added"
	case 'M':
		return "modified"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	default:
		return "modified"
	}
}
