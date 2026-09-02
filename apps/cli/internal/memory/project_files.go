package memory

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const memoryFileName = "MEMORY.md"

// ProjectMemoryFile is one authorized file below a project's .my-context directory.
type ProjectMemoryFile struct {
	Path    string
	Content string
}

// ReconcileStats is the stable result exposed to daemon capability clients.
type ReconcileStats struct {
	Inserted int
	Updated  int
	Deleted  int
}

// ReadProjectFile reads one regular file below an authorized project context root.
func (s *Service) ReadProjectFile(workspaceRoot, projectRoot, relativePath string) (ProjectMemoryFile, error) {
	_, root, err := resolveProjectMemoryRoot(workspaceRoot, projectRoot, false)
	if err != nil {
		return ProjectMemoryFile{}, err
	}
	path, err := resolveMemoryFile(root, relativePath)
	if err != nil {
		return ProjectMemoryFile{}, err
	}
	path, err = filepath.EvalSymlinks(path)
	if err != nil || !isWithinRoot(root, path) {
		return ProjectMemoryFile{}, errors.New("memory file is outside .my-context")
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return ProjectMemoryFile{}, errors.New("memory file is not a regular file")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return ProjectMemoryFile{}, fmt.Errorf("read memory file: %w", err)
	}
	return ProjectMemoryFile{Path: path, Content: string(content)}, nil
}

// StoreProjectEntry appends one durable entry and refreshes its memory index record.
func (s *Service) StoreProjectEntry(workspaceRoot, projectRoot, projectID, section, entry, date string) (string, error) {
	project, root, err := resolveProjectMemoryRoot(workspaceRoot, projectRoot, true)
	if err != nil {
		return "", err
	}
	memoryPath := filepath.Join(root, memoryFileName)
	content, err := readOptionalMemoryFile(memoryPath)
	if err != nil {
		return "", err
	}
	updated, err := appendProjectMemoryEntry(content, section, entry, date)
	if err != nil {
		return "", err
	}
	if err := writeProjectMemoryFile(memoryPath, updated); err != nil {
		return "", err
	}
	if err := s.OnFileChanged(memoryPath, project, projectID); err != nil {
		return "", fmt.Errorf("index memory file: %w", err)
	}
	return memoryPath, nil
}

// ReconcileRegistered refreshes workspaces while preserving registered Local Task contexts.
func (s *Service) ReconcileRegistered(refs []WorkspaceRef) (ReconcileStats, error) {
	s.taskContextsMu.RLock()
	tasks := make([]TaskContextRef, 0, len(s.taskContexts))
	for _, task := range s.taskContexts {
		tasks = append(tasks, task)
	}
	s.taskContextsMu.RUnlock()
	result, err := s.ReconcileWithTaskContexts(refs, tasks)
	return ReconcileStats{Inserted: result.Inserted, Updated: result.Updated, Deleted: result.Deleted}, err
}

func resolveProjectMemoryRoot(workspaceRoot, requestedRoot string, create bool) (string, string, error) {
	workspace, err := filepath.EvalSymlinks(workspaceRoot)
	if err != nil {
		return "", "", errors.New("workspace root is unavailable")
	}
	candidate := requestedRoot
	if candidate == "" {
		candidate = workspace
	} else if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(workspace, candidate)
	}
	candidate, err = filepath.EvalSymlinks(candidate)
	if err != nil {
		return "", "", errors.New("project root is unavailable")
	}
	if !isWithinRoot(workspace, candidate) || filepath.Base(candidate) == ".my-context" {
		return "", "", errors.New("project root is outside the authorized workspace")
	}
	memoryRoot := filepath.Join(candidate, ".my-context")
	if create {
		if err := os.MkdirAll(memoryRoot, 0o755); err != nil {
			return "", "", fmt.Errorf("create memory directory: %w", err)
		}
	}
	resolved, err := filepath.EvalSymlinks(memoryRoot)
	if err != nil {
		return "", "", errors.New("memory directory is unavailable")
	}
	return candidate, resolved, nil
}

func resolveMemoryFile(memoryRoot, relativePath string) (string, error) {
	if relativePath == "" || filepath.IsAbs(relativePath) {
		return "", errors.New("memory path must be relative to .my-context")
	}
	path := filepath.Join(memoryRoot, filepath.Clean(relativePath))
	if !isWithinRoot(memoryRoot, path) || path == memoryRoot {
		return "", errors.New("memory path must stay within .my-context")
	}
	return path, nil
}

