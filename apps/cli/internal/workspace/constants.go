package workspace

// Workspace kind strings used throughout the CLI and daemon.
// Both values originate from the api-service schema; define them here as the
// canonical source so daemon, provision, and cmd packages stay in sync.
const (
	KindPrimary  = "primary"
	KindWorktree = "worktree"
)

// ContextLinkName is the symlink directory created inside each worktree that
// points to the shared .my-context directory. Defined here once to prevent
// silent divergence between the daemon and workspace packages.
const ContextLinkName = ".my-context"

// ContextMarkerName marks a real `.my-context` directory as daemon-owned for
// non-git projects. The marker makes removal safe: a toggled-off non-git
// project removes only a directory that carries this file.
const ContextMarkerName = ".yishan-context"
