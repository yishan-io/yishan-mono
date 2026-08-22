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
	records, err := readLegacyTaskRecords(legacyContextRoot)
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := importLegacyTask(ctx, repository, legacyContextRoot, projectID, record); err != nil {
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
	statePath := filepath.Join(contextRoot, legacyTasksDirectory, "state.json")
	content, err := os.ReadFile(statePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
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
	description, completedAt, err := readLegacyTaskMetadata(taskPath, record.Status)
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
	_, err := repository.Get(ctx, record.ID)
	if err == nil {
		return nil
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

func readLegacyTaskMetadata(taskPath string, status string) (string, *string, error) {
	content, err := os.ReadFile(filepath.Join(taskPath, "task.md"))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, fmt.Errorf("read legacy task brief: %w", err)
	}
	description := buildLegacyTaskDescription(legacyTaskSection(string(content), "Goal"), legacyTaskSection(string(content), "Acceptance Criteria"))
	completedAt, err := readLegacyCompletionDate(taskPath, status)
	if err != nil {
		return "", nil, err
	}
	return description, completedAt, nil
}

func readLegacyCompletionDate(taskPath string, status string) (*string, error) {
	if status != string(StatusCompleted) {
		return nil, nil
	}
	content, err := os.ReadFile(filepath.Join(taskPath, "outcome.md"))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
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
	root := filepath.Clean(contextRoot)
	target := filepath.Clean(filepath.Join(root, legacyPath))
	if target == root || !strings.HasPrefix(target, root+string(filepath.Separator)) {
		return "", errors.New("legacy task path escapes context root")
	}
	return target, nil
}
