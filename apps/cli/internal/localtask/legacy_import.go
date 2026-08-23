package localtask

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const legacyTasksDirectory = "tasks"

// ImportLegacyProjectTasks imports legacy task metadata into SQLite without moving Task Context files.
func ImportLegacyProjectTasks(ctx context.Context, repository Repository, legacyContextRoot string, projectID string) error {
	canonicalRoot, err := canonicalLegacyContextRoot(legacyContextRoot)
	if err != nil {
		return err
	}
	records, err := readLegacyTaskRecords(canonicalRoot)
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := importLegacyTask(ctx, repository, canonicalRoot, projectID, record); err != nil {
			return err
		}
	}
	return nil
}

type legacyTaskState struct {
	Tasks []legacyTaskRecord `json:"tasks"`
}

type legacyTaskRecord struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Status  string `json:"status"`
	Created string `json:"created"`
	Path    string `json:"path"`
}

func readLegacyTaskRecords(contextRoot string) ([]legacyTaskRecord, error) {
	statePath, exists, err := resolveLegacyFile(contextRoot, filepath.Join(contextRoot, legacyTasksDirectory), "state.json")
	if err != nil {
		return nil, fmt.Errorf("resolve legacy task state: %w", err)
	}
	if !exists {
		return nil, nil
	}
	content, err := os.ReadFile(statePath)
	if err != nil {
		return nil, fmt.Errorf("read legacy task state: %w", err)
	}
	var state legacyTaskState
	if err := json.Unmarshal(content, &state); err != nil {
		return nil, fmt.Errorf("parse legacy task state: %w", err)
	}
	return state.Tasks, nil
}

func importLegacyTask(ctx context.Context, repository Repository, contextRoot string, projectID string, record legacyTaskRecord) error {
	if err := validateLegacyTaskRecord(record); err != nil {
		return err
	}
	taskPath, err := resolveLegacyTaskPath(contextRoot, record.Path)
	if err != nil {
		return err
	}
	description, completedAt, err := readLegacyTaskMetadata(contextRoot, taskPath, record.Status)
	if err != nil {
		return err
	}
	return createLegacyTaskIfMissing(ctx, repository, projectID, record, description, completedAt)
}

func validateLegacyTaskRecord(record legacyTaskRecord) error {
	if !isSafeContextTaskID(record.ID) || strings.TrimSpace(record.Title) == "" || strings.TrimSpace(record.Created) == "" {
		return fmt.Errorf("invalid legacy task record %q", record.ID)
	}
	if record.Status != string(StatusActive) && record.Status != string(StatusCompleted) {
		return fmt.Errorf("invalid legacy task status %q", record.Status)
	}
	return nil
}

func createLegacyTaskIfMissing(ctx context.Context, repository Repository, projectID string, record legacyTaskRecord, description string, completedAt *string) error {
	existing, err := repository.Get(ctx, record.ID)
	if err == nil {
		return validateLegacyTaskProject(existing, projectID)
	}
	if !errors.Is(err, ErrTaskNotFound) {
		return fmt.Errorf("read legacy local task %q: %w", record.ID, err)
	}
	status := Status(record.Status)
	_, err = repository.Create(ctx, Task{ID: record.ID, ProjectID: &projectID, Title: record.Title, Description: description, Status: status, Priority: PriorityMedium, CreatedAt: record.Created, CompletedAt: completedAt})
	if err != nil {
		return fmt.Errorf("create legacy local task %q: %w", record.ID, err)
	}
	return nil
}

func readLegacyTaskMetadata(contextRoot string, taskPath string, status string) (string, *string, error) {
	briefPath, exists, err := resolveLegacyFile(contextRoot, taskPath, "task.md")
	if err != nil {
		return "", nil, fmt.Errorf("resolve legacy task brief: %w", err)
	}
	if !exists {
		return "", nil, nil
	}
	content, err := os.ReadFile(briefPath)
	if err != nil {
		return "", nil, fmt.Errorf("read legacy task brief: %w", err)
	}
	description := buildLegacyTaskDescription(legacyTaskSection(string(content), "Goal"), legacyTaskSection(string(content), "Acceptance Criteria"))
	completedAt, err := readLegacyCompletionDate(contextRoot, taskPath, status)
	if err != nil {
		return "", nil, err
	}
	return description, completedAt, nil
}

