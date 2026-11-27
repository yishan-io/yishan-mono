package scheduledjob

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	domain "yishan/apps/cli/internal/scheduledjob"
)

type testClock struct{ now time.Time }

func (clock *testClock) Now() time.Time { return clock.now }

type testHarness struct {
	svc       *Service
	database  *sql.DB
	clock     *testClock
	launched  []Claim
	refreshes int
	agentRuns []string
	mu        sync.Mutex
}

func newHarness(t *testing.T, runtime *session.Session) *testHarness {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	harness := &testHarness{database: database, clock: &testClock{now: time.Date(2026, 11, 28, 10, 0, 30, 0, time.UTC)}}
	prefix, projectPath := "PROJ", t.TempDir()
	if err := sqlite.NewProjectStore(database).Create(context.Background(),
		sqlite.Project{ID: "project-1", OrganizationID: "org-1", Name: "Project", SourceType: "unknown", TaskPrefix: &prefix},
		&sqlite.PrimaryWorkspaceInput{ID: "primary-1", NodeID: "node-1", LocalPath: projectPath}); err != nil {
		t.Fatalf("seed project: %v", err)
	}
	harness.svc = NewService(Deps{Database: database, NodeID: "node-1", Session: runtime, Now: harness.clock.Now,
		RunAgent: func(_ context.Context, agentKind, prompt, _ string, path string) (string, error) {
			harness.mu.Lock()
			defer harness.mu.Unlock()
			harness.agentRuns = append(harness.agentRuns, agentKind+":"+prompt+"@"+path)
			if prompt == "fail" {
				return "partial", errors.New("exit status 1")
			}
			return "done", nil
		}})
	harness.svc.SetRuntime(func() { harness.refreshes++ }, func(claim Claim) { harness.launched = append(harness.launched, claim) })
	return harness
}

func (h *testHarness) create(t *testing.T, req rpc.ScheduledJobCreateParams) domain.Job {
	t.Helper()
	if req.OrganizationID == "" {
		req.OrganizationID, req.ProjectID = "org-1", "project-1"
	}
	result, err := h.svc.Create(context.Background(), req)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	return result.(domain.Job)
}

func TestCreate_ValidatesAndSchedulesTheFirstRun(t *testing.T) {
	h := newHarness(t, nil)
	job := h.create(t, rpc.ScheduledJobCreateParams{Name: " Nightly ", Prompt: "check", CronExpression: "0 9 * * *", NodeID: "node-1"})
	if job.Name != "Nightly" || job.AgentKind != domain.DefaultAgentKind || job.Timezone != "UTC" || job.Status != domain.StatusActive {
		t.Fatalf("unexpected defaults: %#v", job)
	}
	if job.NextRunAt != "2026-11-28T09:00:00.000Z" && job.NextRunAt != "2026-11-29T09:00:00.000Z" {
		t.Fatalf("unexpected next run %q", job.NextRunAt)
	}
	if h.refreshes != 1 {
		t.Fatalf("expected the scheduler to be refreshed, got %d", h.refreshes)
	}
	for _, req := range []rpc.ScheduledJobCreateParams{
		{OrganizationID: "org-1", ProjectID: "project-1", Name: "x", Prompt: "p", CronExpression: "bad"},
		{OrganizationID: "org-1", ProjectID: "project-1", Name: "x", Prompt: "p", CronExpression: "* * * * *", Timezone: "Mars/Base"},
		{OrganizationID: "org-1", ProjectID: "project-1", Name: "x", Prompt: "p", CronExpression: "* * * * *", AgentKind: "unknown"},
		{OrganizationID: "org-1", ProjectID: "project-1", Name: "x", Prompt: "p", CronExpression: "* * * * *", NodeID: "other-node"},
		{OrganizationID: "org-1", ProjectID: "missing", Name: "x", Prompt: "p", CronExpression: "* * * * *"},
		{OrganizationID: "org-2", ProjectID: "project-1", Name: "x", Prompt: "p", CronExpression: "* * * * *"},
	} {
		if _, err := h.svc.Create(context.Background(), req); err == nil {
			t.Fatalf("expected %#v to be rejected", req)
		}
	}
}

