package memory

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSummarizeSession_SkipsWhenReaderFails(t *testing.T) {
	summarizer := newSummarizer(SummarizerConfig{Enabled: true}, func(context.Context, string, string, string, string) (string, error) {
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

	summarizer := newSummarizer(SummarizerConfig{Enabled: true, AgentKind: "opencode"}, func(_ context.Context, agentKind string, model string, gotPrompt string, workDir string) (string, error) {
		prompt = gotPrompt
		if agentKind != builtInSummarizerAgentKind {
			t.Fatalf("unexpected agent kind: %q", agentKind)
		}
		return `{"lockedDecisions":["2026-06-16 — Fixed reader. Why: reader was broken."],"durableDiscoveries":["[Workflow Trap] 2026-06-16 — summarizer writes MEMORY.md on normal runs"],"openQuestions":[]}`,
			nil
	})
	summarizer.dbReader = fakeSessionReader{session: &sessionMessages{Messages: []sessionMessage{{Role: "user", Content: "hello", Timestamp: time.UnixMilli(1000)}, {Role: "assistant", Content: "world", Timestamp: time.UnixMilli(2000)}}}}

	result, err := summarizer.SummarizeSession("pi", workspacePath)
	if err != nil {
		t.Fatalf("SummarizeSession: %v", err)
	}
	if result.Skipped {
		t.Fatal("expected summarize run, got skipped")
	}
	if result.SourceAgent != "pi" {
		t.Fatalf("expected source agent pi, got %q", result.SourceAgent)
	}
	if result.SummarizerAgent != builtInSummarizerAgentKind {
		t.Fatalf("expected summarizer agent %q, got %q", builtInSummarizerAgentKind, result.SummarizerAgent)
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

func TestSummarizeSession_UsesPiWhenNoAgentOverrideConfigured(t *testing.T) {
	workspacePath := t.TempDir()
	var gotAgentKind string

	summarizer := newSummarizer(SummarizerConfig{Enabled: true}, func(_ context.Context, agentKind string, model string, gotPrompt string, workDir string) (string, error) {
		gotAgentKind = agentKind
		return `{"lockedDecisions":["2026-08-03 — Summaries always run with Pi. Why: Pi is built in."],"durableDiscoveries":[],"openQuestions":[]}`,
			nil
	})
	summarizer.dbReader = fakeSessionReader{session: &sessionMessages{Messages: []sessionMessage{{Role: "user", Content: "hello", Timestamp: time.UnixMilli(1000)}}}}

	result, err := summarizer.SummarizeSession("opencode", workspacePath)
	if err != nil {
		t.Fatalf("SummarizeSession: %v", err)
	}
	if result.Skipped {
		t.Fatal("expected summarize run, got skipped")
	}
	if gotAgentKind != builtInSummarizerAgentKind {
		t.Fatalf("expected summarize run to use %q, got %q", builtInSummarizerAgentKind, gotAgentKind)
	}
	if result.SummarizerAgent != builtInSummarizerAgentKind {
		t.Fatalf("expected result summarizer agent %q, got %q", builtInSummarizerAgentKind, result.SummarizerAgent)
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

func TestSummarizeSession_WorktreeGone(t *testing.T) {
	workspacePath := t.TempDir()
	if err := os.RemoveAll(workspacePath); err != nil {
		t.Fatalf("RemoveAll: %v", err)
	}

	var gotWorkDir string
	summarizer := newSummarizer(SummarizerConfig{Enabled: true}, func(_ context.Context, _ string, _ string, _ string, workDir string) (string, error) {
		gotWorkDir = workDir
		return `{"lockedDecisions":["2026-06-23 — Worktree gone. Why: test."],"durableDiscoveries":[],"openQuestions":[]}`, nil
	})
	summarizer.dbReader = fakeSessionReader{session: &sessionMessages{Messages: []sessionMessage{
		{Role: "user", Content: "hello", Timestamp: time.UnixMilli(1000)},
	}}}

	result, err := summarizer.SummarizeSession("opencode", workspacePath)
	if err != nil {
		t.Fatalf("SummarizeSession: %v", err)
	}
	if result.Skipped {
		t.Fatal("expected summarize run, got skipped")
	}
	if gotWorkDir != "" {
		t.Fatalf("expected empty workDir when worktree gone, got %q", gotWorkDir)
	}
}
