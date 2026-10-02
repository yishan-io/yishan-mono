package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	nodesystem "yishan/apps/cli/internal/node/system"
	"yishan/apps/cli/internal/platform/config"
)

func TestDisabledScheduledJobs_RequestBeforeStartDoesNotInvokeScheduler(t *testing.T) {
	database := openTestDB(t)
	defer database.Close()

	runtime, err := newDisabledScheduledJobs(database)
	if err != nil {
		t.Fatalf("newDisabledScheduledJobs: %v", err)
	}

	// Relay callbacks can be installed before the runtime starts, but must not
	// construct the scheduler or invoke its snapshot callback yet.
	runtime.RequestRefresh(context.Background())
	if runtime.scheduler != nil {
		t.Fatal("RequestRefresh constructed scheduler before Start")
	}
	if len(runtime.refreshRequests) != 0 {
		t.Fatal("RequestRefresh queued work before Start")
	}

	if err := runtime.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if runtime.scheduler == nil {
		t.Fatal("Start did not construct scheduler")
	}

	// Relay reconnect and schedule invalidation share the same non-blocking,
	// bounded refresh request path. The disabled snapshot never claims a run.
	runtime.RequestRefresh(context.Background())
	runtime.RequestRefresh(context.Background())

	runtime.Close()
	select {
	case <-runtime.ctx.Done():
	default:
		t.Fatal("Close did not cancel scheduled-job refreshes")
	}
	runtime.RequestRefresh(context.Background())

	rows, err := runtime.outbox.ListUndelivered(context.Background())
	if err != nil {
		t.Fatalf("ListUndelivered: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("disabled runtime wrote %d outbox rows", len(rows))
	}
}

type blockedRecoveryServer struct {
	server         *httptest.Server
	startEntered   chan struct{}
	releaseStart   chan struct{}
	reconcileCalls atomic.Int32
}

func newBlockedRecoveryServer(t *testing.T) *blockedRecoveryServer {
	t.Helper()
	blocked := &blockedRecoveryServer{startEntered: make(chan struct{}), releaseStart: make(chan struct{})}
	blocked.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/nodes/node-1/scheduled-jobs/runs/start":
			close(blocked.startEntered)
			select {
			case <-blocked.releaseStart:
			case <-request.Context().Done():
			}
		case "/nodes/node-1/scheduled-jobs/runs/complete":
		case "/nodes/node-1/scheduled-jobs/reconcile":
			blocked.reconcileCalls.Add(1)
			_, _ = writer.Write([]byte(`{"jobs":[]}`))
			return
		default:
			t.Fatalf("unexpected request: %s", request.URL.Path)
		}
		_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
	}))
	return blocked
}

func TestScheduledJobs_StartWaitsForRecoveryBeforeScheduling(t *testing.T) {
	blocked := newBlockedRecoveryServer(t)
	defer blocked.server.Close()
	database := openTestDB(t)
	defer database.Close()
	runtime, err := newScheduledJobs(database, session.New(&config.Config{API: config.APIConfig{BaseURL: blocked.server.URL, Token: "yst_token"}}), "node-1", "")
	if err != nil {
		t.Fatalf("newScheduledJobs: %v", err)
	}
	claim := sqlite.ScheduledJobRunOutboxClaim{RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: time.Now()}
	if _, err := runtime.outbox.SaveClaim(context.Background(), claim); err != nil {
		t.Fatalf("SaveClaim: %v", err)
	}
	if err := runtime.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	awaitSignal(t, blocked.startEntered, "recovery did not begin")
	runtime.RequestRefresh(context.Background())
	if blocked.reconcileCalls.Load() != 0 {
		t.Fatal("refresh reconciled while recovery was blocked")
	}
	close(blocked.releaseStart)
	waitForScheduledJobsState(t, runtime, scheduledJobsEnabled)
	runtime.Close()
}

func waitForScheduledJobsState(t *testing.T, runtime *scheduledJobsRuntime, want scheduledJobsState) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		runtime.lifecycleMu.Lock()
		state := runtime.state
		runtime.lifecycleMu.Unlock()
		if state == want {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("scheduled jobs state = %d, want %d", state, want)
		case <-time.After(time.Millisecond):
		}
	}
}