func TestPauseResumeUpdateAndDelete(t *testing.T) {
	h := newHarness(t, nil)
	job := h.create(t, rpc.ScheduledJobCreateParams{Name: "Job", Prompt: "p", CronExpression: "0 9 * * *"})
	ref := rpc.ScheduledJobRefParams{OrganizationID: "org-1", JobID: job.ID}
	paused, err := h.svc.Pause(context.Background(), ref)
	if err != nil || paused.(domain.Job).Status != domain.StatusPaused {
		t.Fatalf("pause: %#v %v", paused, err)
	}
	every := "*/5 * * * *"
	model := "gpt"
	updated, err := h.svc.Update(context.Background(), rpc.ScheduledJobUpdateParams{OrganizationID: "org-1", JobID: job.ID,
		CronExpression: &every, Model: rpc.OptionalNullable{Set: true, Value: &model}})
	if err != nil || updated.(domain.Job).NextRunAt != "2026-11-28T10:05:00.000Z" || *updated.(domain.Job).Model != "gpt" {
		t.Fatalf("update must reschedule a changed cron: %#v %v", updated, err)
	}
	cleared, _ := h.svc.Update(context.Background(), rpc.ScheduledJobUpdateParams{OrganizationID: "org-1", JobID: job.ID, Model: rpc.OptionalNullable{Set: true}})
	if cleared.(domain.Job).Model != nil {
		t.Fatalf("explicit null must clear the model: %#v", cleared)
	}
	resumed, _ := h.svc.Resume(context.Background(), ref)
	if resumed.(domain.Job).Status != domain.StatusActive {
		t.Fatalf("resume: %#v", resumed)
	}
	if _, err := h.svc.Pause(context.Background(), rpc.ScheduledJobRefParams{OrganizationID: "org-2", JobID: job.ID}); err == nil {
		t.Fatal("a job from another organization must not be found")
	}
	if _, err := h.svc.Delete(context.Background(), ref); err != nil {
		t.Fatalf("delete: %v", err)
	}
	listed, _ := h.svc.List(context.Background(), rpc.ScheduledJobListParams{OrganizationID: "org-1"})
	if len(listed.([]domain.Job)) != 0 {
		t.Fatalf("deleted job must be gone: %#v", listed)
	}
}

func TestClaimOccurrence_ClaimsOnceWithinTheWindow(t *testing.T) {
	h := newHarness(t, nil)
	job := h.create(t, rpc.ScheduledJobCreateParams{Name: "Job", Prompt: "p", CronExpression: "* * * * *"})
	due, _ := domain.ParseTime(job.NextRunAt)
	if _, err := h.svc.ClaimOccurrence(context.Background(), job.ID, due); !errors.Is(err, domain.ErrClaimRejected) {
		t.Fatalf("an occurrence must not be claimed before it is due, got %v", err)
	}
	h.clock.now = due.Add(10 * time.Second)
	claim, err := h.svc.ClaimOccurrence(context.Background(), job.ID, due)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if !claim.NextRunAt.Equal(due.Add(time.Minute)) || claim.ProjectPath == "" || claim.Prompt != "p" {
		t.Fatalf("unexpected claim: %#v", claim)
	}
	if _, err := h.svc.ClaimOccurrence(context.Background(), job.ID, due); !errors.Is(err, domain.ErrClaimRejected) {
		t.Fatalf("an occurrence must be claimed only once, got %v", err)
	}
	late := claim.NextRunAt
	h.clock.now = late.Add(2 * time.Minute)
	if _, err := h.svc.ClaimOccurrence(context.Background(), job.ID, late); !errors.Is(err, domain.ErrClaimRejected) {
		t.Fatalf("an occurrence past the window must be skipped, got %v", err)
	}
}

