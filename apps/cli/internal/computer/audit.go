package computer

import (
	"sync"
	"time"
)

type auditEvent struct {
	Timestamp         string `json:"timestamp"`
	Operation         string `json:"operation"`
	TargetApplication string `json:"targetApplication,omitempty"`
	TargetWindow      string `json:"targetWindow,omitempty"`
	TargetRole        string `json:"targetRole,omitempty"`
	Decision          string `json:"decision"`
	Result            string `json:"result"`
	ErrorCode         string `json:"errorCode,omitempty"`
}

type auditLog struct {
	mu     sync.Mutex
	events []auditEvent
}

func (l *auditLog) Add(event auditEvent) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if event.Timestamp == "" {
		event.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	l.events = append(l.events, event)
}

func (l *auditLog) Snapshot() []auditEvent {
	l.mu.Lock()
	defer l.mu.Unlock()
	result := make([]auditEvent, len(l.events))
	copy(result, l.events)
	return result
}
