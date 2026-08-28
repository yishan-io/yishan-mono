package backgroundjob

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	domain "yishan/apps/cli/internal/backgroundjob"
	"yishan/apps/cli/internal/rpc"
	workspacepkg "yishan/apps/cli/internal/workspace"
)

type fakeJobs struct {
	jobs            map[string]domain.Job
	ran             int
	scheduleStarted chan struct{}
	scheduleErr     error
}

type fakeWorkspaces struct {
	entries map[string]workspacepkg.Workspace
}

func (f *fakeWorkspaces) GetWorkspace(id string) (workspacepkg.Workspace, error) {
	entry, ok := f.entries[id]
	if !ok {
		return workspacepkg.Workspace{}, errors.New("workspace not open")
	}
	return entry, nil
}

func (f *fakeJobs) Create(_ context.Context, job domain.Job) (domain.Job, error) {
	job.CreatedAt, job.UpdatedAt = "created", "created"
	f.jobs[job.ID] = job
	return job, nil
}
func (f *fakeJobs) Get(_ context.Context, id string) (domain.Job, error) {
	job, ok := f.jobs[id]
	if !ok {
		return domain.Job{}, domain.ErrJobNotFound
	}
	return job, nil
}
func (f *fakeJobs) ListByWorkspace(_ context.Context, workspaceID string) ([]domain.Job, error) {
	jobs := []domain.Job{}
	for _, job := range f.jobs {
		if job.WorkspaceID == workspaceID {
			jobs = append(jobs, job)
		}
	}
	return jobs, nil
}
func (f *fakeJobs) Cancel(_ context.Context, id string) error {
	job, err := f.Get(context.Background(), id)
	if err != nil {
		return err
	}
	if job.Status == domain.StatusQueued || job.Status == domain.StatusRunning {
		job.Status = domain.StatusCancelled
		f.jobs[id] = job
	}
	return nil
}
func (f *fakeJobs) Schedule(_ context.Context, _ string) error {
	f.ran++
	if f.scheduleStarted != nil {
		close(f.scheduleStarted)
	}
	return f.scheduleErr
}

func newServiceForTest(configured, ready bool) (*Service, *fakeJobs) {
	jobs := &fakeJobs{jobs: map[string]domain.Job{}}
	workspaces := &fakeWorkspaces{entries: map[string]workspacepkg.Workspace{
		"workspace": {ID: "workspace", Path: "/authoritative", ProjectID: "project", OrgID: "org"},
	}}
	return NewService(Deps{Jobs: jobs, Workspaces: workspaces, OwnerNodeID: "node",
		IsDSHConfigured: func() bool { return configured }, IsDSHReady: func() bool { return ready }}), jobs
}

func TestService_CreateDerivesWorkspaceContextAndQueuesWhenDSHUnavailable(t *testing.T) {
	service, jobs := newServiceForTest(true, false)
	value, err := service.Create(context.Background(), rpc.BackgroundJobCreateParams{WorkspaceID: "workspace", Prompt: "work", Model: "model"})
	if err != nil {
		t.Fatal(err)
	}
	created := value.(rpc.BackgroundJobResult)
	job, _ := jobs.Get(context.Background(), created.ID)
	if job.CWD != "/authoritative" || job.ProjectID != "project" || job.OrganizationID != "org" || job.Status != domain.StatusQueued || jobs.ran != 0 {
		t.Fatalf("job = %#v, runs = %d", job, jobs.ran)
	}
}

func TestService_WorkspaceAuthorizationAndIdempotentCancellation(t *testing.T) {
	service, jobs := newServiceForTest(true, false)
	jobs.jobs["job"] = ownedTestJob("job", domain.StatusQueued)
	if _, err := service.Get(context.Background(), rpc.BackgroundJobGetParams{WorkspaceID: "other", JobID: "job"}); err == nil {
		t.Fatal("get with unopened workspace succeeded")
	}
	for range 2 {
		value, err := service.Cancel(context.Background(), rpc.BackgroundJobCancelParams{WorkspaceID: "workspace", JobID: "job"})
		if err != nil || value.(rpc.BackgroundJobResult).Status != domain.StatusCancelled {
			t.Fatalf("cancel = %#v, %v", value, err)
		}
	}
}

