package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"yishan/apps/cli/internal/backgroundjob"
)

func TestBackgroundJobStore_CreatePersistsAndLoads(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	created, err := store.Create(context.Background(), testBackgroundJob("job-1", "session-1", "workspace-1"))
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Get(context.Background(), created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded != created || loaded.CreatedAt == "" || loaded.UpdatedAt == "" {
		t.Fatalf("loaded job = %#v, created = %#v", loaded, created)
	}
}

func TestBackgroundJobStore_CompareAndSwapStatusPersistsTerminalOutcome(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	mustCreateBackgroundJob(t, store, "job-1", "session-1", "workspace-1")
	mustStartBackgroundJob(t, store, "job-1")
	want := backgroundjob.Outcome{ResultText: "completed", ErrorCode: "", ErrorMessage: ""}
	job, swapped, err := store.CompareAndSwapStatus(context.Background(), "job-1", backgroundjob.StatusRunning, backgroundjob.StatusSucceeded, want)
	if err != nil || !swapped || job.Outcome() != want || job.StartedAt == nil || job.FinishedAt == nil {
		t.Fatalf("finish = %#v, %t, %v", job, swapped, err)
	}
	loaded, err := store.Get(context.Background(), "job-1")
	if err != nil || loaded.Outcome() != want || loaded.FinishedAt == nil {
		t.Fatalf("loaded finished job = %#v, %v", loaded, err)
	}
}

func TestBackgroundJobStore_CreateRejectsMismatchedWorkspaceOwnership(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	for _, testCase := range []struct {
		name string
		job  backgroundjob.Job
	}{
		{name: "project", job: testBackgroundJob("project", "session-project", "workspace-1")},
		{name: "organization", job: testBackgroundJob("organization", "session-organization", "workspace-1")},
		{name: "node", job: testBackgroundJob("node", "session-node", "workspace-1")},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			job := testCase.job
			switch testCase.name {
			case "project":
				job.ProjectID = "other-project"
			case "organization":
				job.OrganizationID = "other-org"
			case "node":
				job.OwnerNodeID = "other-node"
			}
			if _, err := store.Create(context.Background(), job); err == nil {
				t.Fatal("expected workspace ownership mismatch")
			}
			if _, err := store.Get(context.Background(), job.ID); !errors.Is(err, backgroundjob.ErrJobNotFound) {
				t.Fatalf("mismatched job persisted: %v", err)
			}
		})
	}
}

