package daemon

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const workspaceIndexFileName = "workspace-index.json"

// workspaceIndexEntry records a workspace that has been opened under this
// profile's daemon at least once. The daemon writes this file on every open/close
// so the CLI can read the correct worktree set without the daemon running.
type workspaceIndexEntry struct {
	WorkspaceID  string `json:"workspaceId"`
	WorktreePath string `json:"worktreePath"`
	ProjectID    string `json:"projectId,omitempty"`
	OrgID        string `json:"orgId,omitempty"`
	State        string `json:"state"`
	Health       string `json:"health,omitempty"`
	LastSeen     string `json:"lastSeen,omitempty"`
	Error        string `json:"error,omitempty"`
}

type workspaceIndexFile struct {
	Entries []workspaceIndexEntry `json:"entries"`
}

// workspaceIndexStore persists the set of workspaces that have been opened
// under the current profile. It is the source of truth used by the memory
// CLI commands when the daemon is not running.
type workspaceIndexStore struct {
	mu   sync.Mutex
	path string
}

func newWorkspaceIndexStore(statePath string) (*workspaceIndexStore, error) {
	dir := filepath.Dir(statePath)
	if strings.TrimSpace(dir) == "" {
		return nil, fmt.Errorf("invalid state path: %q", statePath)
	}
	return &workspaceIndexStore{path: filepath.Join(dir, workspaceIndexFileName)}, nil
}

// Upsert adds or updates the entry for workspaceID.
func (s *workspaceIndexStore) Upsert(entry workspaceIndexEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return err
	}
	for i, e := range file.Entries {
		if e.WorkspaceID == entry.WorkspaceID {
			file.Entries[i] = entry
			return s.saveLocked(file)
		}
	}
	file.Entries = append(file.Entries, entry)
	return s.saveLocked(file)
}

// Remove deletes the entry for workspaceID.
func (s *workspaceIndexStore) Remove(workspaceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return err
	}
	kept := file.Entries[:0]
	for _, e := range file.Entries {
		if e.WorkspaceID != workspaceID {
			kept = append(kept, e)
		}
	}
	file.Entries = kept
	return s.saveLocked(file)
}

// List returns all recorded entries.
func (s *workspaceIndexStore) List() ([]workspaceIndexEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	file, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	out := make([]workspaceIndexEntry, len(file.Entries))
	copy(out, file.Entries)
	return out, nil
}

func (s *workspaceIndexStore) loadLocked() (workspaceIndexFile, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return workspaceIndexFile{}, nil
		}
		return workspaceIndexFile{}, fmt.Errorf("read workspace index %q: %w", s.path, err)
	}
	if len(raw) == 0 {
		return workspaceIndexFile{}, nil
	}
	var file workspaceIndexFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return workspaceIndexFile{}, fmt.Errorf("parse workspace index %q: %w", s.path, err)
	}
	return file, nil
}

func (s *workspaceIndexStore) saveLocked(file workspaceIndexFile) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create workspace index dir: %w", err)
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("encode workspace index: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return fmt.Errorf("write workspace index %q: %w", tmp, err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("replace workspace index %q: %w", s.path, err)
	}
	return nil
}

// WorkspaceIndexPath returns the path for the given state file, so the CLI
// can read the index without importing the daemon package internals.
func WorkspaceIndexPath(statePath string) string {
	return filepath.Join(filepath.Dir(statePath), workspaceIndexFileName)
}
