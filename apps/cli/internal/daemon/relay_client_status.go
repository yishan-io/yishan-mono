package daemon

import (
	"sync"
	"time"
)

// RelayStatus holds the current state of the relay connection, safe for concurrent reads.
type RelayStatus struct {
	mu          sync.RWMutex
	enabled     bool
	url         string
	connected   bool
	connectedAt *time.Time
	lastError   string
	lastErrorAt *time.Time
}

// NewRelayStatus creates a RelayStatus with the given configuration.
func NewRelayStatus(enabled bool, relayURL string) *RelayStatus {
	return &RelayStatus{enabled: enabled, url: relayURL}
}

func (s *RelayStatus) setConnected(at time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connected = true
	s.connectedAt = &at
	s.lastError = ""
	s.lastErrorAt = nil
}

func (s *RelayStatus) setDisconnected(errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connected = false
	if errMsg != "" {
		s.lastError = errMsg
		now := time.Now().UTC()
		s.lastErrorAt = &now
	}
}

// Snapshot returns a read-only copy of the relay status for serialisation.
type RelayStatusSnapshot struct {
	Enabled     bool    `json:"enabled"`
	URL         string  `json:"url"`
	Connected   bool    `json:"connected"`
	ConnectedAt *string `json:"connectedAt,omitempty"`
	LastError   *string `json:"lastError,omitempty"`
	LastErrorAt *string `json:"lastErrorAt,omitempty"`
}

func (s *RelayStatus) Snapshot() RelayStatusSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	snap := RelayStatusSnapshot{
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
