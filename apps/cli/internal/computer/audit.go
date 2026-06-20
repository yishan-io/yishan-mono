package computer

import (
	"sync"
	"time"
)

type AuditEvent struct {
	Timestamp         string `json:"timestamp"`
	Operation         string `json:"operation"`
	TargetApplication string `json:"targetApplication,omitempty"`
	TargetWindow      string `json:"targetWindow,omitempty"`
	TargetRole        string `json:"targetRole,omitempty"`
	Decision          string `json:"decision"`
	Result            string `json:"result"`
	ErrorCode         string `json:"errorCode,omitempty"`
}

type AuditLog struct {
	mu     sync.Mutex
	events []AuditEvent
}

func (l *AuditLog) Add(event AuditEvent) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	l.events = append(l.events, event)
}

func (l *AuditLog) Snapshot() []AuditEvent {
	l.mu.Lock()
	defer l.mu.Unlock()
	result := make([]AuditEvent, len(l.events))
	copy(result, l.events)
	return result
}
