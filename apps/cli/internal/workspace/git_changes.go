package workspace

import (
	"context"
	"strings"
)

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
		path = normalizeStatusPath(path)
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

	sections = reconcileUnstagedDeleteUntrackedAddPairs(sections)

	return sections, nil
}

func reconcileUnstagedDeleteUntrackedAddPairs(input GitChangesBySection) GitChangesBySection {
	deletedUnstaged := make([]GitChange, 0)
	addedUntracked := make([]GitChange, 0)
	for _, file := range input.Unstaged {
		if file.Kind == "deleted" {
			deletedUnstaged = append(deletedUnstaged, file)
		}
	}
	for _, file := range input.Untracked {
		if file.Kind == "added" {
			addedUntracked = append(addedUntracked, file)
		}
	}
	if len(deletedUnstaged) == 0 || len(addedUntracked) == 0 {
		return input
	}

	renamesByNewPath := map[string]GitChange{}
	consumedDeletedPaths := map[string]bool{}
	consumedAddedPaths := map[string]bool{}

	for _, deletedFile := range deletedUnstaged {
		deletedExt := fileExtension(deletedFile.Path)
		deletedParent := parentPath(deletedFile.Path)

		var sameDirectoryCandidate *GitChange
		for i := range addedUntracked {
			candidate := addedUntracked[i]
			if consumedAddedPaths[candidate.Path] {
				continue
			}
			if parentPath(candidate.Path) != deletedParent {
				continue
			}
			if deletedExt == "" || fileExtension(candidate.Path) == deletedExt {
				sameDirectoryCandidate = &candidate
				break
			}
		}

		fallbackCandidate := sameDirectoryCandidate
		if fallbackCandidate == nil {
			for i := range addedUntracked {
				candidate := addedUntracked[i]
				if consumedAddedPaths[candidate.Path] {
					continue
				}
				if deletedExt != "" && fileExtension(candidate.Path) == deletedExt {
					fallbackCandidate = &candidate
					break
				}
			}
		}

		if fallbackCandidate == nil {
			continue
		}

		consumedDeletedPaths[deletedFile.Path] = true
		consumedAddedPaths[fallbackCandidate.Path] = true

		existingRename, hasExisting := renamesByNewPath[fallbackCandidate.Path]
		if hasExisting {
			existingRename.Additions = maxInt(existingRename.Additions, fallbackCandidate.Additions)
			existingRename.Deletions = maxInt(existingRename.Deletions, fallbackCandidate.Deletions)
			renamesByNewPath[fallbackCandidate.Path] = existingRename
			continue
		}

		renamesByNewPath[fallbackCandidate.Path] = GitChange{
			Path:      fallbackCandidate.Path,
			Kind:      "renamed",
			Additions: maxInt(0, fallbackCandidate.Additions),
			Deletions: maxInt(0, fallbackCandidate.Deletions),
		}
	}

	if len(renamesByNewPath) == 0 {
		return input
	}

	nextUnstaged := make([]GitChange, 0, len(input.Unstaged)+len(renamesByNewPath))
	for _, file := range input.Unstaged {
		if consumedDeletedPaths[file.Path] {
			continue
		}
		nextUnstaged = append(nextUnstaged, file)
	}
	for _, renamed := range renamesByNewPath {
		nextUnstaged = append(nextUnstaged, renamed)
	}

	nextUntracked := make([]GitChange, 0, len(input.Untracked))
	for _, file := range input.Untracked {
		if consumedAddedPaths[file.Path] {
			continue
		}
		nextUntracked = append(nextUntracked, file)
	}

	input.Unstaged = nextUnstaged
	input.Untracked = nextUntracked
	return input
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

func parentPath(path string) string {
	normalizedPath := strings.ReplaceAll(path, "\\", "/")
	slashIndex := strings.LastIndex(normalizedPath, "/")
	if slashIndex <= 0 {
		return ""
	}
	return normalizedPath[:slashIndex]
}

func fileExtension(path string) string {
	fileName := path
	if slashIndex := strings.LastIndex(strings.ReplaceAll(path, "\\", "/"), "/"); slashIndex >= 0 {
		fileName = strings.ReplaceAll(path, "\\", "/")[slashIndex+1:]
	}
	dotIndex := strings.LastIndex(fileName, ".")
	if dotIndex <= 0 || dotIndex == len(fileName)-1 {
		return ""
	}
	return strings.ToLower(fileName[dotIndex+1:])
}

func maxInt(values ...int) int {
	if len(values) == 0 {
		return 0
	}
	maxValue := values[0]
	for _, value := range values[1:] {
		if value > maxValue {
			maxValue = value
		}
	}
	return maxValue
}

