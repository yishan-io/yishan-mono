package memory

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func TestHandleSummarizeResult_UsesDistinctLogsForSkippedAndNoOutput(t *testing.T) {
	service := &Service{}
	req := summarizeRequest{agent: "pi", worktreePath: "/tmp/workspace"}

	skippedLogs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, summarizeResult{Skipped: true, SourceAgent: "pi", SummarizerAgent: "opencode"})
	})
	if strings.Contains(skippedLogs, "session summarization produced no output") {
		t.Fatal("skipped summarization should not log produced no output")
	}
	if !strings.Contains(skippedLogs, "session summarization skipped") {
		t.Fatal("expected skipped summarization log")
	}
	if !strings.Contains(skippedLogs, `"sourceAgent":"pi"`) || !strings.Contains(skippedLogs, `"summarizerAgent":"opencode"`) {
		t.Fatalf("expected skipped log to include source and summarizer agents, got %q", skippedLogs)
	}

	noOutputLogs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, summarizeResult{SourceAgent: "pi", SummarizerAgent: "opencode"})
	})
	if !strings.Contains(noOutputLogs, "session summarization produced no output") {
		t.Fatal("expected no-output log")
	}
	if !strings.Contains(noOutputLogs, `"sourceAgent":"pi"`) || !strings.Contains(noOutputLogs, `"summarizerAgent":"opencode"`) {
		t.Fatalf("expected no-output log to include source and summarizer agents, got %q", noOutputLogs)
	}
}

