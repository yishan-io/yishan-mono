package memory

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func TestHandleSummarizeResult_UsesDistinctLogsForSkippedAndNoOutput(t *testing.T) {
	service := &Service{}
	req := summarizeRequest{agent: "opencode", worktreePath: "/tmp/workspace"}

	skippedLogs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, SummarizeResult{Skipped: true})
	})
	if strings.Contains(skippedLogs, "session summarization produced no output") {
		t.Fatal("skipped summarization should not log produced no output")
	}
	if !strings.Contains(skippedLogs, "session summarization skipped") {
		t.Fatal("expected skipped summarization log")
	}

	noOutputLogs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, SummarizeResult{})
	})
	if !strings.Contains(noOutputLogs, "session summarization produced no output") {
		t.Fatal("expected no-output log")
	}
}

func TestSummarizeSession_BinaryNotFoundLogsDebugNotWarn(t *testing.T) {
	// RunAgentFunc that returns ErrAgentNotFound (as buildRunAgentFunc does when
	// ResolveCommand cannot locate the binary).
	runAgent := RunAgentFunc(func(_ context.Context, _, _, _, _ string) (string, error) {
		return "", fmt.Errorf("%w: opencode", ErrAgentNotFound)
	})

	svc := &Service{
		summarizer: NewSummarizer(SummarizerConfig{Enabled: true}, runAgent),
	}
	// Inject a fake reader that returns a real session so runAgent is reached.
	svc.summarizer.dbReader = fakeSessionReader2{
		session: &sessionMessages{
			Messages: []sessionMessage{{Role: "user", Content: "hello"}},
		},
	}

	req := summarizeRequest{agent: "opencode", worktreePath: t.TempDir()}

	var debugLogs, warnLogs string
	captureMemoryLogsLevel(t, zerolog.DebugLevel, func() {
		svc.runSummarize(req)
	}, &debugLogs, &warnLogs)

	if strings.Contains(warnLogs, "session summarization failed") {
		t.Error("binary-not-found should not log at warn level")
	}
	if !strings.Contains(debugLogs, "agent binary not installed") {
		t.Errorf("expected debug log 'agent binary not installed', got debug=%q warn=%q", debugLogs, warnLogs)
	}
}

func captureMemoryLogs(t *testing.T, run func()) string {
	t.Helper()
	var buf bytes.Buffer
	previous := log.Logger
	log.Logger = zerolog.New(&buf).With().Timestamp().Logger().Level(zerolog.DebugLevel)
	t.Cleanup(func() {
		log.Logger = previous
	})
	run()
	return buf.String()
}

func captureMemoryLogsLevel(t *testing.T, level zerolog.Level, run func(), debugOut, warnOut *string) {
	t.Helper()
	var debugBuf, warnBuf bytes.Buffer
	previous := log.Logger
	log.Logger = zerolog.New(zerolog.MultiLevelWriter(
		zerolog.LevelWriterAdapter{Writer: levelFilter{w: &debugBuf, minLevel: zerolog.DebugLevel, maxLevel: zerolog.DebugLevel}},
		zerolog.LevelWriterAdapter{Writer: levelFilter{w: &warnBuf, minLevel: zerolog.WarnLevel, maxLevel: zerolog.WarnLevel}},
	)).With().Timestamp().Logger().Level(level)
	t.Cleanup(func() {
		log.Logger = previous
	})
	run()
	*debugOut = debugBuf.String()
	*warnOut = warnBuf.String()
}

// levelFilter passes only log entries whose level falls within [minLevel, maxLevel].
type levelFilter struct {
	w        *bytes.Buffer
	minLevel zerolog.Level
	maxLevel zerolog.Level
}

func (f levelFilter) Write(p []byte) (int, error) {
	return f.w.Write(p)
}

func (f levelFilter) WriteLevel(l zerolog.Level, p []byte) (int, error) {
	if l < f.minLevel || l > f.maxLevel {
		return len(p), nil
	}
	return f.w.Write(p)
}

type fakeSessionReader2 struct {
	session *sessionMessages
	err     error
}

func (r fakeSessionReader2) ReadRecentSession(_ string, _ string) (*sessionMessages, error) {
	if r.err != nil {
		return nil, r.err
	}
	return r.session, nil
}

// ── personaService.maybeRunBatch ─────────────────────────────────────────────

func TestPersonaService_MaybeRunBatch_DateGate(t *testing.T) {
	// personaService should only trigger extraction once per calendar day.
	// Verify the date-gate: after advancing past today's date, lastExtractionDate updates.
	ps := &personaService{
		summarizer:         &PersonaSummarizer{enabled: false}, // disabled — no LLM calls
		dbReader:           newAgentDBReader(),
		lastExtractionDate: "2026-06-18", // simulate last run was yesterday
	}

	// maybeRunBatch with a past date: the gate should advance to today.
	ps.maybeRunBatch("opencode")
	today := time.Now().UTC().Format("2006-01-02")
	if ps.lastExtractionDate != today {
		t.Errorf("lastExtractionDate should advance to today (%q), got %q", today, ps.lastExtractionDate)
	}

	// A second call on the same day must be a no-op (date already matches today).
	// We verify it doesn't reset the date or panic.
	ps.maybeRunBatch("opencode")
	if ps.lastExtractionDate != today {
		t.Errorf("second call should not change lastExtractionDate, got %q", ps.lastExtractionDate)
	}
}

func TestPersonaService_MaybeRunBatch_NoPanicWhenDisabled(t *testing.T) {
	ps := &personaService{
		summarizer: &PersonaSummarizer{enabled: false, runAgent: nil},
		dbReader:   newAgentDBReader(),
	}
	// Should not panic even with nil runAgent.
	ps.maybeRunBatch("opencode")
}

func TestService_MaybeRunDailyPersonaBatch_NilPersona(t *testing.T) {
	svc := &Service{persona: nil}
	// Must not panic when persona is nil.
	svc.MaybeRunDailyPersonaBatch("opencode")
}

func TestService_ProjectMemoryEnabledFalseWhenDisabledByPolicy(t *testing.T) {
	svc := &Service{
		config:     SummarizerConfig{Enabled: true, DisableProjectMemory: true},
		summarizer: NewSummarizer(SummarizerConfig{Enabled: true}, nil),
	}

	if svc.ProjectMemoryEnabled() {
		t.Fatal("expected project memory to be disabled by policy")
	}
	if svc.SummarizerEnabled() {
		t.Fatal("expected summarizer enabled status to follow project memory policy")
	}
}

func TestService_PersonaEnabledFalseWhenDisabledByPolicy(t *testing.T) {
	svc := &Service{
		config: SummarizerConfig{Enabled: true, DisablePersona: true},
		persona: &personaService{
			summarizer: &PersonaSummarizer{enabled: true, runAgent: RunAgentFunc(func(_ context.Context, _, _, _, _ string) (string, error) {
				return "", nil
			})},
		},
	}

	if svc.PersonaEnabled() {
		t.Fatal("expected persona to be disabled by policy")
	}
	// Must remain a no-op when persona is policy-disabled.
	svc.MaybeRunDailyPersonaBatch("opencode")
}