func TestBackgroundJobStore_EnforcesUniqueSessionIDs(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	if _, err := store.Create(context.Background(), testBackgroundJob("job-1", "session-1", "workspace-1")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Create(context.Background(), testBackgroundJob("job-2", "session-1", "workspace-1")); err == nil {
		t.Fatal("expected duplicate session ID error")
	}
}

func TestBackgroundJobStore_ListByWorkspaceOrdersNewestFirst(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	mustCreateBackgroundJob(t, store, "job-1", "session-1", "workspace-1")
	mustCreateBackgroundJob(t, store, "job-2", "session-2", "workspace-1")
	mustCreateBackgroundJob(t, store, "job-3", "session-3", "workspace-2")
	jobs, err := store.ListByWorkspace(context.Background(), "workspace-1")
	if err != nil || len(jobs) != 2 || jobs[0].ID != "job-2" || jobs[1].ID != "job-1" {
		t.Fatalf("workspace jobs = %#v, %v", jobs, err)
	}
}

func TestBackgroundJobStore_CompareAndSwapStatusSupportsCancellation(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	mustCreateBackgroundJob(t, store, "queued", "session-1", "workspace-1")
	mustCreateBackgroundJob(t, store, "running", "session-2", "workspace-1")
	mustStartBackgroundJob(t, store, "running")
	assertBackgroundJobCancelled(t, store, "queued", backgroundjob.StatusQueued)
	assertBackgroundJobCancelled(t, store, "running", backgroundjob.StatusRunning)
}

func TestBackgroundJobStore_CompareAndSwapStatusRejectsStaleAndInvalidTransitions(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	mustCreateBackgroundJob(t, store, "job-1", "session-1", "workspace-1")
	if _, swapped, err := store.CompareAndSwapStatus(context.Background(), "job-1", backgroundjob.StatusRunning, backgroundjob.StatusCancelled, backgroundjob.Outcome{}); err != nil || swapped {
		t.Fatalf("stale CAS = %t, %v", swapped, err)
	}
	if _, _, err := store.CompareAndSwapStatus(context.Background(), "job-1", backgroundjob.StatusQueued, backgroundjob.StatusSucceeded, backgroundjob.Outcome{}); !errors.Is(err, backgroundjob.ErrInvalidTransition) {
		t.Fatalf("invalid CAS error = %v", err)
	}
}

func TestBackgroundJobStore_ListForStartupRecovery(t *testing.T) {
	store := openTestBackgroundJobStore(t)
	mustCreateBackgroundJob(t, store, "job-2", "session-2", "workspace-1")
	mustCreateBackgroundJob(t, store, "job-1", "session-1", "workspace-1")
	mustCreateBackgroundJob(t, store, "done", "session-3", "workspace-1")
	mustStartBackgroundJob(t, store, "done")
	mustFinishBackgroundJob(t, store, "done")
	jobs, err := store.ListForStartupRecovery(context.Background())
	if err != nil || len(jobs) != 2 || jobs[0].ID != "job-1" || jobs[1].ID != "job-2" {
		t.Fatalf("recovery jobs = %#v, %v", jobs, err)
	}
}

func openTestBackgroundJobStore(t *testing.T) *BackgroundJobStore {
	t.Helper()
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(database); err != nil {
		t.Fatal(err)
	}
	seedBackgroundJobWorkspace(t, database, "workspace-1")
	return NewBackgroundJobStore(database)
}

func seedBackgroundJobWorkspace(t *testing.T, database interface {
	Exec(string, ...any) (sql.Result, error)
}, workspaceID string) {
	t.Helper()
	_, err := database.Exec(`INSERT OR IGNORE INTO workspaces
		(id, organization_id, project_id, node_id, kind, status, local_path, state)
		VALUES (?, 'org-1', 'project-1', 'node-1', 'primary', 'closed', ?, 'active')`, workspaceID, "/tmp/"+workspaceID)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
}

func testBackgroundJob(id, sessionID, workspaceID string) backgroundjob.Job {
	return backgroundjob.Job{ID: id, Kind: backgroundjob.KindWorkspaceTaskRun, Runtime: backgroundjob.RuntimeDSH,
		WorkspaceID: workspaceID, ProjectID: "project-1", OrganizationID: "org-1", OwnerNodeID: "node-1",
		SessionID: sessionID, CWD: "/tmp/workspace", Prompt: "Fix the task", Model: "model-1", Status: backgroundjob.StatusQueued}
}

func mustCreateBackgroundJob(t *testing.T, store *BackgroundJobStore, id, sessionID, workspaceID string) {
	t.Helper()
	seedBackgroundJobWorkspace(t, store.database, workspaceID)
	if _, err := store.Create(context.Background(), testBackgroundJob(id, sessionID, workspaceID)); err != nil {
		t.Fatal(err)
	}
}

func mustStartBackgroundJob(t *testing.T, store *BackgroundJobStore, id string) {
	t.Helper()
	_, swapped, err := store.CompareAndSwapStatus(context.Background(), id, backgroundjob.StatusQueued, backgroundjob.StatusRunning, backgroundjob.Outcome{})
	if err != nil || !swapped {
		t.Fatalf("start %q = %t, %v", id, swapped, err)
	}
}

func mustFinishBackgroundJob(t *testing.T, store *BackgroundJobStore, id string) {
	t.Helper()
	_, swapped, err := store.CompareAndSwapStatus(context.Background(), id, backgroundjob.StatusRunning, backgroundjob.StatusSucceeded, backgroundjob.Outcome{ResultText: "done"})
	if err != nil || !swapped {
		t.Fatalf("finish %q = %t, %v", id, swapped, err)
	}
}

func assertBackgroundJobCancelled(t *testing.T, store *BackgroundJobStore, id string, expected backgroundjob.Status) {
	t.Helper()
	job, swapped, err := store.CompareAndSwapStatus(context.Background(), id, expected, backgroundjob.StatusCancelled, backgroundjob.Outcome{})
	if err != nil || !swapped || job.Status != backgroundjob.StatusCancelled || job.FinishedAt == nil {
		t.Fatalf("cancel %q = %#v, %t, %v", id, job, swapped, err)
	}
}