func TestSnapshot_FastForwardsOverdueJobsUnlessProtected(t *testing.T) {
	h := newHarness(t, nil)
	overdue := h.create(t, rpc.ScheduledJobCreateParams{Name: "A", Prompt: "p", CronExpression: "0 * * * *"})
	protected := h.create(t, rpc.ScheduledJobCreateParams{Name: "B", Prompt: "p", CronExpression: "0 * * * *"})
	h.clock.now = h.clock.now.Add(3 * time.Hour)
	protectedDue, _ := domain.ParseTime(protected.NextRunAt)
	occurrences, err := h.svc.Snapshot(context.Background(), []ScheduledOccurrence{{JobID: protected.ID, NextRunAt: protectedDue}})
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	byID := map[string]time.Time{}
	for _, occurrence := range occurrences {
		byID[occurrence.JobID] = occurrence.NextRunAt
	}
	if !byID[overdue.ID].After(h.clock.now) {
		t.Fatalf("overdue job must move to a future occurrence, got %v", byID[overdue.ID])
	}
	if !byID[protected.ID].Equal(protectedDue) {
		t.Fatalf("protected job must keep its occurrence, got %v", byID[protected.ID])
	}
}

func TestRunNowExecutesAndRecordsTheResult(t *testing.T) {
	h := newHarness(t, nil)
	job := h.create(t, rpc.ScheduledJobCreateParams{Name: "Job", Prompt: "fail", CronExpression: "0 9 * * *"})
	if _, err := h.svc.Pause(context.Background(), rpc.ScheduledJobRefParams{OrganizationID: "org-1", JobID: job.ID}); err != nil {
		t.Fatalf("pause: %v", err)
	}
	if _, err := h.svc.RunNow(context.Background(), rpc.ScheduledJobRefParams{OrganizationID: "org-1", JobID: job.ID}); err != nil {
		t.Fatalf("run now: %v", err)
	}
	if len(h.launched) != 1 {
		t.Fatalf("expected one launched run, got %d", len(h.launched))
	}
	h.svc.Execute(context.Background(), h.launched[0])
	h.svc.Execute(context.Background(), h.launched[0])
	if len(h.agentRuns) != 1 || !strings.HasPrefix(h.agentRuns[0], "pi:fail@") {
		t.Fatalf("expected exactly one agent run, got %v", h.agentRuns)
	}
	runs, _ := h.svc.ListRuns(context.Background(), rpc.ScheduledJobListRunsParams{OrganizationID: "org-1", JobID: job.ID})
	run := runs.([]domain.Run)[0]
	if run.Status != domain.RunFailed || *run.ErrorCode != errorCodeAgentFailed || *run.ResponseBody != "partial" || run.Trigger != domain.TriggerManual {
		t.Fatalf("unexpected run: %#v", run)
	}
	stored, _ := sqlite.NewScheduledJobStore(h.database).GetJob(context.Background(), job.ID)
	if stored.LastRunStatus == nil || *stored.LastRunStatus != domain.RunFailed {
		t.Fatalf("job last-run summary not recorded: %#v", stored)
	}
}

func TestExecute_FailsWhenTheProjectHasNoCheckoutHere(t *testing.T) {
	h := newHarness(t, nil)
	job := h.create(t, rpc.ScheduledJobCreateParams{Name: "Job", Prompt: "p", CronExpression: "0 9 * * *"})
	run := sqlite.NewPendingRun(job, "run-1", job.NextRunAt, domain.TriggerManual, h.clock.now)
	if err := sqlite.NewScheduledJobStore(h.database).CreateRun(context.Background(), run); err != nil {
		t.Fatalf("seed run: %v", err)
	}
	h.svc.Execute(context.Background(), Claim{JobID: job.ID, RunID: "run-1", Prompt: "p", AgentKind: "pi"})
	runs, _ := sqlite.NewScheduledJobStore(h.database).ListRuns(context.Background(), job.ID, 5)
	if runs[0].Status != domain.RunFailed || *runs[0].ErrorCode != errorCodePathMissing || len(h.agentRuns) != 0 {
		t.Fatalf("expected a path failure without running the agent: %#v", runs[0])
	}
}

