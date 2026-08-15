package workspace

import "sync"

// InstanceRegistry is the single owner of the mutable workspace instances on
// this node. The manager and the daemon route instance reads and writes
// through it; the concrete implementation lives in internal/workspace/instance
// (the daemon injects it). This interface exists here so the workspace package
// can depend on the registry without an import cycle.
type InstanceRegistry interface {
	// Open stores an instance, replacing any other instance at the same path.
	Open(inst Workspace) Workspace
	// Get returns the instance for a workspace id.
	Get(workspaceID string) (Workspace, bool)
	// GetByPath returns the instance whose canonical path matches.
	GetByPath(path string) (Workspace, bool)
	// List returns all instances.
	List() []Workspace
	// SetState updates the runtime state and health of an instance.
	SetState(workspaceID string, state State, health Health) error
	// SetPullRequest attaches the observed pull request to an instance.
	SetPullRequest(workspaceID string, pr *WorkspacePullRequest) error
	// Remove drops an instance (firing the removal hook when one is set).
	Remove(workspaceID string)
	// SetOnRemoved registers the cleanup hook fired whenever an instance is
	// removed (replaced at the same path, closed, or rolled back).
	SetOnRemoved(fn func(workspaceID string, path string))
	// InvalidateFileCache drops cached file entries under a worktree path.
	InvalidateFileCache(worktreePath string, changedPaths []string)
	// Files returns the file service (path-keyed file cache) shared by handles.
	Files() *FileService
}

// memoryRegistry is the default in-package implementation used when no
// instance registry is injected (workspace-package tests). The daemon injects
// the full registry from internal/workspace/instance instead.
type memoryRegistry struct {
	mu        sync.RWMutex
	instances map[string]Workspace
	files     *FileService
}

func newMemoryRegistry() *memoryRegistry {
	return &memoryRegistry{
		instances: make(map[string]Workspace),
		files:     NewFileService(),
	}
}

func (r *memoryRegistry) Open(inst Workspace) Workspace {
	r.mu.Lock()
	defer r.mu.Unlock()
	var existing Workspace
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
	if existingPathID != "" && existingPathID != inst.ID {
		delete(r.instances, existingPathID)
	}
	r.instances[inst.ID] = inst
	return inst
}

func (r *memoryRegistry) Get(workspaceID string) (Workspace, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ws, ok := r.instances[workspaceID]
	return ws, ok
}

func (r *memoryRegistry) GetByPath(path string) (Workspace, bool) {
	resolvedPath := canonicalizeWorkspacePath(path)
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, ws := range r.instances {
		if ws.Path == resolvedPath {
			return ws, true
		}
	}
	return Workspace{}, false
}

func (r *memoryRegistry) List() []Workspace {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Workspace, 0, len(r.instances))
	for _, ws := range r.instances {
		out = append(out, ws)
	}
	return out
}

func (r *memoryRegistry) SetState(workspaceID string, state State, health Health) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.instances[workspaceID]
	if !ok {
		return NewRPCError(rpcCodeNotFound, "workspace not found")
	}
	ws.State = state
	ws.Health = health
	r.instances[workspaceID] = ws
	return nil
}

func (r *memoryRegistry) SetPullRequest(workspaceID string, pr *WorkspacePullRequest) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.instances[workspaceID]
	if !ok {
		return NewRPCError(rpcCodeNotFound, "workspace not found")
	}
	ws.PullRequest = pr
	r.instances[workspaceID] = ws
	return nil
}

func (r *memoryRegistry) Remove(workspaceID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.instances, workspaceID)
}

// SetOnRemoved is a no-op in the default registry: workspace-package tests do
// not depend on the removal hook (the daemon injects the instance-package
// registry, which fires it).
func (r *memoryRegistry) SetOnRemoved(func(workspaceID string, path string)) {}

func (r *memoryRegistry) InvalidateFileCache(worktreePath string, changedPaths []string) {
	r.files.InvalidateWorkspacePaths(worktreePath, changedPaths)
}

func (r *memoryRegistry) Files() *FileService {
	return r.files
}
