package daemon

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"yishan/apps/cli/internal/config"
)

const workspaceCleanupFileName = "pending-workspace-cleanups.json"

type pendingWorkspaceCleanup struct {
	WorkspaceID   string `json:"workspaceId"`
	Path          string `json:"path"`
	Branch        string `json:"branch,omitempty"`
	RemoveBranch  bool   `json:"removeBranch,omitempty"`
	ForceWorktree bool   `json:"forceWorktree,omitempty"`
	ForceBranch   bool   `json:"forceBranch,omitempty"`
	PostHook      string `json:"postHook,omitempty"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
	Attempts      int    `json:"attempts"`
	LastError     string `json:"lastError,omitempty"`
}

type pendingWorkspaceCleanupFile struct {
	Items []pendingWorkspaceCleanup `json:"items"`
}

type workspaceCleanupStore struct {
	mu   sync.Mutex
	path string
}

func newWorkspaceCleanupStore(configPath string) (*workspaceCleanupStore, error) {
	path, err := resolveWorkspaceCleanupFilePath(configPath)
	if err != nil {
		return nil, err
	}
	return &workspaceCleanupStore{path: path}, nil
}

func resolveWorkspaceCleanupFilePath(configPath string) (string, error) {
	if strings.TrimSpace(configPath) != "" {
		return filepath.Join(filepath.Dir(configPath), workspaceCleanupFileName), nil
	}
	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(yishanHome, workspaceCleanupFileName), nil
}

func (s *workspaceCleanupStore) Add(item pendingWorkspaceCleanup) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	item.UpdatedAt = now
	if item.CreatedAt == "" {
		item.CreatedAt = now
	}
	for i := range file.Items {
		if file.Items[i].WorkspaceID == item.WorkspaceID {
			item.Attempts = file.Items[i].Attempts
			item.LastError = file.Items[i].LastError
			file.Items[i] = item
			return s.saveLocked(file)
		}
	}
	file.Items = append(file.Items, item)
	return s.saveLocked(file)
}

func (s *workspaceCleanupStore) Remove(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return err
	}
	items := file.Items[:0]
	for _, item := range file.Items {
		if item.WorkspaceID != workspaceID {
			items = append(items, item)
		}
	}
	file.Items = items
	return s.saveLocked(file)
}

func (s *workspaceCleanupStore) List() ([]pendingWorkspaceCleanup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	items := make([]pendingWorkspaceCleanup, len(file.Items))
	copy(items, file.Items)
	return items, nil
}

func (s *workspaceCleanupStore) MarkFailure(workspaceID string, cleanupErr error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return err
	}
	for i := range file.Items {
		if file.Items[i].WorkspaceID == workspaceID {
			file.Items[i].Attempts++
			file.Items[i].UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
			file.Items[i].LastError = cleanupErr.Error()
			return s.saveLocked(file)
		}
	}
	return nil
}

func (s *workspaceCleanupStore) loadLocked() (pendingWorkspaceCleanupFile, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return pendingWorkspaceCleanupFile{}, nil
		}
		return pendingWorkspaceCleanupFile{}, fmt.Errorf("read workspace cleanup file %q: %w", s.path, err)
	}
	if len(raw) == 0 {
		return pendingWorkspaceCleanupFile{}, nil
	}
	var file pendingWorkspaceCleanupFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return pendingWorkspaceCleanupFile{}, fmt.Errorf("parse workspace cleanup file %q: %w", s.path, err)
	}
	return file, nil
}

func (s *workspaceCleanupStore) saveLocked(file pendingWorkspaceCleanupFile) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create workspace cleanup dir for %q: %w", s.path, err)
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("encode workspace cleanup file: %w", err)
	}
	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o600); err != nil {
		return fmt.Errorf("write workspace cleanup file %q: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, s.path); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("replace workspace cleanup file %q: %w", s.path, err)
	}
	return nil
}
