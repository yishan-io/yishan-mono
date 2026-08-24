package localtask

import "context"

// WorkspaceDisplayKind is the localTask.getDetails workspace kind wire contract.
// Managed represents a daemon worktree, Local represents a primary checkout,
// and Folder represents a non-git local folder.
type WorkspaceDisplayKind string

const (
	WorkspaceDisplayKindManaged WorkspaceDisplayKind = "managed"
	WorkspaceDisplayKindLocal   WorkspaceDisplayKind = "local"
	WorkspaceDisplayKindFolder  WorkspaceDisplayKind = "folder"
)

// WorkspaceDisplay is the resolved display metadata for a currently linked workspace.
type WorkspaceDisplay struct {
	ID   string               `json:"id"`
	Name string               `json:"name"`
	Kind WorkspaceDisplayKind `json:"kind"`
}

// ProjectDisplay is the resolved display metadata for a linked workspace's project.
type ProjectDisplay struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

// Details is the detail-specific Local Task RPC projection.
type Details struct {
	Task       Task               `json:"task"`
	Workspaces []WorkspaceDisplay `json:"workspaces"`
	Project    *ProjectDisplay    `json:"project"`
}

// ProjectResolver resolves display metadata without exposing a remote adapter.
type ProjectResolver interface {
	ResolveTaskProject(context.Context, string, string) (ProjectDisplay, bool, error)
}
