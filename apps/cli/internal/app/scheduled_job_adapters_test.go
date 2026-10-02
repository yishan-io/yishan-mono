package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud"
	"yishan/apps/cli/internal/adapter/sqlite"
	nodesystem "yishan/apps/cli/internal/node/system"
)

func TestScheduledJobCloudAdapters_MapsReconcileClaimStartAndComplete(t *testing.T) {
	const expectedTime = "2026-02-03T02:05:06.123Z"
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode %s: %v", request.URL.Path, err)
		}
		switch request.URL.Path {
		case "/nodes/node-1/scheduled-jobs/reconcile":
			assertAdapterBody(t, body, "protectedJobs")
			_, _ = writer.Write([]byte(`{"jobs":[{"id":"job-1","nextRunAt":"2026-02-03T02:05:06.123Z"}]}`))
		case "/nodes/node-1/scheduled-jobs/claim":
			if body["jobId"] != "job-1" || body["expectedNextRunAt"] != expectedTime {
				t.Fatalf("claim body = %#v", body)
			}
			_, _ = writer.Write([]byte(`{"runId":"run-1","scheduledFor":"2026-02-03T02:05:06.123Z","projectPath":"/project","job":{"id":"job-1","agentKind":"pi","prompt":"prompt","model":"model","nextRunAt":"2026-02-03T03:05:06.123Z"}}`))
		case "/nodes/node-1/scheduled-jobs/runs/start":
			if body["runId"] != "run-1" || body["startedAt"] != expectedTime || body["dispatchOrigin"] != nil {
				t.Fatalf("start body = %#v", body)
			}
			_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
		case "/nodes/node-1/scheduled-jobs/runs/complete":
			if body["runId"] != "run-1" || body["status"] != "succeeded" || body["responseBody"] != "complete" || body["finishedAt"] != expectedTime {
				t.Fatalf("complete body = %#v", body)
			}
			_, _ = writer.Write([]byte(`{"ok":true,"accepted":false}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	t.Cleanup(server.Close)

	adapters, err := newScheduledJobCloudAdapters(cloud.NewClient(server.URL, "yst_token", "", "", "", nil), "node-1")
	if err != nil {
		t.Fatalf("new adapters: %v", err)
	}
	nextRunAt := time.Date(2026, 2, 3, 4, 5, 6, 123456789, time.FixedZone("CET", 2*60*60))
	jobs, err := adapters.reconcile(context.Background(), []nodesystem.LocalScheduledJob{{ID: "job-1", NextRunAt: nextRunAt}})
	expectedResponseTime := time.Date(2026, 2, 3, 2, 5, 6, 123000000, time.UTC)
	if err != nil || len(jobs) != 1 || jobs[0].Status != "active" || !jobs[0].NextRunAt.Equal(expectedResponseTime) {
		t.Fatalf("reconcile jobs = %#v, error = %v", jobs, err)
	}
	claim, err := adapters.claim(context.Background(), "job-1", nextRunAt)
	if err != nil || claim.RunID != "run-1" || claim.ProjectPath != "/project" || !claim.NextRunAt.Equal(expectedResponseTime.Add(time.Hour)) {
		t.Fatalf("claim = %#v, error = %v", claim, err)
	}
	row := nodesystem.ScheduledRunOutboxRow{RunID: claim.RunID, Result: nodesystem.ScheduledRunOutboxResult{Status: "succeeded", ResponseBody: "complete"}}
	if err := adapters.start(context.Background(), row, nextRunAt.UTC()); err != nil {
		t.Fatalf("start: %v", err)
	}
	if err := adapters.complete(context.Background(), row, nextRunAt.UTC()); err != nil {
		t.Fatalf("complete: %v", err)
	}
}

func assertAdapterBody(t *testing.T, body map[string]any, key string) {
	t.Helper()
	protected, ok := body[key].([]any)
	if !ok || len(protected) != 1 {
		t.Fatalf("reconcile body = %#v", body)
	}
	entry, ok := protected[0].(map[string]any)
	if !ok || entry["jobId"] != "job-1" || entry["nextRunAt"] != "2026-02-03T02:05:06.123Z" {
		t.Fatalf("protected job = %#v", protected[0])
	}
}

func TestScheduledJobStartContract_DistinguishesFreshExecutionFromRecovery(t *testing.T) {
	t.Run("fresh false records a local rejection without execution", func(t *testing.T) {
		testFreshScheduledJobStart(t, false)
	})
	t.Run("recovery false finalizes the interrupted run", testRecoveryScheduledJobStart)
	t.Run("fresh true executes and completes normally", func(t *testing.T) {
		testFreshScheduledJobStart(t, true)
	})
}

type scheduledJobStartContractServer struct {
	test          *testing.T
	server        *httptest.Server
	startCalls    int
	completeCodes []string
	started       bool
}

func newScheduledJobStartContractServer(t *testing.T, started bool) *scheduledJobStartContractServer {
	t.Helper()
	fixture := &scheduledJobStartContractServer{test: t, started: started}
	fixture.server = httptest.NewServer(http.HandlerFunc(fixture.handle))
	t.Cleanup(fixture.server.Close)
	return fixture
}

func (s *scheduledJobStartContractServer) handle(writer http.ResponseWriter, request *http.Request) {
	switch request.URL.Path {
	case "/nodes/node-1/scheduled-jobs/runs/start":
		s.startCalls++
		_, _ = writer.Write([]byte(`{"ok":true,"started":` + strconv.FormatBool(s.started) + `}`))
	case "/nodes/node-1/scheduled-jobs/runs/complete":
		var input struct {
			ErrorCode string `json:"errorCode"`
		}
		if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
			s.test.Errorf("decode complete request: %v", err)
			return
		}
		s.completeCodes = append(s.completeCodes, input.ErrorCode)
		_, _ = writer.Write([]byte(`{"ok":true,"accepted":true}`))
	default:
		http.NotFound(writer, request)
	}
}

func testFreshScheduledJobStart(t *testing.T, started bool) {
	t.Helper()
	database := openTestDB(t)
	t.Cleanup(func() { _ = database.Close() })
	fixture := newScheduledJobStartContractServer(t, started)
	adapters, err := newScheduledJobCloudAdapters(cloud.NewClient(fixture.server.URL, "yst_token", "", "", "", nil), "node-1")
	if err != nil {
		t.Fatalf("new adapters: %v", err)
	}
	store := scheduledRunOutboxStore{store: sqlite.NewScheduledJobRunOutboxStore(database)}
	agentCalls := 0
	executor, err := nodesystem.NewScheduledJobExecutor(nodesystem.ScheduledJobExecutorOptions{
		Store: store, NodeID: "node-1", Start: freshScheduledJobStart(adapters), Complete: freshScheduledJobComplete(adapters),
		IsStartRejected: isScheduledJobStartRejected, Agent: func(context.Context, nodesystem.LocalSchedulerClaimResult) (nodesystem.ScheduledRunOutboxResult, error) {
			agentCalls++
			return nodesystem.ScheduledRunOutboxResult{Status: "succeeded"}, nil
		},
	})
	if err != nil {
		t.Fatalf("new executor: %v", err)
	}
	claim := nodesystem.LocalSchedulerClaimResult{RunID: "run-1", JobID: "job-1", ScheduledFor: time.Now(), ProjectPath: t.TempDir()}
	if err := executor.Execute(context.Background(), claim); err != nil {
		t.Fatalf("execute: %v", err)
	}
	assertFreshScheduledJobStart(t, store, fixture, agentCalls, started)
}

func freshScheduledJobStart(adapters scheduledJobCloudAdapters) nodesystem.ScheduledJobExecutorStart {
	return func(ctx context.Context, _ string, runID string, startedAt time.Time) error {
		return adapters.startFresh(ctx, nodesystem.ScheduledRunOutboxRow{RunID: runID}, startedAt)
	}
}

func freshScheduledJobComplete(adapters scheduledJobCloudAdapters) nodesystem.ScheduledJobExecutorComplete {
	return func(ctx context.Context, _ string, row nodesystem.ScheduledRunOutboxRow, finishedAt time.Time) error {
		return adapters.complete(ctx, row, finishedAt)
	}
}

func assertFreshScheduledJobStart(t *testing.T, store scheduledRunOutboxStore, fixture *scheduledJobStartContractServer, agentCalls int, started bool) {
	t.Helper()
	rows, err := store.ListUndelivered(context.Background())
	if err != nil || len(rows) != 0 || fixture.startCalls != 1 {
		t.Fatalf("undelivered = %+v, error = %v, starts = %d", rows, err, fixture.startCalls)
	}
	wantAgentCalls, wantCompleteCalls := 0, 0
	if started {
		wantAgentCalls, wantCompleteCalls = 1, 1
	}
	if agentCalls != wantAgentCalls || len(fixture.completeCodes) != wantCompleteCalls {
		t.Fatalf("agent calls = %d, completes = %v", agentCalls, fixture.completeCodes)
	}
}

func testRecoveryScheduledJobStart(t *testing.T) {
	database := openTestDB(t)
	t.Cleanup(func() { _ = database.Close() })
	fixture := newScheduledJobStartContractServer(t, false)
	adapters, err := newScheduledJobCloudAdapters(cloud.NewClient(fixture.server.URL, "yst_token", "", "", "", nil), "node-1")
	if err != nil {
		t.Fatalf("new adapters: %v", err)
	}
	store := scheduledRunOutboxStore{store: sqlite.NewScheduledJobRunOutboxStore(database)}
	saveRecoveryScheduledJobRows(t, store)
	runner, err := nodesystem.NewScheduledRunOutboxRunner(nodesystem.ScheduledRunOutboxRunnerOptions{Store: store, Start: adapters.start, Complete: adapters.complete})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}
	if err := runner.Recover(context.Background()); err != nil {
		t.Fatalf("recover: %v", err)
	}
	assertRecoveryScheduledJobStart(t, store, fixture)
}

func saveRecoveryScheduledJobRows(t *testing.T, store scheduledRunOutboxStore) {
	t.Helper()
	for _, runID := range []string{"claimed", "started"} {
		if _, err := store.SaveClaim(context.Background(), nodesystem.ScheduledRunOutboxRow{RunID: runID, JobID: runID, NodeID: "node-1", ScheduledFor: time.Now()}); err != nil {
			t.Fatalf("save claim %q: %v", runID, err)
		}
	}
	if _, err := store.MarkStarted(context.Background(), "started", time.Now()); err != nil {
		t.Fatalf("mark started: %v", err)
	}
}

func assertRecoveryScheduledJobStart(t *testing.T, store scheduledRunOutboxStore, fixture *scheduledJobStartContractServer) {
	t.Helper()
	rows, err := store.ListUndelivered(context.Background())
	if err != nil || len(rows) != 0 || fixture.startCalls != 2 {
		t.Fatalf("undelivered = %+v, error = %v, starts = %d", rows, err, fixture.startCalls)
	}
	for _, code := range fixture.completeCodes {
		if code != nodesystem.ScheduledRunOutboxDaemonInterruptedCode {
			t.Fatalf("complete codes = %v", fixture.completeCodes)
		}
	}
	if len(fixture.completeCodes) != 2 {
		t.Fatalf("complete codes = %v", fixture.completeCodes)
	}
}

func TestScheduledJobAgent_TruncatesVerboseOutput(t *testing.T) {
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nprintf '" + strings.Repeat("x", scheduledJobResponseBodyMaxLength+1) + "'\nprintf '" + strings.Repeat("y", scheduledJobResponseBodyMaxLength+1) + "' >&2\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")

	result, err := buildScheduledJobAgent("")(context.Background(), nodesystem.LocalSchedulerClaimResult{
		Agent: "pi", Prompt: "prompt", ProjectPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("run scheduled job agent: %v", err)
	}
	if result.Status != "succeeded" || len(result.ResponseBody) > scheduledJobResponseBodyMaxLength {
		t.Fatalf("result = %+v, response body length = %d", result, len(result.ResponseBody))
	}
	if result.ResponseBody != strings.Repeat("x", scheduledJobResponseBodyMaxLength) {
		t.Fatalf("response body was not truncated from combined stdout and stderr")
	}
}

func TestScheduledJobAgent_ReturnsOutputWhenProcessFails(t *testing.T) {
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nprintf 'stdout'\nprintf 'stderr' >&2\nexit 1\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")

	result, err := buildScheduledJobAgent("")(context.Background(), nodesystem.LocalSchedulerClaimResult{
		Agent: "pi", Prompt: "prompt", ProjectPath: t.TempDir(),
	})
	if err == nil {
		t.Fatal("run scheduled job agent error = nil, want process failure")
	}
	if result.ResponseBody != "stdout\nstderr" {
		t.Fatalf("response body = %q", result.ResponseBody)
	}
}

func TestTruncateScheduledJobResponseBody_UsesUTF16CodeUnits(t *testing.T) {
	testCases := []struct {
		name  string
		input string
		want  string
	}{
		{name: "emoji", input: strings.Repeat("😀", 2049), want: strings.Repeat("😀", 2048)},
		{name: "CJK and invalid UTF-8", input: strings.Repeat("界", 4095) + "\xffdiscard", want: strings.Repeat("界", 4095) + "�"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := truncateScheduledJobResponseBody(testCase.input); got != testCase.want {
				t.Fatalf("truncateScheduledJobResponseBody() = %q, want %q", got, testCase.want)
			}
		})
	}
}