func TestRecover_FailsUnfinishedRuns(t *testing.T) {
	h := newHarness(t, nil)
	job := h.create(t, rpc.ScheduledJobCreateParams{Name: "Job", Prompt: "p", CronExpression: "0 9 * * *"})
	store := sqlite.NewScheduledJobStore(h.database)
	for _, runID := range []string{"pending", "running"} {
		if err := store.CreateRun(context.Background(), sqlite.NewPendingRun(job, runID, domain.FormatTime(h.clock.now)+runID, domain.TriggerManual, h.clock.now)); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if _, err := store.MarkRunStarted(context.Background(), "running", h.clock.now); err != nil {
		t.Fatalf("start: %v", err)
	}
	if err := h.svc.Recover(context.Background()); err != nil {
		t.Fatalf("recover: %v", err)
	}
	runs, _ := store.ListRuns(context.Background(), job.ID, 5)
	for _, run := range runs {
		if run.Status != domain.RunFailed || *run.ErrorCode != "DAEMON_INTERRUPTED" {
			t.Fatalf("expected interrupted run, got %#v", run)
		}
	}
}

func TestImportFromAPI_ImportsThisNodesJobsOnce(t *testing.T) {
	calls := map[string]int{}
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls[r.URL.Path]++
		mu.Unlock()
		switch r.URL.Path {
		case "/orgs":
			_, _ = w.Write([]byte(`{"organizations":[{"id":"org-1"}]}`))
		case "/orgs/org-1/scheduled-jobs":
			_, _ = w.Write([]byte(`{"jobs":[
			 {"id":"job-here","organizationId":"org-1","projectId":"project-1","nodeId":"node-1","name":"Here","agentKind":"pi","prompt":"p","model":null,"command":null,"cronExpression":"0 9 * * *","timezone":"UTC","status":"active","nextRunAt":"2026-11-29T09:00:00Z","lastScheduledFor":null,"lastRunAt":null,"lastRunStatus":null,"lastErrorCode":null,"lastErrorMessage":null,"createdByUserId":"u","createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"},
			 {"id":"job-other-node","organizationId":"org-1","projectId":"project-1","nodeId":"node-2","name":"Other","agentKind":"pi","prompt":"p","cronExpression":"0 9 * * *","timezone":"UTC","status":"active","nextRunAt":"2026-11-29T09:00:00Z","createdAt":"2026-11-01T00:00:00Z","updatedAt":"2026-11-01T00:00:00Z"}]}`))
		case "/orgs/org-1/scheduled-jobs/job-here/runs":
			_, _ = w.Write([]byte(`{"runs":[{"id":"run-old","jobId":"job-here","organizationId":"org-1","projectId":"project-1","nodeId":"node-1","scheduledFor":"2026-11-27T09:00:00.000Z","trigger":"schedule","status":"succeeded","errorDetails":{"x":1},"createdAt":"2026-11-27T09:00:00.000Z"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	h := newHarness(t, session.New(&config.Config{API: config.APIConfig{BaseURL: server.URL, Token: "token"}}))
	h.svc.ImportFromAPI(context.Background())
	h.svc.ImportFromAPI(context.Background())
	listed, _ := h.svc.List(context.Background(), rpc.ScheduledJobListParams{OrganizationID: "org-1"})
	jobs := listed.([]domain.Job)
	if len(jobs) != 1 || jobs[0].ID != "job-here" || jobs[0].NextRunAt != "2026-11-29T09:00:00.000Z" {
		t.Fatalf("expected only this node's job with normalized times, got %#v", jobs)
	}
	runs, _ := h.svc.ListRuns(context.Background(), rpc.ScheduledJobListRunsParams{OrganizationID: "org-1", JobID: "job-here"})
	if len(runs.([]domain.Run)) != 1 {
		t.Fatalf("expected the imported run, got %#v", runs)
	}
	if calls["/orgs/org-1/scheduled-jobs"] != 1 {
		t.Fatalf("expected one import per organization, got %d", calls["/orgs/org-1/scheduled-jobs"])
	}
}
