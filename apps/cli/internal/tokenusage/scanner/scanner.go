// Package scanner owns provider parsing for token-usage collection: one
// scanner per agent kind reads that agent's local session data into hourly
// usage records. The Scanner contract and Registry let the collector dispatch
// by agent kind without knowing provider names.
package scanner

import (
	"context"
	"sort"
	"sync"

	agentkind "yishan/apps/cli/internal/agent/kind"
	"yishan/apps/cli/internal/tokenusage/record"
)

// Scanner scans one agent provider's local session data for hourly token
// usage. Providers implement this contract and are registered in a Registry;
// the collector dispatches by agent kind instead of switching on provider
// names.
type Scanner interface {
	ScanHourlyUsage(ctx context.Context, input ScanInput) ([]record.UsageRecord, error)
}

// ScannerFunc adapts a plain function to the Scanner interface.
type ScannerFunc func(ctx context.Context, input ScanInput) ([]record.UsageRecord, error)

// ScanHourlyUsage implements Scanner.
func (f ScannerFunc) ScanHourlyUsage(ctx context.Context, input ScanInput) ([]record.UsageRecord, error) {
	return f(ctx, input)
}

// Registry maps agent kinds to their scanners. It is the single owner of the
// provider set: the collector asks it for the scanner of an agent kind, so
// adding a provider means registering it here, not editing collection code.
type Registry struct {
	mu       sync.RWMutex
	scanners map[string]Scanner
}

// NewRegistry returns an empty scanner registry.
func NewRegistry() *Registry {
	return &Registry{scanners: make(map[string]Scanner)}
}

// Register maps an agent kind to its scanner. A later Register for the same
// kind replaces the earlier scanner.
func (r *Registry) Register(agentKind string, s Scanner) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.scanners[agentKind] = s
}

// Scanner returns the scanner registered for an agent kind.
func (r *Registry) Scanner(agentKind string) (Scanner, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.scanners[agentKind]
	return s, ok
}

// Kinds returns the registered agent kinds in stable sorted order.
func (r *Registry) Kinds() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	kinds := make([]string, 0, len(r.scanners))
	for kind := range r.scanners {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	return kinds
}

// DefaultRegistry returns the built-in provider set. Add a new provider here
// instead of extending the collector's dispatch switch.
func DefaultRegistry() *Registry {
	r := NewRegistry()
	r.Register(agentkind.Claude, ScannerFunc(ScanClaudeHourlyUsage))
	r.Register(agentkind.Codex, ScannerFunc(ScanCodexHourlyUsage))
	r.Register(agentkind.OpenCode, ScannerFunc(ScanOpenCodeHourlyUsage))
	r.Register(agentkind.Gemini, ScannerFunc(ScanGeminiHourlyUsage))
	r.Register(agentkind.Pi, ScannerFunc(ScanPiHourlyUsage))
	return r
}
