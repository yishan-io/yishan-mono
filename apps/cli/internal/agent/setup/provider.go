package setup

// Provider declarations: the pi providers Yishan manages and the source
// specs their packages install from. These declarations describe the desired
// state; installation execution (InstallPiExtension / EnsureDefaultPiExtensions
// / the pi CLI runners) lives with the install functions and never hard-codes
// a provider list.

const (
	piNotifyExtensionName    = "@yishan-io/pi-notify"
	piSubagentsExtensionName = "@yishan-io/pi-subagents"
	piMemoryExtensionName    = "@yishan-io/pi-memory"
	piTaskExtensionName      = "@yishan-io/pi-task"
	piDevFlowExtensionName   = "@yishan-io/pi-dev-flow"
	piWorkspaceExtensionName = "@yishan-io/pi-workspace"
	piAskExtensionName       = "@yishan-io/pi-ask"
	piLspExtensionName       = "@yishan-io/pi-lsp"
	piCodeGraphExtensionName = "@yishan-io/pi-codegraph"
)

// defaultPiExtensionNames is the desired extension set for the managed pi
// agent install. It is the single provider declaration the catalog lists and
// the reconcile state compares against.
var defaultPiExtensionNames = []string{
	piNotifyExtensionName,
	piSubagentsExtensionName,
	piMemoryExtensionName,
	piTaskExtensionName,
	piDevFlowExtensionName,
	piWorkspaceExtensionName,
	piAskExtensionName,
	piLspExtensionName,
	piCodeGraphExtensionName,
}

// piExtensionInstallSource derives the npm source spec for a default
// extension name. pi matches installs/removals/updates by source identity, so
// the npm: prefix is required — a bare package name never matches.
func piExtensionInstallSource(name string) string {
	return "npm:" + name
}
