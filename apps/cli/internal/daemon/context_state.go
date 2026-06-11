package daemon

import (
	"sync"

	"github.com/spf13/viper"
	"yishan/apps/cli/internal/config"
)

// AppContextStore holds renderer-pushed context about the user's current
// selection in the desktop UI — which org, project, workspace, and file
// they are looking at. The MCP server reads from this to give agents
// awareness of the yishan environment.
type AppContextStore struct {
	mu                sync.RWMutex
	ActiveProjectID   string
	ActiveWorkspaceID string
	ActiveOrgID       string
	ActiveFilePath    string

	contextFilePath string
}

// NewAppContextStore creates a new AppContextStore. contextFilePath is the
// path to the profile's context.yaml, used to persist org changes.
func NewAppContextStore(contextFilePath string) *AppContextStore {
	return &AppContextStore{contextFilePath: contextFilePath}
}

// GetState returns a snapshot of the current context.
func (s *AppContextStore) GetState() map[string]any {
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
func (s *AppContextStore) SetActiveProject(projectID string) {
	s.mu.Lock()
	s.ActiveProjectID = projectID
	s.mu.Unlock()
}

// SetActiveWorkspace updates the active workspace ID.
func (s *AppContextStore) SetActiveWorkspace(workspaceID string) {
	s.mu.Lock()
	s.ActiveWorkspaceID = workspaceID
	s.mu.Unlock()
}

// SetActiveFile updates the active file path.
func (s *AppContextStore) SetActiveFile(filePath string) {
	s.mu.Lock()
	s.ActiveFilePath = filePath
	s.mu.Unlock()
}

// SetCurrentOrg updates the current org ID and persists it to context.yaml
// so that the CLI and MCP server pick up the change.
func (s *AppContextStore) SetCurrentOrg(orgID string) error {
	s.mu.Lock()
	s.ActiveOrgID = orgID
	s.mu.Unlock()

	if s.contextFilePath == "" {
		return nil
	}

	return config.UpdateContext(s.contextFilePath, func(cfg *viper.Viper) {
		cfg.Set(config.KeyContextOrgID, orgID)
	})
}
