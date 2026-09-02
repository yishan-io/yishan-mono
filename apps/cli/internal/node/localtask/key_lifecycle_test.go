package localtask

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	domain "yishan/apps/cli/internal/localtask"
	"yishan/apps/cli/internal/rpc"
)

func TestService_CreateReservesPersonalAndProjectKeys(t *testing.T) {
	service, _, _ := newTestService(t)
	allocator := &recordingKeyAllocator{}
	service.deps.KeyAllocator = allocator
	personal := createTaskWithKey(t, service, rpc.LocalTaskCreateParams{Title: "Personal"})
	projectID, organizationID := "project-1", "org-1"
	project := createTaskWithKey(t, service, rpc.LocalTaskCreateParams{Title: "Project", ProjectID: &projectID, OrganizationID: &organizationID})
	if personal.TaskKey == nil || project.TaskKey == nil {
		t.Fatalf("created keys = %#v, %#v", personal.TaskKey, project.TaskKey)
	}
	if len(allocator.requests) != 2 || allocator.requests[0].ProjectID != nil || *allocator.requests[1].ProjectID != projectID {
		t.Fatalf("allocation requests = %#v", allocator.requests)
	}
}

func TestService_CreateRetriesStableRemoteReservationAfterLocalWriteFailure(t *testing.T) {
	service, _, repository := newTestService(t)
	allocator := &recordingKeyAllocator{}
	service.deps.KeyAllocator = allocator
	service.deps.Repository = &failingCreateRepository{Repository: repository, failures: 1}
	request := rpc.LocalTaskCreateParams{ID: "d1f47ed0-8035-452e-9419-6bff5ea1c635", Title: "Retry me"}

	if _, err := service.Create(context.Background(), request); err == nil {
		t.Fatal("expected local task create failure")
	}
	createdValue, err := service.Create(context.Background(), request)
	if err != nil {
		t.Fatalf("retry create: %v", err)
	}
	created := createdValue.(domain.Task)
	if created.ID != request.ID {
		t.Fatalf("created task ID = %q, want %q", created.ID, request.ID)
	}
	assertTaskKey(t, repository, request.ID, "TASK-"+request.ID)
	if len(allocator.requests) != 2 || allocator.requests[0].TaskID != request.ID || allocator.requests[1].TaskID != request.ID {
		t.Fatalf("allocation retries = %#v", allocator.requests)
	}
}

func TestService_CreateReturnsExistingTaskForRetry(t *testing.T) {
	service, _, _ := newTestService(t)
	allocator := &recordingKeyAllocator{}
	service.deps.KeyAllocator = allocator
	request := rpc.LocalTaskCreateParams{ID: "d8a6e245-651a-4650-836e-c80bdf75e90a", Title: "Retry me"}

	firstValue, err := service.Create(context.Background(), request)
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	secondValue, err := service.Create(context.Background(), request)
	if err != nil {
		t.Fatalf("retry create: %v", err)
	}
	if firstValue.(domain.Task).ID != secondValue.(domain.Task).ID || len(allocator.requests) != 1 {
		t.Fatalf("create retries = %#v, allocations = %#v", secondValue, allocator.requests)
	}
}

func TestService_CreateDoesNotPersistTaskWhenAllocationFails(t *testing.T) {
	service, _, repository := newTestService(t)
	service.deps.KeyAllocator = &recordingKeyAllocator{err: errors.New("offline")}
	_, err := service.Create(context.Background(), rpc.LocalTaskCreateParams{Title: "Offline"})
	var allocationErr *KeyAllocationError
	if !errors.As(err, &allocationErr) || !errors.Is(err, service.deps.KeyAllocator.(*recordingKeyAllocator).err) {
		t.Fatalf("Create error = %v, want actionable allocation error", err)
	}
	tasks, err := repository.List(context.Background(), domain.TaskFilter{})
	if err != nil || len(tasks) != 0 {
		t.Fatalf("persisted tasks = %#v, %v; want none", tasks, err)
	}
}

