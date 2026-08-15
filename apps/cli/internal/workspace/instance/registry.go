package instance

import (
	"path/filepath"
	"sync"

	"yishan/apps/cli/internal/workspace"
)

// Registry is the full implementation of workspace.InstanceRegistry: the
// single owner of the mutable workspace instances on this node. The daemon
// injects it into the manager and wires the removal hook to watcher and
// PR-tracker cleanup.
type Registry struct {
	mu        sync.RWMutex
	instances map[string]workspace.Workspace
	files     *workspace.FileService
	onRemoved func(workspaceID string, path string)
}

// NewRegistry creates an instance registry backed by the given file service
// (shared path-keyed file cache).
func NewRegistry(files *workspace.FileService) *Registry {
	return &Registry{
		instances: make(map[string]workspace.Workspace),
		files:     files,
	}
}

// SetOnRemoved registers the cleanup hook fired whenever an instance is
// removed (replaced at the same path, closed, or rolled back). The daemon uses
// it to stop the filesystem watcher and PR tracker for the removed workspace.
func (r *Registry) SetOnRemoved(fn func(workspaceID string, path string)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.onRemoved = fn
}

// Open stores an instance, preserving runtime fields (hook result, pull
// request, org/project ids) from any previous instance with the same id, and
// replacing any other instance at the same path.
func (r *Registry) Open(inst workspace.Workspace) workspace.Workspace {
	r.mu.Lock()
	var existing workspace.Workspace
	if current, ok := r.instances[inst.ID]; ok {
		existing = current
	}
	existingPathID := ""
	for workspaceID, current := range r.instances {
		if current.Path != inst.Path {
			continue
		}
		existingPathID = workspaceID
		if existing.ID == "" {
			existing = current
		}
		break
	}
	inst.SetupHookResult = existing.SetupHookResult
	inst.PullRequest = existing.PullRequest
	if inst.OrgID == "" {
		inst.OrgID = existing.OrgID
	}
	if inst.ProjectID == "" {
		inst.ProjectID = existing.ProjectID
	}
	var replaced []workspace.Workspace
	if existingPathID != "" && existingPathID != inst.ID {
		replaced = append(replaced, existing)
		delete(r.instances, existingPathID)
	}
	r.instances[inst.ID] = inst
	onRemoved := r.onRemoved
	r.mu.Unlock()

	for _, removed := range replaced {
		if onRemoved != nil {
			onRemoved(removed.ID, removed.Path)
		}
	}
	return inst
}

func (r *Registry) Get(workspaceID string) (workspace.Workspace, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ws, ok := r.instances[workspaceID]
	return ws, ok
}

func (r *Registry) GetByPath(path string) (workspace.Workspace, bool) {
	resolvedPath := canonicalPath(path)
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, ws := range r.instances {
		if ws.Path == resolvedPath {
			return ws, true
		}
	}
	return workspace.Workspace{}, false
}

func (r *Registry) List() []workspace.Workspace {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]workspace.Workspace, 0, len(r.instances))
	for _, ws := range r.instances {
		out = append(out, ws)
	}
	return out
}

func (r *Registry) SetState(workspaceID string, state workspace.State, health workspace.Health) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.instances[workspaceID]
	if !ok {
		return workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	ws.State = state
	ws.Health = health
	r.instances[workspaceID] = ws
	return nil
}

func (r *Registry) SetPullRequest(workspaceID string, pr *workspace.WorkspacePullRequest) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.instances[workspaceID]
	if !ok {
		return workspace.NewRPCError(workspace.RPCErrorCodeNotFound, "workspace not found")
	}
	ws.PullRequest = pr
	r.instances[workspaceID] = ws
	return nil
}

// Remove drops an instance and fires the removal hook (watcher cleanup).
func (r *Registry) Remove(workspaceID string) {
	r.mu.Lock()
	inst, ok := r.instances[workspaceID]
	if ok {
		delete(r.instances, workspaceID)
	}
	onRemoved := r.onRemoved
	r.mu.Unlock()

	if ok && onRemoved != nil {
		onRemoved(inst.ID, inst.Path)
	}
}

func (r *Registry) InvalidateFileCache(worktreePath string, changedPaths []string) {
	r.files.InvalidateWorkspacePaths(worktreePath, changedPaths)
}

func (r *Registry) Files() *workspace.FileService {
	return r.files
}

// canonicalPath resolves a path to the canonical form used as the instance
// path key (same resolution the manager applies when opening a workspace).
func canonicalPath(path string) string {
	resolvedPath, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if canonicalPath, evalErr := filepath.EvalSymlinks(resolvedPath); evalErr == nil {
		resolvedPath = canonicalPath
	}
	return resolvedPath
}
