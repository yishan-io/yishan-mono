package relay

import (
	"sync"
	"time"
)

// Status holds the current state of the relay connection, safe for concurrent
// reads. Owned by the Client; the daemon exposes its Snapshot to health checks.
type Status struct {
	mu          sync.RWMutex
	enabled     bool
	url         string
	connected   bool
	connectedAt *time.Time
	lastError   string
	lastErrorAt *time.Time
}

// NewStatus creates a Status with the given configuration.
func NewStatus(enabled bool, relayURL string) *Status {
	return &Status{enabled: enabled, url: relayURL}
}

func (s *Status) setConnected(at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connected = true
	s.connectedAt = &at
	s.lastError = ""
	s.lastErrorAt = nil
}

func (s *Status) setDisconnected(errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connected = false
	if errMsg != "" {
		s.lastError = errMsg
		now := time.Now().UTC()
		s.lastErrorAt = &now
	}
}

// StatusSnapshot is a read-only copy of the relay status for serialisation.
type StatusSnapshot struct {
	Enabled     bool    `json:"enabled"`
	URL         string  `json:"url"`
	Connected   bool    `json:"connected"`
	ConnectedAt *string `json:"connectedAt,omitempty"`
	LastError   *string `json:"lastError,omitempty"`
	LastErrorAt *string `json:"lastErrorAt,omitempty"`
}

// Snapshot returns a read-only copy of the relay status.
func (s *Status) Snapshot() StatusSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snap := StatusSnapshot{
		Enabled:   s.enabled,
		URL:       s.url,
		Connected: s.connected,
	}
	if s.connectedAt != nil {
		t := s.connectedAt.UTC().Format(time.RFC3339)
		snap.ConnectedAt = &t
	}
	if s.lastError != "" {
		snap.LastError = &s.lastError
	}
	if s.lastErrorAt != nil {
		t := s.lastErrorAt.UTC().Format(time.RFC3339)
		snap.LastErrorAt = &t
	}
	return snap
}
