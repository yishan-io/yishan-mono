package workspace

// ContextLinkName is the symlink directory created inside each worktree that
// points to the shared .my-context directory. Defined here once to prevent
// silent divergence between the daemon and workspace packages.
const ContextLinkName = ".my-context"

// contextMarkerName marks a real `.my-context` directory as daemon-owned for
// non-git projects. The marker makes removal safe: a toggled-off non-git
// project removes only a directory that carries this file.
const contextMarkerName = ".yishan-context"