func TestBootstrap_ScheduledJobRecoveryRejectsStaleRunWithoutBlockingOtherRuns(t *testing.T) {
	const rejectedRunID = "rejected-run"
	const unrelatedRunID = "unrelated-run"
	const startRejectedCode = "SCHEDULED_JOB_RUN_TRANSITION_UNAVAILABLE"

	var calls struct {
		sync.Mutex
		starts    []string
		completes []string
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		var payload struct {
			RunID string `json:"runId"`
		}
		if request.URL.Path == "/nodes/node-1/scheduled-jobs/runs/start" || request.URL.Path == "/nodes/node-1/scheduled-jobs/runs/complete" {
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Errorf("decode %s payload: %v", request.URL.Path, err)
				return
			}
		}
		calls.Lock()
		defer calls.Unlock()
		switch request.URL.Path {
		case "/nodes/node-1/scheduled-jobs/runs/start":
			calls.starts = append(calls.starts, payload.RunID)
			if payload.RunID == rejectedRunID {
				writer.WriteHeader(http.StatusConflict)
				_, _ = writer.Write([]byte(`{"code":"` + startRejectedCode + `"}`))
				return
			}
		case "/nodes/node-1/scheduled-jobs/runs/complete":
			calls.completes = append(calls.completes, payload.RunID)
		case "/nodes/node-1/scheduled-jobs/reconcile":
			_, _ = writer.Write([]byte(`{"jobs":[]}`))
			return
		default:
			t.Errorf("unexpected request: %s", request.URL.Path)
			return
		}
		_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
	}))
	defer server.Close()

	database := openTestDB(t)
	outbox := sqlite.NewScheduledJobRunOutboxStore(database)
	for _, runID := range []string{rejectedRunID, unrelatedRunID} {
		if _, err := outbox.SaveClaim(context.Background(), sqlite.ScheduledJobRunOutboxClaim{
			RunID: runID, JobID: runID + "-job", NodeID: "node-1", ScheduledFor: time.Now().UTC(),
		}); err != nil {
			t.Fatalf("SaveClaim(%s): %v", runID, err)
		}
	}
	application, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(),
		Session:    session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "yst_token"}}),
		TokenUsage: newRecordingTokenUsage(database),
	})
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	defer application.Close()

	waitForScheduledJobsState(t, application.scheduledJobs, scheduledJobsEnabled)
	rows, err := outbox.ListUndelivered(context.Background())
	if err != nil {
		t.Fatalf("ListUndelivered: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("undelivered rows = %+v", rows)
	}
	calls.Lock()
	defer calls.Unlock()
	if got, want := calls.starts, []string{rejectedRunID, unrelatedRunID}; !slices.Equal(got, want) {
		t.Fatalf("start calls = %v, want %v", got, want)
	}
	if got, want := calls.completes, []string{unrelatedRunID}; !slices.Equal(got, want) {
		t.Fatalf("complete calls = %v, want %v", got, want)
	}
}

func TestScheduledJobs_CloseCancelsBlockedRecovery(t *testing.T) {
	reconcileEntered := make(chan struct{})
	releaseRequest := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/nodes/node-1/scheduled-jobs/reconcile" {
			t.Fatalf("unexpected request: %s", request.URL.Path)
		}
		close(reconcileEntered)
		<-releaseRequest
	}))
	defer server.Close()
	database := openTestDB(t)
	defer database.Close()
	runtime, err := newScheduledJobs(database, session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "yst_token"}}), "node-1", "")
	if err != nil {
		t.Fatalf("newScheduledJobs: %v", err)
	}
	if err := runtime.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	awaitSignal(t, reconcileEntered, "startup recovery did not call reconcile")
	closed := make(chan struct{})
	go func() {
		runtime.Close()
		close(closed)
	}()
	awaitSignal(t, closed, "Close did not join recovery worker")
	close(releaseRequest)
}

func TestScheduledJobs_CloseJoinsBlockedExecutorBeforeAppClosesDatabase(t *testing.T) {
	database := openTestDB(t)
	runtime, executionStarted, releaseExecution := newBlockedExecutingScheduledJobsRuntime(t)
	application := &App{database: database, scheduledJobs: runtime}
	awaitSignal(t, executionStarted, "scheduled job execution did not begin")

	applicationClosed := make(chan error, 1)
	runtimeClosed := make(chan struct{})
	go func() { applicationClosed <- application.Close() }()
	go func() {
		runtime.Close()
		close(runtimeClosed)
	}()

	assertScheduledJobsCloseBlocked(t, runtimeClosed, "second runtime Close returned before executor stopped")
	assertAppCloseBlocked(t, applicationClosed, "App Close returned before executor stopped")
	if err := database.Ping(); err != nil {
		t.Fatalf("database closed before scheduled job executor stopped: %v", err)
	}

	close(releaseExecution)
	awaitSignal(t, runtimeClosed, "second runtime Close did not return after executor stopped")
	if err := <-applicationClosed; err != nil {
		t.Fatalf("App Close: %v", err)
	}
	if err := database.Ping(); err == nil {
		t.Fatal("App Close did not close database after scheduled job executor stopped")
	}
}

