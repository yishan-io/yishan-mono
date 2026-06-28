// Package agentkind defines the canonical agent kind string constants shared
// across the yishan CLI. Must stay in sync with packages/core/src/agentKinds.ts.
package agentkind

const (
	OpenCode = "opencode"
	Claude   = "claude"
	Codex    = "codex"
	Gemini   = "gemini"
	Pi       = "pi"
	Copilot  = "copilot"
	Cursor   = "cursor"
)

// All is the full list of supported agent kinds.
var All = []string{OpenCode, Claude, Codex, Gemini, Pi, Copilot, Cursor}

// WithTokenTracking lists agents that have token tracking support.
var WithTokenTracking = []string{OpenCode, Claude, Codex, Gemini, Pi}

// WithActiveTokenScanners lists agents whose local scanners produce real token data.
var WithActiveTokenScanners = []string{OpenCode, Claude, Codex, Pi}

// WithReadableSessionText lists agents whose local session storage contains
// readable conversation text (usable for memory summarization).
var WithReadableSessionText = []string{OpenCode, Claude}