func TestService_BackfillRetriesStableRemoteReservationAfterLocalWriteFailure(t *testing.T) {
	service, _, repository := newTestService(t)
	legacy := createLegacyTask(t, repository, "legacy")
	allocator := &recordingKeyAllocator{}
	service.deps.KeyAllocator = allocator
	failingRepository := &failingKeyRepository{Repository: repository, failures: 1}
	service.deps.Repository = failingRepository
	if err := service.BackfillTaskKeys(context.Background()); err == nil {
		t.Fatal("expected local key write failure")
	}
	if err := service.BackfillTaskKeys(context.Background()); err != nil {
		t.Fatalf("retry backfill: %v", err)
	}
	assertBackfilledTask(t, repository, legacy.ID)
	if len(allocator.requests) != 2 || allocator.requests[0].TaskID != allocator.requests[1].TaskID {
		t.Fatalf("allocation retries = %#v", allocator.requests)
	}
}

func TestService_BackfillTaskKeysContinuesAfterPerTaskFailure(t *testing.T) {
	service, _, repository := newTestService(t)
	failed := createLegacyTask(t, repository, "a-failed")
	continued := createLegacyTask(t, repository, "b-continued")
	service.deps.KeyAllocator = &recordingKeyAllocator{}
	service.deps.Repository = &failingKeyRepository{Repository: repository, failures: 1}

	if err := service.BackfillTaskKeys(context.Background()); err == nil {
		t.Fatal("expected a per-task backfill error")
	}
	assertTaskKey(t, repository, continued.ID, "TASK-"+continued.ID)
	remaining, err := repository.ListWithoutTaskKey(context.Background())
	if err != nil || len(remaining) != 1 || remaining[0].ID != failed.ID {
		t.Fatalf("remaining key backfills = %#v, %v", remaining, err)
	}
}

func TestService_BackfillTaskKeysRetriesAllocationFailuresWithoutBlockingOtherTasks(t *testing.T) {
	service, _, repository := newTestService(t)
	failed := createLegacyTask(t, repository, "a-offline")
	continued := createLegacyTask(t, repository, "b-online")
	allocator := &selectiveFailingKeyAllocator{failedTaskID: failed.ID, err: errors.New("offline")}
	service.deps.KeyAllocator = allocator

	if err := service.BackfillTaskKeys(context.Background()); err == nil {
		t.Fatal("expected an allocation failure")
	}
	assertTaskKey(t, repository, continued.ID, "TASK-"+continued.ID)
	allocator.err = nil
	if err := service.BackfillTaskKeys(context.Background()); err != nil {
		t.Fatalf("retry allocation: %v", err)
	}
	assertTaskKey(t, repository, failed.ID, "TASK-"+failed.ID)
	if len(allocator.requests) != 3 || allocator.requests[0].TaskID != failed.ID || allocator.requests[2].TaskID != failed.ID {
		t.Fatalf("allocation attempts = %#v", allocator.requests)
	}
}

func TestLocalTaskStore_SetTaskKeyIfEmptyPreservesConcurrentKey(t *testing.T) {
	_, _, repository := newTestService(t)
	legacy := createLegacyTask(t, repository, "legacy")
	if updated, err := repository.SetTaskKeyIfEmpty(context.Background(), legacy.ID, "TASK-1"); err != nil || !updated {
		t.Fatalf("initial key update = %t, %v", updated, err)
	}
	if updated, err := repository.SetTaskKeyIfEmpty(context.Background(), legacy.ID, "TASK-2"); err != nil || updated {
		t.Fatalf("conditional key update = %t, %v; want false, nil", updated, err)
	}
	assertTaskKey(t, repository, legacy.ID, "TASK-1")
}

type recordingKeyAllocator struct {
	requests []KeyAllocationRequest
	err      error
}

func (allocator *recordingKeyAllocator) AllocateTaskKey(_ context.Context, request KeyAllocationRequest) (string, error) {
	allocator.requests = append(allocator.requests, request)
	if allocator.err != nil {
		return "", allocator.err
	}
	return fmt.Sprintf("TASK-%s", request.TaskID), nil
}

func createTaskWithKey(t *testing.T, service *Service, request rpc.LocalTaskCreateParams) domain.Task {
	t.Helper()
	created, err := service.Create(context.Background(), request)
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	return created.(domain.Task)
}