func readLegacyCompletionDate(contextRoot string, taskPath string, status string) (*string, error) {
	if status != string(StatusCompleted) {
		return nil, nil
	}
	outcomePath, exists, err := resolveLegacyFile(contextRoot, taskPath, "outcome.md")
	if err != nil {
		return nil, fmt.Errorf("resolve legacy outcome: %w", err)
	}
	if !exists {
		return nil, nil
	}
	content, err := os.ReadFile(outcomePath)
	if err != nil {
		return nil, fmt.Errorf("read legacy outcome: %w", err)
	}
	for _, line := range strings.Split(string(content), "\n") {
		if strings.HasPrefix(line, "**Completed:** ") {
			date := strings.TrimSpace(strings.TrimPrefix(line, "**Completed:** "))
			return &date, nil
		}
	}
	return nil, nil
}

func legacyTaskSection(content string, heading string) string {
	lines := strings.Split(content, "\n")
	start := findLegacySectionContentStart(lines, heading)
	if start == -1 {
		return ""
	}
	end := findLegacySectionEnd(lines, start)
	return strings.TrimSpace(strings.Join(lines[start:end], "\n"))
}

func findLegacySectionContentStart(lines []string, heading string) int {
	for index, line := range lines {
		if line == "## "+heading {
			return index + 1
		}
	}
	return -1
}

func findLegacySectionEnd(lines []string, start int) int {
	for index := start; index < len(lines); index++ {
		if strings.HasPrefix(lines[index], "## ") {
			return index
		}
	}
	return len(lines)
}

func buildLegacyTaskDescription(goal string, criteria string) string {
	parts := make([]string, 0, 2)
	if goal != "" {
		parts = append(parts, goal)
	}
	if criteria != "" {
		parts = append(parts, "Acceptance Criteria:\n"+criteria)
	}
	return strings.Join(parts, "\n\n")
}

func resolveLegacyTaskPath(contextRoot string, legacyPath string) (string, error) {
	if filepath.IsAbs(legacyPath) {
		return "", errors.New("legacy task path must be relative")
	}
	target := filepath.Clean(filepath.Join(contextRoot, legacyPath))
	if filepath.Clean(target) == filepath.Clean(contextRoot) || !isWithinLegacyRoot(contextRoot, target) {
		return "", errors.New("legacy task path escapes context root")
	}
	resolved, err := filepath.EvalSymlinks(target)
	if err != nil {
		return "", fmt.Errorf("resolve legacy task directory: %w", err)
	}
	if filepath.Clean(resolved) == filepath.Clean(contextRoot) || !isWithinLegacyRoot(contextRoot, resolved) {
		return "", errors.New("legacy task directory symlink escapes context root")
	}
	return filepath.Clean(resolved), nil
}

func canonicalLegacyContextRoot(contextRoot string) (string, error) {
	resolved, err := filepath.EvalSymlinks(filepath.Clean(contextRoot))
	if err != nil {
		return "", fmt.Errorf("resolve legacy context root: %w", err)
	}
	return filepath.Clean(resolved), nil
}

func resolveLegacyFile(contextRoot string, directory string, fileName string) (string, bool, error) {
	target := filepath.Join(directory, fileName)
	if _, err := os.Lstat(target); errors.Is(err, os.ErrNotExist) {
		return "", false, nil
	} else if err != nil {
		return "", false, err
	}
	resolved, err := filepath.EvalSymlinks(target)
	if err != nil {
		return "", false, err
	}
	if !isWithinLegacyRoot(contextRoot, resolved) {
		return "", false, errors.New("legacy file symlink escapes context root")
	}
	return filepath.Clean(resolved), true, nil
}

func isWithinLegacyRoot(root string, target string) bool {
	relative, err := filepath.Rel(filepath.Clean(root), filepath.Clean(target))
	return err == nil && relative != ".." && !filepath.IsAbs(relative) &&
		!strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func validateLegacyTaskProject(task Task, projectID string) error {
	if task.ProjectID != nil && *task.ProjectID == projectID {
		return nil
	}
	existingProjectID := ""
	if task.ProjectID != nil {
		existingProjectID = *task.ProjectID
	}
	return &LegacyTaskIDCollisionError{
		TaskID: task.ID, ExistingProjectID: existingProjectID, ImportProjectID: projectID,
	}
}