func TestService_CreateRejectsUnconfiguredDSHAndPublicDTOHasNoSessionFields(t *testing.T) {
	service, _ := newServiceForTest(false, false)
	_, err := service.Create(context.Background(), rpc.BackgroundJobCreateParams{WorkspaceID: "workspace", Prompt: "work", Model: "model"})
	mapped := rpc.MapRPCError(err)
	data, ok := mapped.Data.(map[string]any)
	if mapped.Code != rpc.CodeToolUnavailable || !ok || data["code"] != rpc.ErrorDataCodeDSHRuntimeUnavailable {
		t.Fatalf("error = %#v", mapped)
	}
	public := domain.PublicJobFrom(domain.Job{ID: "job", WorkspaceID: "workspace", SessionID: "secret", CWD: "/secret",
		Status: domain.StatusSucceeded, ResultText: "done"})
	if public.Status != domain.StatusSucceeded || public.Result.Text != "done" {
		t.Fatalf("public status/result = %#v", public)
	}
	encoded, err := json.Marshal(public)
	if err != nil || string(encoded) == "" || containsForbiddenField(encoded) {
		t.Fatalf("public DTO = %s, %v", encoded, err)
	}
}

func containsForbiddenField(encoded []byte) bool {
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(encoded, &fields)
	for _, name := range []string{"sessionId", "tabId", "paneId", "cwd", "projectId", "organizationId", "ownerNodeId", "runtime"} {
		if _, exists := fields[name]; exists {
			return true
		}
	}
	return false
}

func TestService_HidesAndDoesNotMutateForeignOrStaleJobs(t *testing.T) {
	service, jobs := newServiceForTest(true, false)
	jobs.jobs["local"] = ownedTestJob("local", domain.StatusQueued)
	foreign := ownedTestJob("foreign", domain.StatusQueued)
	foreign.OwnerNodeID = "other-node"
	stale := ownedTestJob("stale", domain.StatusQueued)
	stale.CWD = "/stale"
	jobs.jobs[foreign.ID] = foreign
	jobs.jobs[stale.ID] = stale

	value, err := service.List(context.Background(), rpc.BackgroundJobListParams{WorkspaceID: "workspace"})
	if err != nil || len(value.(rpc.BackgroundJobListResult).Jobs) != 1 {
		t.Fatalf("list = %#v, %v", value, err)
	}
	for _, id := range []string{"foreign", "stale"} {
		if _, err := service.Get(context.Background(), rpc.BackgroundJobGetParams{WorkspaceID: "workspace", JobID: id}); !errors.Is(err, domain.ErrJobNotFound) {
			t.Fatalf("get %s error = %v", id, err)
		}
		if _, err := service.Cancel(context.Background(), rpc.BackgroundJobCancelParams{WorkspaceID: "workspace", JobID: id}); !errors.Is(err, domain.ErrJobNotFound) {
			t.Fatalf("cancel %s error = %v", id, err)
		}
		if jobs.jobs[id].Status != domain.StatusQueued {
			t.Fatalf("%s was mutated to %s", id, jobs.jobs[id].Status)
		}
	}
}

func ownedTestJob(id string, status domain.Status) domain.Job {
	return domain.Job{ID: id, WorkspaceID: "workspace", ProjectID: "project", OrganizationID: "org", OwnerNodeID: "node", CWD: "/authoritative", Status: status}
}

func TestService_CreateReturnsPersistedJobWhenSchedulerQueueIsFull(t *testing.T) {
	service, jobs := newServiceForTest(true, true)
	jobs.scheduleErr = errors.New("scheduler full")
	if _, err := service.Create(context.Background(), rpc.BackgroundJobCreateParams{WorkspaceID: "workspace", Prompt: "work", Model: "model"}); err != nil {
		t.Fatalf("create error = %v", err)
	}
	if len(jobs.jobs) != 1 || jobs.ran != 1 {
		t.Fatalf("persisted jobs = %d, schedule calls = %d", len(jobs.jobs), jobs.ran)
	}
}