func TestHandleSummarizeResult_SuccessLogIncludesSourceAndSummarizerAgents(t *testing.T) {
	worktreePath := t.TempDir()
	contextRoot := filepath.Join(worktreePath, myContextDir)
	memoryPath := filepath.Join(contextRoot, "MEMORY.md")
	if err := os.MkdirAll(contextRoot, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(memoryPath, []byte("# Project Memory\n"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	service := &Service{db: openTestDB(t)}
	req := summarizeRequest{agent: "pi", worktreePath: worktreePath, projectID: "proj-1"}
	logs := captureMemoryLogs(t, func() {
		service.handleSummarizeResult(req, summarizeResult{
			WrittenPaths:    []string{memoryPath},
			SourceAgent:     "pi",
			SummarizerAgent: "opencode",
		})
	})

	if !strings.Contains(logs, "session summarized") {
		t.Fatalf("expected success log, got %q", logs)
	}
	if !strings.Contains(logs, `"sourceAgent":"pi"`) || !strings.Contains(logs, `"summarizerAgent":"opencode"`) {
		t.Fatalf("expected success log to include source and summarizer agents, got %q", logs)
	}
}

func TestSummarizeSession_BinaryNotFoundLogsDebugNotWarn(t *testing.T) {
	// RunAgentFunc that returns ErrAgentNotFound (as buildRunAgentFunc does when
	// ResolveCommand cannot locate the binary).
	runAgent := RunAgentFunc(func(_ context.Context, _, _, _, _ string) (string, error) {
		return "", fmt.Errorf("%w: %s", ErrAgentNotFound, builtInSummarizerAgentKind)
	})

	svc := &Service{
		summarizer: newSummarizer(SummarizerConfig{Enabled: true, AgentKind: "opencode"}, runAgent),
	}
	// Inject a fake reader that returns a real session so runAgent is reached.
	svc.summarizer.dbReader = fakeSessionReader2{
		session: &sessionMessages{
			Messages: []sessionMessage{{Role: "user", Content: "hello"}},
		},
	}

	req := summarizeRequest{agent: "pi", worktreePath: t.TempDir()}

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
	if !strings.Contains(debugLogs, `"sourceAgent":"pi"`) || !strings.Contains(debugLogs, `"summarizerAgent":"pi"`) {
		t.Errorf("expected debug log to include source and summarizer agents, got %q", debugLogs)
	}
}

func TestRunSummarize_FailureLogIncludesSourceAndSummarizerAgents(t *testing.T) {
	runAgent := RunAgentFunc(func(_ context.Context, _, _, _, _ string) (string, error) {
		return "", errors.New("stderr: authentication failed")
	})

	svc := &Service{
		summarizer: newSummarizer(SummarizerConfig{Enabled: true, AgentKind: "opencode"}, runAgent),
	}
	svc.summarizer.dbReader = fakeSessionReader2{
		session: &sessionMessages{
			Messages: []sessionMessage{{Role: "user", Content: "hello"}},
		},
	}

	warnLogs := captureMemoryLogs(t, func() {
		svc.runSummarize(summarizeRequest{agent: "pi", worktreePath: t.TempDir()})
	})

	if !strings.Contains(warnLogs, "session summarization failed") {
		t.Fatalf("expected failure log, got %q", warnLogs)
	}
	if !strings.Contains(warnLogs, `"sourceAgent":"pi"`) {
		t.Fatalf("expected source agent field, got %q", warnLogs)
	}
	if !strings.Contains(warnLogs, `"summarizerAgent":"pi"`) {
		t.Fatalf("expected summarizer agent field, got %q", warnLogs)
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
		summarizer:         &personaSummarizer{enabled: false}, // disabled — no LLM calls
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
		summarizer: &personaSummarizer{enabled: false, runAgent: nil},
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
		summarizer: newSummarizer(SummarizerConfig{Enabled: true}, nil),
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
			summarizer: &personaSummarizer{enabled: true, runAgent: RunAgentFunc(func(_ context.Context, _, _, _, _ string) (string, error) {
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

func TestService_UpdateSummarizerConfigForcesPiAgent(t *testing.T) {
	svc := &Service{}

	svc.UpdateSummarizerConfig(SummarizerConfig{
		Enabled:   true,
		AgentKind: "opencode",
		Model:     "gpt-5",
	})

	cfg := svc.GetConfig()
	if cfg.AgentKind != builtInSummarizerAgentKind {
		t.Fatalf("AgentKind = %q, want %q", cfg.AgentKind, builtInSummarizerAgentKind)
	}
	if cfg.Model != "" {
		t.Fatalf("Model = %q, want empty model after legacy non-Pi normalization", cfg.Model)
	}

	svc.UpdateSummarizerConfig(SummarizerConfig{
		Enabled:   true,
		AgentKind: builtInSummarizerAgentKind,
		Model:     "openai/gpt-5",
	})

	cfg = svc.GetConfig()
	if cfg.Model != "openai/gpt-5" {
		t.Fatalf("Model = %q, want %q", cfg.Model, "openai/gpt-5")
	}
}

// ── shouldIndexPath ───────────────────────────────────────────────────────────

// TestShouldIndexPath documents the invariant: shouldIndexPath only accepts
// canonical (symlink-resolved) paths. Worktree paths that contain a .my-context
// symlink are NOT matched — the resolution burden sits with the caller
// (forwardMemoryFileChanges in jsonrpc_handler.go).
func TestShouldIndexPath(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		// Canonical contexts path → accepted.
		{"/Users/user/.yishan/contexts/my-repo/MEMORY.md", true},
		{"/Users/user/.yishan/contexts/my-repo/tasks/t01/notes.md", true},
		// Nested .my-context duplicate under a context root → rejected.
		{"/Users/user/.yishan/contexts/my-repo/.my-context/MEMORY.md", false},
		{"/Users/user/.yishan/contexts/my-repo/.my-context/.my-context/MEMORY.md", false},
		// Global memory path → accepted.
		{"/Users/user/.yishan/memory/global/MEMORY.md", true},
		// Nested .my-context under global memory → rejected.
		{"/Users/user/.yishan/memory/global/.my-context/MEMORY.md", false},
		// Unresolved worktree symlink path → rejected (caller must resolve first).
		{"/Users/user/.yishan/worktrees/my-repo/ws/.my-context/MEMORY.md", false},
		// Canonical context root nested duplicate → still rejected (regression).
		{"/Users/user/.yishan/contexts/my-repo/.my-context/architecture/notes.md", false},
		// Project-root real .my-context (non-git project) → accepted.
		{"/Users/user/code/plain-project/.my-context/MEMORY.md", true},
		{"/Users/user/code/plain-project/.my-context/architecture/notes.md", true},
		// Nested .my-context inside a project-root real dir → rejected.
		{"/Users/user/code/plain-project/.my-context/.my-context/MEMORY.md", false},
		// Non-markdown file → rejected.
		{"/Users/user/.yishan/contexts/my-repo/state.json", false},
		// Unrelated path → rejected.
		{"/Users/user/code/project/README.md", false},
	}
	for _, tc := range cases {
		got := shouldIndexPath(tc.path)
		if got != tc.want {
			t.Errorf("shouldIndexPath(%q) = %v; want %v", tc.path, got, tc.want)
		}
	}
}

func TestService_WatcherIncrementalFilteringUsesManagedTaskRoots(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	contextRoot := filepath.Join(worktree, myContextDir)
	taskRoot := filepath.Join(contextRoot, taskContextDirectory, "task-1")
	nestedPath := filepath.Join(contextRoot, architectureDir, taskContextDirectory, "design.md")
	managedPlan := filepath.Join(taskRoot, "plan.md")
	managedMetadata := filepath.Join(taskRoot, "task.md")
	for path, body := range map[string]string{nestedPath: "nested watcher design", managedPlan: "managed plan", managedMetadata: "metadata"} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	service := &Service{db: db, taskContexts: make(map[string]TaskContextRef)}
	service.registerTaskContexts([]TaskContextRef{{Directory: taskRoot, TaskID: "task-1", ProjectID: "project-1"}})
	if !service.ShouldIndex(nestedPath) || !service.ShouldIndex(managedPlan) || service.ShouldIndex(managedMetadata) {
		t.Fatal("watcher filtering did not distinguish nested directories from the managed root")
	}
	if err := service.OnFileChanged(nestedPath, worktree, "project-1"); err != nil {
		t.Fatal(err)
	}
	if err := service.OnFileChanged(managedPlan, worktree, "project-1"); err != nil {
		t.Fatal(err)
	}
	assertIndexed(t, db, nestedPath, true)
	canonicalPlan, err := filepath.EvalSymlinks(managedPlan)
	if err != nil {
		t.Fatal(err)
	}
	assertIndexed(t, db, canonicalPlan, true)
	assertIndexed(t, db, managedMetadata, false)
}

func TestService_IncrementalWatcherSkipsOrphanTopLevelTaskContext(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	contextRoot := filepath.Join(worktree, myContextDir)
	orphanRoot := filepath.Join(contextRoot, taskContextDirectory, "orphan-task")
	nestedPath := filepath.Join(contextRoot, architectureDir, taskContextDirectory, "design.md")
	paths := []string{
		filepath.Join(orphanRoot, "plan.md"),
		filepath.Join(orphanRoot, "task.md"),
		filepath.Join(orphanRoot, "research", "detail.md"),
	}
	for _, path := range append(paths, nestedPath) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("incremental orphan phrase"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	service := &Service{db: db, taskContexts: make(map[string]TaskContextRef)}
	for _, path := range append(paths, nestedPath) {
		if err := service.OnFileChanged(path, worktree, "project-1"); err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range paths {
		assertIndexed(t, db, path, false)
	}
	assertIndexed(t, db, nestedPath, true)
}

func TestService_OnFileDeletedRemovesManagedTaskContextThroughSymlink(t *testing.T) {
	db := openTestDB(t)
	canonicalRoot := t.TempDir()
	taskRoot := filepath.Join(canonicalRoot, taskContextDirectory, "task-delete")
	if err := os.MkdirAll(taskRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	canonicalPlan := filepath.Join(taskRoot, "plan.md")
	if err := os.WriteFile(canonicalPlan, []byte("delete attributed plan"), 0o644); err != nil {
		t.Fatal(err)
	}
	worktree := t.TempDir()
	if err := os.Symlink(canonicalRoot, filepath.Join(worktree, myContextDir)); err != nil {
		t.Fatal(err)
	}
	symlinkPlan := filepath.Join(worktree, myContextDir, taskContextDirectory, "task-delete", "plan.md")
	service := &Service{db: db, taskContexts: make(map[string]TaskContextRef)}
	service.registerTaskContexts([]TaskContextRef{{Directory: taskRoot, TaskID: "task-delete", ProjectID: "project-1"}})
	if err := service.OnFileChanged(symlinkPlan, worktree, "project-1"); err != nil {
		t.Fatal(err)
	}
	indexedPlan, err := filepath.EvalSymlinks(canonicalPlan)
	if err != nil {
		t.Fatal(err)
	}
	assertIndexed(t, db, indexedPlan, true)
	if err := os.Remove(symlinkPlan); err != nil {
		t.Fatal(err)
	}
	if err := service.OnFileDeleted(symlinkPlan); err != nil {
		t.Fatal(err)
	}
	assertIndexed(t, db, indexedPlan, false)
}
