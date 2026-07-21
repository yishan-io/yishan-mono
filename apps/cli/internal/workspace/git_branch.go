package workspace

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

func (s *GitService) BranchStatus(ctx context.Context, root string) (GitBranchStatus, error) {
	// `git status --branch --porcelain=v2` returns both the upstream tracking
	// branch and the ahead/behind counts in a single subprocess call, replacing
	// two sequential rev-parse + rev-list calls.
	out, err := gitCommand(ctx, root, "status", "--branch", "--porcelain=v2")
	if err != nil {
		return GitBranchStatus{}, err
	}

	var hasUpstream bool
	ahead := 0

	for line := range strings.SplitSeq(out, "\n") {
		// # branch.ab +<ahead> -<behind>
		if strings.HasPrefix(line, "# branch.ab ") {
			hasUpstream = true
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				fmt.Sscanf(fields[2], "+%d", &ahead)
			}
		}
		// # branch.upstream <remote>/<branch>  (only present when tracking branch exists)
		if strings.HasPrefix(line, "# branch.upstream ") {
			hasUpstream = true
		}
	}

	return GitBranchStatus{HasUpstream: hasUpstream, AheadCount: ahead}, nil
}

func (s *GitService) CurrentBranch(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	branch := strings.TrimSpace(out)
	if branch == "" || branch == "HEAD" {
		return "", NewRPCError(rpcCodeToolUnavailable, "workspace is not on a branch")
	}
	return branch, nil
}

func (s *GitService) MainWorktreePath(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "worktree", "list", "--porcelain")
	if err != nil {
		return "", err
	}
	for line := range strings.SplitSeq(out, "\n") {
		if path, ok := strings.CutPrefix(line, "worktree "); ok {
			path = strings.TrimSpace(path)
			if path != "" {
				return path, nil
			}
		}
	}
	return "", NewRPCError(rpcCodeToolUnavailable, "main worktree not found")
}