func newBlockedExecutingScheduledJobsRuntime(t *testing.T) (*scheduledJobsRuntime, <-chan struct{}, chan<- struct{}) {
	t.Helper()
	executionStarted := make(chan struct{})
	releaseExecution := make(chan struct{})
	due := time.Now().Add(time.Millisecond)
	scheduler, err := nodesystem.NewLocalScheduler(nodesystem.LocalSchedulerOptions{
		Snapshot: func(context.Context, []nodesystem.LocalScheduledJob) ([]nodesystem.LocalScheduledJob, error) {
			return []nodesystem.LocalScheduledJob{{ID: "job-1", Status: "active", NextRunAt: due}}, nil
		},
		Claim: func(context.Context, string, time.Time) (nodesystem.LocalSchedulerClaimResult, error) {
			return nodesystem.LocalSchedulerClaimResult{JobID: "job-1", RunID: "run-1", ScheduledFor: due}, nil
		},
		Execute: func(context.Context, nodesystem.LocalSchedulerClaimResult) {
			close(executionStarted)
			<-releaseExecution
		},
	})
	if err != nil {
		t.Fatalf("NewLocalScheduler: %v", err)
	}
	if err := scheduler.Start(); err != nil {
		t.Fatalf("scheduler.Start: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &scheduledJobsRuntime{scheduler: scheduler, ctx: ctx, cancel: cancel, closeDone: make(chan struct{})}, executionStarted, releaseExecution
}

func assertScheduledJobsCloseBlocked(t *testing.T, closed <-chan struct{}, message string) {
	t.Helper()
	select {
	case <-closed:
		t.Fatal(message)
	case <-time.After(20 * time.Millisecond):
	}
}

func assertAppCloseBlocked(t *testing.T, closed <-chan error, message string) {
	t.Helper()
	select {
	case err := <-closed:
		t.Fatalf("%s: %v", message, err)
	case <-time.After(20 * time.Millisecond):
	}
}

type scheduledJobsOutboxRetryCase struct {
	name       string
	state      sqlite.ScheduledJobRunOutboxState
	wantStarts int32
}

type scheduledJobsOutboxRetryServer struct {
	server         *httptest.Server
	starts         atomic.Int32
	completes      atomic.Int32
	callsMu        sync.Mutex
	completionCode string
}

func TestScheduledJobs_LiveOutboxRetriesTransientDelivery(t *testing.T) {
	tests := []scheduledJobsOutboxRetryCase{
		{name: "complete", state: sqlite.ScheduledJobRunOutboxStateFinished},
		{name: "start", state: sqlite.ScheduledJobRunOutboxStateClaimed, wantStarts: 2},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) { runScheduledJobsOutboxRetry(t, testCase) })
	}
}

func runScheduledJobsOutboxRetry(t *testing.T, testCase scheduledJobsOutboxRetryCase) {
	t.Helper()
	retryServer := newScheduledJobsOutboxRetryServer(t)
	defer retryServer.server.Close()
	database := openTestDB(t)
	defer database.Close()
	runtime := startScheduledJobsOutboxRuntime(t, database, retryServer.server.URL)
	defer runtime.Close()
	claim := sqlite.ScheduledJobRunOutboxClaim{RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: time.Now()}
	if _, err := runtime.outbox.SaveClaim(context.Background(), claim); err != nil {
		t.Fatalf("SaveClaim: %v", err)
	}
	if testCase.state == sqlite.ScheduledJobRunOutboxStateFinished {
		if _, err := runtime.outbox.SaveResult(context.Background(), claim.RunID, sqlite.ScheduledJobRunOutboxResult{Status: "succeeded"}, time.Now()); err != nil {
			t.Fatalf("SaveResult: %v", err)
		}
	}
	runtime.RequestRefresh(context.Background())
	awaitScheduledJobs(t, func() bool { rows, _ := runtime.outbox.ListUndelivered(context.Background()); return len(rows) == 0 })
	assertScheduledJobsOutboxRetries(t, retryServer, testCase.wantStarts)
}

