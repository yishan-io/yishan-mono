package localtask

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const legacyTasksDirectory = "tasks"

// ImportLegacyProjectTasks imports legacy task metadata and copies its Task Context.
func ImportLegacyProjectTasks(ctx context.Context, repository Repository, legacyContextRoot string, projectID string, resolveTarget func(string) (string, error)) error {
	records, err := readLegacyTaskRecords(legacyContextRoot)
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := importLegacyTask(ctx, repository, legacyContextRoot, projectID, resolveTarget, record); err != nil {
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

func importLegacyTask(ctx context.Context, repository Repository, contextRoot string, projectID string, resolveTarget func(string) (string, error), record legacyTaskRecord) error {
	if err := validateLegacyTaskRecord(record); err != nil {
		return err
	}
	if err := createLegacyTaskIfMissing(ctx, repository, projectID, record); err != nil {
		return err
	}
	sourcePath, err := resolveLegacyTaskPath(contextRoot, record.Path)
	if err != nil {
		return err
	}
	targetPath, err := resolveTarget(record.ID)
	if err != nil {
		return fmt.Errorf("resolve task context target: %w", err)
	}
	return copyLegacyTaskContext(sourcePath, targetPath)
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

func createLegacyTaskIfMissing(ctx context.Context, repository Repository, projectID string, record legacyTaskRecord) error {
	_, err := repository.Get(ctx, record.ID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrTaskNotFound) {
		return fmt.Errorf("read legacy local task %q: %w", record.ID, err)
	}
	status := Status(record.Status)
	_, err = repository.Create(ctx, Task{ID: record.ID, ProjectID: &projectID, Title: record.Title, Status: status, Priority: PriorityMedium, CreatedAt: record.Created})
	if err != nil {
		return fmt.Errorf("create legacy local task %q: %w", record.ID, err)
	}
	return nil
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

func copyLegacyTaskContext(sourcePath string, targetPath string) error {
	if err := os.MkdirAll(targetPath, 0o755); err != nil {
		return fmt.Errorf("create task context directory: %w", err)
	}
	for _, document := range []string{"plan.md", "notes.md", "outcome.md"} {
		if err := copyMissingFile(filepath.Join(sourcePath, document), filepath.Join(targetPath, document)); err != nil {
			return err
		}
	}
	return nil
}

func copyMissingFile(sourcePath string, targetPath string) error {
	if _, err := os.Stat(targetPath); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("check task context target: %w", err)
	}
	source, err := os.Open(sourcePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open task context source: %w", err)
	}
	defer source.Close()
	target, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create task context target: %w", err)
	}
	defer target.Close()
	if _, err := io.Copy(target, source); err != nil {
		return fmt.Errorf("copy task context: %w", err)
	}
	return nil
}
