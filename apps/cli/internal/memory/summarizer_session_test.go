package memory

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSummarizeSession_SkipsWhenReaderFails(t *testing.T) {
	summarizer := NewSummarizer(SummarizerConfig{Enabled: true}, func(context.Context, string, string, string, string) (string, error) {
		t.Fatal("runAgent should not be called when reader fails")
		return "", nil
	})
	summarizer.dbReader = fakeSessionReader{err: errors.New("boom")}

	result, err := summarizer.SummarizeSession("opencode", t.TempDir())
	if err != nil {
		t.Fatalf("SummarizeSession: %v", err)
	}
	if !result.Skipped {
		t.Fatal("expected skipped result")
	}
	if len(result.WrittenPaths) != 0 {
		t.Fatalf("expected no written paths, got %v", result.WrittenPaths)
	}
}

func TestSummarizeSession_BuildsConversationAndWritesMemory(t *testing.T) {
	workspacePath := t.TempDir()
	contextRoot := filepath.Join(workspacePath, myContextDir)
	memoryPath := filepath.Join(contextRoot, "MEMORY.md")
	var prompt string

	summarizer := NewSummarizer(SummarizerConfig{Enabled: true}, func(_ context.Context, agentKind string, model string, gotPrompt string, workDir string) (string, error) {
		prompt = gotPrompt
		if agentKind != "opencode" {
			t.Fatalf("unexpected agent kind: %q", agentKind)
		}
		return `{"lockedDecisions":["2026-06-16 — Fixed reader. Why: reader was broken."],"durableDiscoveries":["[Workflow Trap] 2026-06-16 — Summarizer writes MEMORY.md on normal runs"],"openQuestions":[]}`,
			nil
	})
	summarizer.dbReader = fakeSessionReader{session: &sessionMessages{Messages: []sessionMessage{{Role: "user", Content: "hello", Timestamp: time.UnixMilli(1000)}, {Role: "assistant", Content: "world", Timestamp: time.UnixMilli(2000)}}}}

	result, err := summarizer.SummarizeSession("opencode", workspacePath)
	if err != nil {
		t.Fatalf("SummarizeSession: %v", err)
	}
	if result.Skipped {
		t.Fatal("expected summarize run, got skipped")
	}
	if len(result.WrittenPaths) == 0 || result.WrittenPaths[0] != memoryPath {
		t.Fatalf("unexpected written paths: %v", result.WrittenPaths)
	}
	if !strings.Contains(prompt, "**user**: hello") || !strings.Contains(prompt, "**assistant**: world") {
		t.Fatalf("prompt missing conversation text: %q", prompt)
	}
	if !strings.Contains(prompt, "lockedDecisions") || !strings.Contains(prompt, "durableDiscoveries") {
		t.Fatalf("prompt missing durable-memory schema: %q", prompt)
	}
}

type fakeSessionReader struct {
	session *sessionMessages
	err     error
}

func (r fakeSessionReader) ReadRecentSession(_ string, _ string) (*sessionMessages, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.session, nil
}