func isWithinRoot(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func readOptionalMemoryFile(path string) (string, error) {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil || !info.Mode().IsRegular() {
		return "", errors.New("memory store file is not a regular file")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read memory file: %w", err)
	}
	return string(content), nil
}

func appendProjectMemoryEntry(content, section, entry, date string) (string, error) {
	if strings.TrimSpace(entry) == "" {
		return "", errors.New("memory entry is required")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return "", errors.New("memory entry date is invalid")
	}
	heading, formatted, err := formatProjectMemoryEntry(section, entry, date)
	if err != nil {
		return "", err
	}
	lines := normalizeProjectMemoryLines(content, date)
	headingIndex := findMemoryLine(lines, heading, 0)
	nextHeading := findNextMemoryHeading(lines, headingIndex+1)
	if !memorySectionContains(lines[headingIndex+1:nextHeading], formatted) {
		lines = append(lines[:nextHeading], append([]string{"", formatted}, lines[nextHeading:]...)...)
	}
	return normalizeMemorySpacing(lines), nil
}

func formatProjectMemoryEntry(section, entry, date string) (string, string, error) {
	switch section {
	case "locked_decisions":
		return string(SectionLockedDecisions), "- " + date + " - " + entry, nil
	case "durable_discoveries":
		return string(SectionDurableDiscoveries), "- " + entry, nil
	default:
		return "", "", errors.New("memory section is invalid")
	}
}

func normalizeProjectMemoryLines(content, date string) []string {
	if strings.TrimSpace(content) == "" {
		content = "# Project Memory\n\n## Decisions\n\n## Durable Discoveries\n"
	}
	lines := strings.Split(strings.TrimSpace(content), "\n")
	timestamp := "_Last updated: " + date + "_"
	timestampIndex := findMemoryPrefix(lines, "_Last updated: ")
	if timestampIndex >= 0 {
		lines[timestampIndex] = timestamp
	} else {
		lines = append(lines[:1], append([]string{"", timestamp, ""}, lines[1:]...)...)
	}
	for index, line := range lines {
		if strings.TrimSpace(line) == "## Locked Decisions" {
			lines[index] = string(SectionLockedDecisions)
		}
	}
	for _, heading := range []string{string(SectionLockedDecisions), string(SectionDurableDiscoveries)} {
		if findMemoryLine(lines, heading, 0) < 0 {
			lines = append(lines, "", heading, "")
		}
	}
	return lines
}

func findMemoryPrefix(lines []string, prefix string) int {
	for index, line := range lines {
		if strings.HasPrefix(line, prefix) {
			return index
		}
	}
	return -1
}

func findMemoryLine(lines []string, expected string, start int) int {
	for index := start; index < len(lines); index++ {
		if strings.TrimSpace(lines[index]) == expected {
			return index
		}
	}
	return -1
}

func findNextMemoryHeading(lines []string, start int) int {
	for index := start; index < len(lines); index++ {
		if strings.HasPrefix(lines[index], "## ") {
			return index
		}
	}
	return len(lines)
}

func memorySectionContains(lines []string, expected string) bool {
	return findMemoryLine(lines, expected, 0) >= 0
}

func normalizeMemorySpacing(lines []string) string {
	content := strings.TrimSpace(strings.Join(lines, "\n"))
	for strings.Contains(content, "\n\n\n") {
		content = strings.ReplaceAll(content, "\n\n\n", "\n\n")
	}
	return content + "\n"
}

func writeProjectMemoryFile(path, content string) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".memory-")
	if err != nil {
		return fmt.Errorf("create memory staging file: %w", err)
	}
	defer os.Remove(temporary.Name())
	if _, err := temporary.WriteString(content); err != nil {
		temporary.Close()
		return fmt.Errorf("write memory staging file: %w", err)
	}
	if err := temporary.Chmod(0o644); err != nil {
		temporary.Close()
		return fmt.Errorf("set memory file mode: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close memory staging file: %w", err)
	}
	if err := os.Rename(temporary.Name(), path); err != nil {
		return fmt.Errorf("replace memory file: %w", err)
	}
	return nil
}