func createLegacyTask(t *testing.T, repository domain.Repository, id string) domain.Task {
	t.Helper()
	task, err := repository.Create(context.Background(), domain.Task{ID: id, Title: id, Status: domain.StatusNew, Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("create legacy task: %v", err)
	}
	return task
}

type failingKeyRepository struct {
	domain.Repository
	failures int
}

func (repository *failingKeyRepository) SetTaskKeyIfEmpty(ctx context.Context, taskID string, taskKey string) (bool, error) {
	if repository.failures > 0 {
		repository.failures--
		return false, errors.New("local write failed")
	}
	return repository.Repository.SetTaskKeyIfEmpty(ctx, taskID, taskKey)
}

func assertBackfilledTask(t *testing.T, repository domain.Repository, taskID string) {
	assertTaskKey(t, repository, taskID, "TASK-"+taskID)
}

func assertTaskKey(t *testing.T, repository domain.Repository, taskID string, wantKey string) {
	t.Helper()
	task, err := repository.Get(context.Background(), taskID)
	if err != nil || task.TaskKey == nil || *task.TaskKey != wantKey {
		t.Fatalf("task key = %#v, %v; want %q", task, err, wantKey)
	}
}

func TestService_KeySurvivesGetListSearchAndUpdate(t *testing.T) {
	service, _, _ := newTestService(t)
	created := createTaskWithKey(t, service, rpc.LocalTaskCreateParams{Title: "Keyed searchable"})
	newTitle := "Keyed updated"
	updatedValue, err := service.Update(context.Background(), rpc.LocalTaskUpdateParams{ID: created.ID, Title: &newTitle})
	if err != nil {
		t.Fatalf("update task: %v", err)
	}
	listedValue, err := service.List(context.Background(), rpc.LocalTaskListParams{})
	if err != nil {
		t.Fatalf("list tasks: %v", err)
	}
	searchedValue, err := service.Search(context.Background(), rpc.LocalTaskSearchParams{Query: "updated"})
	if err != nil {
		t.Fatalf("search tasks: %v", err)
	}
	assertTaskKeyValue(t, updatedValue.(domain.Task), *created.TaskKey)
	assertTaskKeyValue(t, listedValue.([]domain.Task)[0], *created.TaskKey)
	assertTaskKeyValue(t, searchedValue.([]domain.SearchResult)[0].Task, *created.TaskKey)
}

func assertTaskKeyValue(t *testing.T, task domain.Task, wantKey string) {
	t.Helper()
	if task.TaskKey == nil || *task.TaskKey != wantKey {
		t.Fatalf("task key = %v, want %q", task.TaskKey, wantKey)
	}
}

type failingCreateRepository struct {
	domain.Repository
	failures int
}

func (repository *failingCreateRepository) Create(ctx context.Context, task domain.Task) (domain.Task, error) {
	if repository.failures > 0 {
		repository.failures--
		return domain.Task{}, errors.New("local create failed")
	}
	return repository.Repository.Create(ctx, task)
}

type selectiveFailingKeyAllocator struct {
	requests     []KeyAllocationRequest
	failedTaskID string
	err          error
}

func (allocator *selectiveFailingKeyAllocator) AllocateTaskKey(_ context.Context, request KeyAllocationRequest) (string, error) {
	allocator.requests = append(allocator.requests, request)
	if request.TaskID == allocator.failedTaskID && allocator.err != nil {
		return "", allocator.err
	}
	return fmt.Sprintf("TASK-%s", request.TaskID), nil
}

func TestService_CreateReturnsExistingTaskWhenConcurrentCreatesShareID(t *testing.T) {
	service, _, _ := newTestService(t)
	allocator := &concurrentKeyAllocator{ready: make(chan struct{}), release: make(chan struct{})}
	service.deps.KeyAllocator = allocator
	request := rpc.LocalTaskCreateParams{ID: "b51bcecd-87d0-4dea-a4dc-725ae5fe1d38", Title: "Concurrent"}
	results := make(chan domain.Task, 2)
	errors := make(chan error, 2)
	for range 2 {
		go func() {
			created, err := service.Create(context.Background(), request)
			if err != nil {
				errors <- err
				return
			}
			results <- created.(domain.Task)
		}()
	}
	<-allocator.ready
	<-allocator.ready
	close(allocator.release)
	for range 2 {
		select {
		case err := <-errors:
			t.Fatalf("concurrent create: %v", err)
		case created := <-results:
			if created.ID != request.ID {
				t.Fatalf("created ID = %q, want %q", created.ID, request.ID)
			}
		}
	}
}

type concurrentKeyAllocator struct {
	ready   chan struct{}
	release chan struct{}
	once    sync.Once
}

func (allocator *concurrentKeyAllocator) AllocateTaskKey(_ context.Context, request KeyAllocationRequest) (string, error) {
	allocator.ready <- struct{}{}
	<-allocator.release
	return "TASK-" + request.TaskID, nil
}
