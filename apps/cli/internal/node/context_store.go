package node

import (
	"sync"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
)

// ContextStore holds renderer-pushed context about the user's current
// selection in the desktop UI — which org, project, workspace, and file
// they are looking at. The MCP server reads from this to give agents
// awareness of the yishan environment.
type ContextStore struct {
	mu                sync.RWMutex
	ActiveProjectID   string
	ActiveWorkspaceID string
	ActiveOrgID       string
	ActiveFilePath    string

	settingsFilePath string
}

// NewContextStore creates a new ContextStore. settingsFilePath is the
// path to the profile's settings.yaml, used to persist org changes.
func NewContextStore(settingsFilePath string) *ContextStore {
	return &ContextStore{settingsFilePath: settingsFilePath}
}

// GetState returns a snapshot of the current context.
func (s *ContextStore) GetState() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]any{
		"activeOrgId":       s.ActiveOrgID,
		"activeProjectId":   s.ActiveProjectID,
		"activeWorkspaceId": s.ActiveWorkspaceID,
		"activeFilePath":    s.ActiveFilePath,
	}
}

// SetActiveProject updates the active project ID.
func (s *ContextStore) SetActiveProject(projectID string) {
	s.mu.Lock()
	s.ActiveProjectID = projectID
	s.mu.Unlock()
}

// SetActiveWorkspace updates the active workspace ID.
func (s *ContextStore) SetActiveWorkspace(workspaceID string) {
	s.mu.Lock()
	s.ActiveWorkspaceID = workspaceID
	s.mu.Unlock()
}

// SetActiveFile updates the active file path.
func (s *ContextStore) SetActiveFile(filePath string) {
	s.mu.Lock()
	s.ActiveFilePath = filePath
	s.mu.Unlock()
}

// SetCurrentOrg updates the current org ID and persists it to settings.yaml
// so that the CLI and MCP server pick up the change.
func (s *ContextStore) SetCurrentOrg(orgID string) error {
	s.mu.Lock()
	s.ActiveOrgID = orgID
	s.mu.Unlock()

	if s.settingsFilePath == "" {
		return nil
	}

	return config.UpdateSettings(s.settingsFilePath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyDefaultOrgID, orgID)
	})
}
