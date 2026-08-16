package memory

import (
	"context"
	"errors"
	"strings"
)

// Shared application contract types for the memory package. Workflow-specific
// types live near their behavior: DB row types in db.go, reconcile input in
// reconcile.go, search result in search.go, session transcript types in
// agent_reader.go, summarizer types in summarizer.go, persona types in
// persona_sections.go / persona_summarizer.go, budget limits in budget.go.

// ErrAgentNotFound is returned by RunAgentFunc when the agent binary cannot be
// located on the system. Callers should treat this as a configuration issue
// (agent not installed) and skip gracefully rather than reporting an error.
var ErrAgentNotFound = errors.New("agent binary not found")

// SummarizerConfig controls the automatic post-session summarizer.
// AgentKind is retained for backwards-compatible settings wiring, but the
// runtime always normalizes post-session summarization to the built-in Pi
// agent. Model is optional; when empty Pi's default model is used.
type SummarizerConfig struct {
	Enabled              bool
	DisableProjectMemory bool
	DisablePersona       bool
	AgentKind            string
	Model                string
}

// normalizeSummarizerConfig forces summarizer execution onto the built-in Pi agent.
func normalizeSummarizerConfig(cfg SummarizerConfig) SummarizerConfig {
	trimmedAgentKind := strings.TrimSpace(cfg.AgentKind)
	if trimmedAgentKind != "" && trimmedAgentKind != builtInSummarizerAgentKind {
		cfg.Model = ""
	}
	cfg.AgentKind = builtInSummarizerAgentKind
	return cfg
}

// RunAgentFunc runs a non-interactive agent prompt and returns its text output.
// workDir is the working directory for the agent process; pass the workspace
// path so the agent uses the correct project context for config discovery.
// The memory package accepts this as a dependency so it doesn't need to know
// about agentcmd directly (avoids import cycle).
type RunAgentFunc func(ctx context.Context, agentKind, model, prompt, workDir string) (string, error)