func newScheduledJobsOutboxRetryServer(t *testing.T) *scheduledJobsOutboxRetryServer {
	t.Helper()
	retryServer := &scheduledJobsOutboxRetryServer{}
	retryServer.server = httptest.NewServer(http.HandlerFunc(retryServer.handle))
	return retryServer
}

func (s *scheduledJobsOutboxRetryServer) handle(writer http.ResponseWriter, request *http.Request) {
	switch request.URL.Path {
	case "/nodes/node-1/scheduled-jobs/reconcile":
		_, _ = writer.Write([]byte(`{"jobs":[]}`))
	case "/nodes/node-1/scheduled-jobs/runs/start":
		if s.starts.Add(1) == 1 {
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
	case "/nodes/node-1/scheduled-jobs/runs/complete":
		var payload struct {
			ErrorCode string `json:"errorCode"`
		}
		_ = json.NewDecoder(request.Body).Decode(&payload)
		s.callsMu.Lock()
		s.completionCode = payload.ErrorCode
		s.callsMu.Unlock()
		if s.completes.Add(1) == 1 {
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
	}
}

func startScheduledJobsOutboxRuntime(t *testing.T, database *sql.DB, baseURL string) *scheduledJobsRuntime {
	t.Helper()
	runtime, err := newScheduledJobs(database, session.New(&config.Config{API: config.APIConfig{BaseURL: baseURL, Token: "yst_token"}}), "node-1", "")
	if err != nil {
		t.Fatalf("newScheduledJobs: %v", err)
	}
	if err := runtime.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitForScheduledJobsState(t, runtime, scheduledJobsEnabled)
	return runtime
}

func assertScheduledJobsOutboxRetries(t *testing.T, retryServer *scheduledJobsOutboxRetryServer, wantStarts int32) {
	t.Helper()
	if got := retryServer.starts.Load(); got != wantStarts {
		t.Fatalf("start calls = %d, want %d", got, wantStarts)
	}
	if got := retryServer.completes.Load(); got != 2 {
		t.Fatalf("complete calls = %d, want 2", got)
	}
	if wantStarts == 0 {
		return
	}
	retryServer.callsMu.Lock()
	got := retryServer.completionCode
	retryServer.callsMu.Unlock()
	if got != nodesystem.ScheduledRunOutboxDaemonInterruptedCode {
		t.Fatalf("completion error code = %q", got)
	}
}

func TestScheduledJobs_LiveOutboxSkipsActiveRun(t *testing.T) {
	var starts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/nodes/node-1/scheduled-jobs/reconcile" {
			_, _ = writer.Write([]byte(`{"jobs":[]}`))
			return
		}
		if request.URL.Path == "/nodes/node-1/scheduled-jobs/runs/start" {
			starts.Add(1)
			_, _ = writer.Write([]byte(`{"ok":true,"started":true}`))
			return
		}
		t.Errorf("unexpected request: %s", request.URL.Path)
	}))
	defer server.Close()
	database := openTestDB(t)
	defer database.Close()
	runtime, err := newScheduledJobs(database, session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "yst_token"}}), "node-1", "")
	if err != nil {
		t.Fatalf("newScheduledJobs: %v", err)
	}
	if err := runtime.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitForScheduledJobsState(t, runtime, scheduledJobsEnabled)
	claim := sqlite.ScheduledJobRunOutboxClaim{RunID: "active", JobID: "job-1", NodeID: "node-1", ScheduledFor: time.Now()}
	if _, err := runtime.outbox.SaveClaim(context.Background(), claim); err != nil {
		t.Fatalf("SaveClaim: %v", err)
	}
	runtime.registerActiveRun(claim.RunID)
	runtime.RequestRefresh(context.Background())
	time.Sleep(30 * time.Millisecond)
	if got := starts.Load(); got != 0 {
		t.Fatalf("active run was restarted %d times", got)
	}
	runtime.unregisterActiveRun(claim.RunID)
	runtime.Close()
}

func awaitScheduledJobs(t *testing.T, isDone func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !isDone() {
		if time.Now().After(deadline) {
			t.Fatal("scheduled job outbox was not delivered")
		}
		time.Sleep(5 * time.Millisecond)
	}
}
