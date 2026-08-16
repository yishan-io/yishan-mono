package memory

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// failingDateReader simulates a session-read failure inside the persona batch.
type failingDateReader struct{}

func (failingDateReader) ReadSessionsForDate(agent string, date time.Time) ([]*sessionMessages, error) {
	return nil, errors.New("read sessions failed")
}

// stubSessionReader returns a fixed session set for persona batch tests.
type stubSessionReader struct {
	sessions []*sessionMessages
}

func (s stubSessionReader) ReadSessionsForDate(agent string, date time.Time) ([]*sessionMessages, error) {
	return s.sessions, nil
}

// TestPersonaBatchReadFailureIsHandled covers the partial-batch error path:
// a session-read failure inside runBatch must be absorbed (logged, not
// panicked) and must not crash the caller.
func TestPersonaBatchReadFailureIsHandled(t *testing.T) {
	ps := &personaService{
		summarizer: &personaSummarizer{enabled: true, runAgent: func(context.Context, string, string, string, string) (string, error) {
			t.Fatal("summarizer should not run when the session read failed")
			return "", nil
		}},
		dbReader: failingDateReader{},
	}

	ps.runBatch("opencode", time.Now().AddDate(0, 0, -1))
}

// TestPersonaBatchExtractionFailureIsHandled covers the partial-batch error
// path: an extraction failure inside runBatch must be absorbed and must not
// panic.
func TestPersonaBatchExtractionFailureIsHandled(t *testing.T) {
	ps := &personaService{
		summarizer: &personaSummarizer{enabled: true, runAgent: func(context.Context, string, string, string, string) (string, error) {
			return "", errors.New("extraction failed")
		}},
		dbReader: stubSessionReader{sessions: []*sessionMessages{{Messages: []sessionMessage{{Role: "user", Content: "hello"}}}}},
	}

	ps.runBatch("opencode", time.Now().AddDate(0, 0, -1))
}

// TestPersonaBatchAgentNotFoundIsHandled covers the agent-binary-not-found
// branch: it must not panic and must not be reported as a warn.
func TestPersonaBatchAgentNotFoundIsHandled(t *testing.T) {
	ps := &personaService{
		summarizer: &personaSummarizer{enabled: true, runAgent: func(context.Context, string, string, string, string) (string, error) {
			return "", ErrAgentNotFound
		}},
		dbReader: stubSessionReader{sessions: []*sessionMessages{{Messages: []sessionMessage{{Role: "user", Content: "hello"}}}}},
	}

	ps.runBatch("opencode", time.Now().AddDate(0, 0, -1))
}

// TestPersonaBatchWritesWhenExtractionSucceeds covers the happy path: a
// successful extraction writes PERSONA.md and returns without panicking.
func TestPersonaBatchWritesWhenExtractionSucceeds(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	ps := &personaService{
		summarizer: &personaSummarizer{enabled: true, runAgent: func(context.Context, string, string, string, string) (string, error) {
			return `{"codeStyle":["Prefers Go"],"workflowHabits":[],"domainExpertise":[],"toolPreferences":[],"communicationStyle":[]}`, nil
		}},
		dbReader: stubSessionReader{sessions: []*sessionMessages{{Messages: []sessionMessage{{Role: "user", Content: "hello"}}}}},
	}

	ps.runBatch("opencode", time.Now().AddDate(0, 0, -1))

	personaPath := filepath.Join(home, ".yishan", "memory", "PERSONA.md")
	if _, err := os.Stat(personaPath); err != nil {
		t.Fatalf("expected PERSONA.md to be written: %v", err)
	}
}
