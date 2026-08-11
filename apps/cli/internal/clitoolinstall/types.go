// Package clitoolinstall installs and removes supported CLI tools on this node.
// The daemon owns CLI tool installs so the same flow works on local machines
// and remote nodes; the desktop renderer calls these operations over RPC.
package clitoolinstall

import (
	"context"
	"errors"
	"slices"
)

// ErrUnsupportedUninstall is returned when a tool cannot be uninstalled.
var ErrUnsupportedUninstall = errors.New("uninstall is not supported for this tool")

// Installer installs or removes one supported CLI tool on this node.
type Installer interface {
	// ToolID returns the stable tool identifier used by the daemon RPC.
	ToolID() string
	// Install makes the tool available on this node. It may run for minutes.
	Install(ctx context.Context) error
	// Uninstall removes a previously installed tool. Return ErrUnsupportedUninstall when unavailable.
	Uninstall(ctx context.Context) error
	// SupportsUninstall reports whether Uninstall is meaningful for this tool.
	SupportsUninstall() bool
}

// Registry maps tool IDs to installers. It is immutable after construction.
type Registry struct {
	installers map[string]Installer
}

// NewRegistry builds a registry from one or more installers.
func NewRegistry(installers ...Installer) *Registry {
	registry := &Registry{installers: make(map[string]Installer, len(installers))}
	for _, installer := range installers {
		registry.installers[installer.ToolID()] = installer
	}
	return registry
}

// Get returns the installer registered for one tool ID.
func (r *Registry) Get(toolID string) (Installer, bool) {
	installer, ok := r.installers[toolID]
	return installer, ok
}

// ToolIDs returns all registered tool IDs in sorted order.
func (r *Registry) ToolIDs() []string {
	ids := make([]string, 0, len(r.installers))
	for toolID := range r.installers {
		ids = append(ids, toolID)
	}
	slices.Sort(ids)
	return ids
}