func (s *GitService) AuthorName(ctx context.Context, root string) (string, error) {
	out, err := gitCommand(ctx, root, "config", "user.name")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

func (s *GitService) ListBranches(ctx context.Context, root string) (GitBranchList, error) {
	s.mu.RLock()
	entry, ok := s.branchCache[root]
	s.mu.RUnlock()
	if ok && time.Since(entry.at) < branchCacheTTL {
		return entry.data, nil
	}

	list, err := s.listBranchesFromGit(ctx, root)
	if err != nil {
		return GitBranchList{}, err
	}

	s.mu.Lock()
	s.branchCache[root] = branchCacheEntry{data: list, at: time.Now()}
	s.mu.Unlock()

	go s.backgroundFetchBranches(root)

	return list, nil
}

func (s *GitService) backgroundFetchBranches(root string) {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	_ = s.FetchRef(ctx, root, "")
}

func (s *GitService) listBranchesFromGit(ctx context.Context, root string) (GitBranchList, error) {
	out, err := gitCommand(ctx, root, "branch", "--all", "--no-color")
	if err != nil {
		return GitBranchList{}, err
	}
	currentOut, _ := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	current := strings.TrimSpace(currentOut)
	set := map[string]bool{}
	localSet := map[string]bool{}
	remoteSet := map[string]bool{}
	worktreeSet := map[string]bool{}
	for line := range strings.SplitSeq(out, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		isCurrent := strings.HasPrefix(trimmed, "*")
		isWorktree := strings.HasPrefix(trimmed, "+")
		name := strings.TrimSpace(strings.TrimLeft(trimmed, "*+"))
		name = strings.TrimPrefix(name, "remotes/")
		if strings.HasSuffix(name, "->") || strings.Contains(name, " -> ") || name == "" {
			continue
		}

		set[name] = true
		if strings.Contains(trimmed, "remotes/") {
			remoteSet[name] = true
			continue
		}

		if isWorktree && !isCurrent {
			worktreeSet[name] = true
			continue
		}

		localSet[name] = true
	}
	branches := make([]string, 0, len(set))
	for b := range set {
		branches = append(branches, b)
	}
	localBranches := make([]string, 0, len(localSet))
	for b := range localSet {
		localBranches = append(localBranches, b)
	}
	remoteBranches := make([]string, 0, len(remoteSet))
	for b := range remoteSet {
		remoteBranches = append(remoteBranches, b)
	}
	worktreeBranches := make([]string, 0, len(worktreeSet))
	for b := range worktreeSet {
		worktreeBranches = append(worktreeBranches, b)
	}
	sort.Strings(branches)
	sort.Strings(localBranches)
	sort.Strings(remoteBranches)
	sort.Strings(worktreeBranches)
	if current != "" && !set[current] {
		branches = append([]string{current}, branches...)
		localBranches = append([]string{current}, localBranches...)
	}
	return GitBranchList{
		CurrentBranch:    current,
		Branches:         branches,
		LocalBranches:    localBranches,
		RemoteBranches:   remoteBranches,
		WorktreeBranches: worktreeBranches,
	}, nil
}

func (s *GitService) ListCommitsToTarget(ctx context.Context, root string, targetBranch string) (GitCommitComparison, error) {
	if strings.TrimSpace(targetBranch) == "" {
		return GitCommitComparison{}, NewRPCError(rpcCodeInvalidParams, "targetBranch is required")
	}
	resolvedTargetBranch, err := resolveCommitComparisonTarget(ctx, root, strings.TrimSpace(targetBranch))
	if err != nil {
		return GitCommitComparison{}, err
	}

	currentBranch, _ := gitCommand(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	if !refExists(ctx, root, resolvedTargetBranch) {
		return GitCommitComparison{
			CurrentBranch:   strings.TrimSpace(currentBranch),
			TargetBranch:    resolvedTargetBranch,
			AllChangedFiles: []GitCommitFile{},
			Commits:         []GitCommit{},
		}, nil
	}
	logOut, err := gitCommand(ctx, root, "log", "--no-decorate", "--date=iso-strict", "--name-status", "--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%aI%x1f%s", fmt.Sprintf("%s..HEAD", resolvedTargetBranch))
	if err != nil {
		return GitCommitComparison{}, err
	}
	allChanged, err := gitCommand(ctx, root, "diff", "--name-status", fmt.Sprintf("%s...HEAD", resolvedTargetBranch))
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
		fileLines := strings.Join(lines[1:], "\n")
		commits = append(commits, GitCommit{
			Hash:         meta[0],
			ShortHash:    meta[1],
			AuthorName:   meta[2],
			CommittedAt:  meta[3],
			Subject:      meta[4],
			ChangedFiles: parseNameStatusLines(fileLines),
		})
	}

	return GitCommitComparison{
		CurrentBranch:   strings.TrimSpace(currentBranch),
		TargetBranch:    resolvedTargetBranch,
		AllChangedFiles: parseNameStatusLines(allChanged),
		Commits:         commits,
	}, nil
}

// parseNameStatusLines parses output from git --name-status into GitCommitFile
// entries. Rename/copy lines have three tab-separated fields: status, old path,
// new path. All other lines have two fields: status, path.
func parseNameStatusLines(output string) []GitCommitFile {
	files := make([]GitCommitFile, 0)
	for line := range strings.SplitSeq(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		status := strings.ToUpper(parts[0])
		// Normalise Rnn/Cnn similarity scores (e.g. "R100") to "R"/"C".
		if len(status) > 1 && (status[0] == 'R' || status[0] == 'C') {
			status = string(status[0])
		}
		f := GitCommitFile{Path: parts[1], Status: status}
		if (status == "R" || status == "C") && len(parts) >= 3 {
			f.OldPath = parts[1]
			f.Path = parts[2]
		}
		files = append(files, f)
	}
	return files
}

func resolveCommitComparisonTarget(ctx context.Context, root string, targetBranch string) (string, error) {
	if targetBranch == "" {
		return "", NewRPCError(rpcCodeInvalidParams, "targetBranch is required")
	}

	if refExists(ctx, root, targetBranch) {
		return targetBranch, nil
	}

	branchName := targetBranch
	if strings.Contains(targetBranch, "/") {
		if _, suffix, ok := strings.Cut(targetBranch, "/"); ok {
			branchName = suffix
		}
	}

	if refExists(ctx, root, branchName) {
		return branchName, nil
	}

	remote, err := resolveRemote(ctx, root)
	if err == nil && remote != "" {
		candidate := fmt.Sprintf("%s/%s", remote, branchName)
		if refExists(ctx, root, candidate) {
			return candidate, nil
		}
	}

	return targetBranch, nil
}

func refExists(ctx context.Context, root string, ref string) bool {
	if strings.TrimSpace(ref) == "" || ref == "HEAD" {
		return false
	}
	_, err := gitCommand(ctx, root, "rev-parse", "--verify", ref)
	return err == nil
}

func (s *GitService) BranchDiffSummary(ctx context.Context, root string, targetBranch string) (GitBranchDiffSummary, error) {
	if strings.TrimSpace(targetBranch) == "" {
		return GitBranchDiffSummary{}, NewRPCError(rpcCodeInvalidParams, "targetBranch is required")
	}

	numstat, err := gitCommand(ctx, root, "diff", "--numstat", fmt.Sprintf("%s...HEAD", targetBranch))
	if err != nil {
		return GitBranchDiffSummary{}, err
	}

	stats := parseNumstat(numstat)
	files := make([]string, 0, len(stats))
	additions := 0
	deletions := 0
	for path, v := range stats {
		files = append(files, path)
		additions += v[0]
		deletions += v[1]
	}
	sort.Strings(files)

	return GitBranchDiffSummary{FileCount: len(files), Additions: additions, Deletions: deletions, Files: files}, nil
}

func (s *GitService) ReadCommitDiff(ctx context.Context, root string, commitHash string, path string) (GitDiffContent, error) {
	if strings.TrimSpace(commitHash) == "" || strings.TrimSpace(path) == "" {
		return GitDiffContent{}, NewRPCError(rpcCodeInvalidParams, "commitHash and path are required")
	}
	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("%s^:%s", commitHash, path))
	newContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("%s:%s", commitHash, path))
	return GitDiffContent{OldContent: oldContent, NewContent: newContent}, nil
}

func (s *GitService) ReadBranchComparisonDiff(ctx context.Context, root string, targetBranch string, path string) (GitDiffContent, error) {
	if strings.TrimSpace(targetBranch) == "" || strings.TrimSpace(path) == "" {
		return GitDiffContent{}, NewRPCError(rpcCodeInvalidParams, "targetBranch and path are required")
	}
	oldContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("%s:%s", targetBranch, path))
	newContent, _ := gitCommand(ctx, root, "show", fmt.Sprintf("HEAD:%s", path))
	return GitDiffContent{OldContent: oldContent, NewContent: newContent}, nil
}
