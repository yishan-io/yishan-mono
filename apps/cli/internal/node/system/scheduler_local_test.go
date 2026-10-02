package system

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLocalScheduler_ProtectsArmedAndClaimingOccurrences(t *testing.T) {
	now := time.Now()
	due := now.Add(time.Hour)
	claimStarted := make(chan struct{})
	releaseClaim := make(chan struct{})
	executeStarted := make(chan struct{})
	var snapshots [][]LocalScheduledJob
	var snapshotMu sync.Mutex

	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(_ context.Context, protected []LocalScheduledJob) ([]LocalScheduledJob, error) {
			snapshotMu.Lock()
			snapshots = append(snapshots, append([]LocalScheduledJob(nil), protected...))
			snapshotMu.Unlock()
			return []LocalScheduledJob{{ID: "job", Status: "active", NextRunAt: due}}, nil
		},
		Claim: func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error) {
			close(claimStarted)
			<-releaseClaim
			return testClaim(due.Add(time.Minute)), nil
		},
		Execute: func(_ context.Context, claim LocalSchedulerClaimResult) {
			assertClaimPayload(t, claim)
			close(executeStarted)
		},
		Now: func() time.Time { return now },
	})
	defer scheduler.Close()
	startLocalScheduler(t, scheduler)
	refreshLocalScheduler(t, scheduler)
	assertProtectedJob(t, snapshots, "job", due)

	scheduler.handleDue("job", due)
	<-claimStarted
	assertClaimingJob(t, scheduler, "job", due)
	close(releaseClaim)
	<-executeStarted
	assertProtectedJob(t, [][]LocalScheduledJob{scheduler.protectedJobs()}, "job", due.Add(time.Minute))
}

func TestLocalScheduler_CloseWaitsForActiveExecutor(t *testing.T) {
	due := time.Now().Add(time.Hour)
	executeStarted := make(chan struct{})
	executeStopped := make(chan struct{})
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(context.Context, []LocalScheduledJob) ([]LocalScheduledJob, error) { return nil, nil },
		Claim: func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error) {
			return testClaim(due.Add(time.Hour)), nil
		},
		Execute: func(ctx context.Context, _ LocalSchedulerClaimResult) {
			close(executeStarted)
			<-ctx.Done()
			close(executeStopped)
		},
	})
	t.Cleanup(scheduler.Close)

	armTestTimer(scheduler, "job", due)
	scheduler.handleDue("job", due)
	<-executeStarted
	scheduler.Close()
	select {
	case <-executeStopped:
	default:
		t.Fatal("Close returned before the active executor stopped")
	}
}

func TestLocalScheduler_CloseWaitsForBlockedReconcile(t *testing.T) {
	reconcileStarted := make(chan struct{})
	reconcileStopped := make(chan struct{})
	var snapshots atomic.Int32
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(ctx context.Context, _ []LocalScheduledJob) ([]LocalScheduledJob, error) {
			if snapshots.Add(1) == 1 {
				return nil, nil
			}
			close(reconcileStarted)
			<-ctx.Done()
			close(reconcileStopped)
			return nil, ctx.Err()
		},
		Claim:   unexpectedClaim(t),
		Execute: unexpectedExecute(t),
	})
	t.Cleanup(scheduler.Close)
	startLocalScheduler(t, scheduler)
	scheduler.requestReconcile()
	<-reconcileStarted
	scheduler.Close()
	select {
	case <-reconcileStopped:
	default:
		t.Fatal("Close returned before the blocked reconcile stopped")
	}
}

func TestLocalScheduler_CloseWaitsForDirectRefresh(t *testing.T) {
	snapshotStarted := make(chan struct{})
	releaseSnapshot := make(chan struct{})
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(context.Context, []LocalScheduledJob) ([]LocalScheduledJob, error) {
			close(snapshotStarted)
			<-releaseSnapshot
			return nil, nil
		},
		Claim:   unexpectedClaim(t),
		Execute: unexpectedExecute(t),
	})
	t.Cleanup(func() {
		select {
		case <-releaseSnapshot:
		default:
			close(releaseSnapshot)
		}
		scheduler.Close()
	})

	refreshDone := make(chan error, 1)
	go func() { refreshDone <- scheduler.Refresh() }()
	<-snapshotStarted
	closeDone := make(chan struct{})
	go func() {
		scheduler.Close()
		close(closeDone)
	}()
	select {
	case <-closeDone:
		t.Fatal("Close returned before the direct refresh callback stopped")
	case <-time.After(30 * time.Millisecond):
	}
	close(releaseSnapshot)
	<-refreshDone
	select {
	case <-closeDone:
	case <-time.After(time.Second):
		t.Fatal("Close did not return after the direct refresh callback stopped")
	}
}

func TestLocalScheduler_RunningJobUnprotectsNextDueAndReconciles(t *testing.T) {
	scheduler, firstDue, secondDue, nextFutureDue, executeStarted, releaseExecute, reconciled, claimCalls := newRunningJobScheduler(t)
	defer scheduler.Close()
	defer close(releaseExecute)
	startLocalScheduler(t, scheduler)

	scheduler.handleDue("job", firstDue)
	<-executeStarted
	scheduler.handleDue("job", secondDue)
	assertUnprotectedReconcile(t, reconciled)
	waitForProtectedJob(t, scheduler, "job", nextFutureDue)
	assertClaimedJob(t, claimCalls, "job")
	assertNoClaim(t, claimCalls)
}

func newRunningJobScheduler(t *testing.T) (*LocalScheduler, time.Time, time.Time, time.Time, chan struct{}, chan struct{}, chan []LocalScheduledJob, chan string) {
	t.Helper()
	now := time.Now()
	firstDue := now.Add(time.Hour)
	secondDue := firstDue.Add(time.Minute)
	nextFutureDue := secondDue.Add(time.Minute)
	executeStarted := make(chan struct{})
	releaseExecute := make(chan struct{})
	reconciled := make(chan []LocalScheduledJob, 1)
	claimCalls := make(chan string, 2)
	snapshotCalls := 0
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(_ context.Context, protected []LocalScheduledJob) ([]LocalScheduledJob, error) {
			snapshotCalls++
			if snapshotCalls == 1 {
				return []LocalScheduledJob{{ID: "job", Status: "active", NextRunAt: firstDue}}, nil
			}
			reconciled <- append([]LocalScheduledJob(nil), protected...)
			return []LocalScheduledJob{{ID: "job", Status: "active", NextRunAt: nextFutureDue}}, nil
		},
		Claim: func(_ context.Context, _ string, due time.Time) (LocalSchedulerClaimResult, error) {
			if !due.Equal(firstDue) {
				t.Errorf("claimed due = %s, want %s", due, firstDue)
			}
			claimCalls <- "job"
			return testClaim(secondDue), nil
		},
		Execute: func(context.Context, LocalSchedulerClaimResult) {
			close(executeStarted)
			<-releaseExecute
		},
		MaxConcurrent: 2,
		Now:           func() time.Time { return now },
	})
	return scheduler, firstDue, secondDue, nextFutureDue, executeStarted, releaseExecute, reconciled, claimCalls
}

func TestLocalScheduler_StartSkipsExpiredOccurrences(t *testing.T) {
	now := time.Now()
	executed := make(chan struct{}, 1)
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(context.Context, []LocalScheduledJob) ([]LocalScheduledJob, error) {
			return []LocalScheduledJob{{ID: "job", Status: "active", NextRunAt: now.Add(-time.Minute)}}, nil
		},
		Claim: func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error) {
			t.Fatal("Claim must not run for an expired startup occurrence")
			return LocalSchedulerClaimResult{}, nil
		},
		Execute: func(context.Context, LocalSchedulerClaimResult) { executed <- struct{}{} },
		Now:     func() time.Time { return now },
	})
	defer scheduler.Close()
	startLocalScheduler(t, scheduler)
	assertNotExecuted(t, executed)
	if len(scheduler.protectedJobs()) != 0 {
		t.Fatal("expired startup occurrence remained protected")
	}
}

func assertUnprotectedReconcile(t *testing.T, reconciled <-chan []LocalScheduledJob) {
	t.Helper()
	select {
	case protected := <-reconciled:
		if len(protected) != 0 {
			t.Fatalf("overloaded occurrence remained protected: %+v", protected)
		}
	case <-time.After(time.Second):
		t.Fatal("overload did not request reconciliation")
	}
}

func waitForProtectedJob(t *testing.T, scheduler *LocalScheduler, wantID string, wantDue time.Time) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		for _, job := range scheduler.protectedJobs() {
			if job.ID == wantID && job.NextRunAt.Equal(wantDue) {
				return
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("scheduler did not arm %q at %s", wantID, wantDue)
}

func assertNotExecuted(t *testing.T, executed <-chan struct{}) {
	t.Helper()
	select {
	case <-executed:
		t.Fatal("expired occurrence executed")
	case <-time.After(30 * time.Millisecond):
	}
}

func unexpectedClaim(t *testing.T) LocalSchedulerClaim {
	t.Helper()
	return func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error) {
		t.Error("Claim must not run")
		return LocalSchedulerClaimResult{}, nil
	}
}

func unexpectedExecute(t *testing.T) LocalSchedulerExecute {
	t.Helper()
	return func(context.Context, LocalSchedulerClaimResult) { t.Error("Execute must not run") }
}

func testClaim(nextRunAt time.Time) LocalSchedulerClaimResult {
	return LocalSchedulerClaimResult{
		RunID: "run", ScheduledFor: nextRunAt.Add(-time.Minute), Agent: "claude",
		Prompt: "prompt", Model: "model", ProjectPath: "/project", NextRunAt: nextRunAt,
	}
}

func assertClaimedJob(t *testing.T, claimCalls <-chan string, want string) {
	t.Helper()
	select {
	case got := <-claimCalls:
		if got != want {
			t.Fatalf("claim = %q, want %q", got, want)
		}
	case <-time.After(time.Second):
		t.Fatal("claim did not start")
	}
}

func assertClaimPayload(t *testing.T, claim LocalSchedulerClaimResult) {
	t.Helper()
	if claim.RunID != "run" || claim.Agent != "claude" || claim.Prompt != "prompt" || claim.Model != "model" || claim.ProjectPath != "/project" {
		t.Fatalf("unexpected claim payload: %+v", claim)
	}
	if !claim.ScheduledFor.Equal(claim.NextRunAt.Add(-time.Minute)) {
		t.Fatalf("scheduled for = %s, next run = %s", claim.ScheduledFor, claim.NextRunAt)
	}
}

func refreshLocalScheduler(t *testing.T, scheduler *LocalScheduler) {
	t.Helper()
	if err := scheduler.Refresh(); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
}

func startLocalScheduler(t *testing.T, scheduler *LocalScheduler) {
	t.Helper()
	if err := scheduler.Start(); err != nil {
		t.Fatalf("Start: %v", err)
	}
}

func newLocalScheduler(t *testing.T, options LocalSchedulerOptions) *LocalScheduler {
	t.Helper()
	scheduler, err := NewLocalScheduler(options)
	if err != nil {
		t.Fatalf("NewLocalScheduler: %v", err)
	}
	return scheduler
}

func armTestTimer(scheduler *LocalScheduler, jobID string, due time.Time) {
	scheduler.mu.Lock()
	scheduler.armed[jobID] = due
	scheduler.mu.Unlock()
}

func assertClaimingJob(t *testing.T, scheduler *LocalScheduler, wantID string, wantDue time.Time) {
	t.Helper()
	for _, job := range scheduler.protectedJobs() {
		if job.ID == wantID && job.NextRunAt.Equal(wantDue) {
			return
		}
	}
	t.Fatalf("protected jobs did not include claiming %q at %s", wantID, wantDue)
}

func assertProtectedJob(t *testing.T, snapshots [][]LocalScheduledJob, wantID string, wantDue time.Time) {
	t.Helper()
	for _, snapshot := range snapshots {
		for _, job := range snapshot {
			if job.ID == wantID && job.NextRunAt.Equal(wantDue) {
				return
			}
		}
	}
	t.Fatalf("snapshots did not include %q at %s", wantID, wantDue)
}

func TestLocalScheduler_BoundsSimultaneousDueJobsAndRearmsFutureOccurrence(t *testing.T) {
	const maxConcurrent = 2
	due := time.Now().Add(30 * time.Millisecond)
	nextDue := due.Add(time.Hour)
	scheduler, executeStarted, executeStopped, reconciled, active, maximumActive := newBurstScheduler(t, due, nextDue, maxConcurrent)
	t.Cleanup(scheduler.Close)
	startLocalScheduler(t, scheduler)

	waitForClaims(t, executeStarted, maxConcurrent)
	overflowJobID := assertOverflowReconciled(t, reconciled)
	waitForProtectedJob(t, scheduler, overflowJobID, nextDue)
	if got := maximumActive.Load(); got > maxConcurrent {
		t.Fatalf("active executions = %d, limit = %d", got, maxConcurrent)
	}

	scheduler.Close()
	waitForClaims(t, executeStopped, maxConcurrent)
	if got := active.Load(); got != 0 {
		t.Fatalf("active executions after Close = %d, want 0", got)
	}
}

func newBurstScheduler(t *testing.T, due, nextDue time.Time, maxConcurrent int) (*LocalScheduler, chan struct{}, chan struct{}, chan []LocalScheduledJob, *atomic.Int32, *atomic.Int32) {
	t.Helper()
	const jobCount = 24
	executeStarted := make(chan struct{}, jobCount)
	executeStopped := make(chan struct{}, jobCount)
	reconciled := make(chan []LocalScheduledJob, 1)
	jobs := scheduledJobs(jobCount, due)
	var snapshotCalls atomic.Int32
	var active atomic.Int32
	var maximumActive atomic.Int32
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(_ context.Context, protected []LocalScheduledJob) ([]LocalScheduledJob, error) {
			if snapshotCalls.Add(1) == 1 {
				return jobs, nil
			}
			select {
			case reconciled <- append([]LocalScheduledJob(nil), protected...):
			default:
			}
			return scheduledJobs(jobCount, nextDue), nil
		},
		Claim: func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error) {
			return testClaim(nextDue), nil
		},
		Execute: func(ctx context.Context, _ LocalSchedulerClaimResult) {
			currentActive := active.Add(1)
			recordMaximum(&maximumActive, currentActive)
			executeStarted <- struct{}{}
			<-ctx.Done()
			active.Add(-1)
			executeStopped <- struct{}{}
		},
		MaxConcurrent: maxConcurrent,
	})
	return scheduler, executeStarted, executeStopped, reconciled, &active, &maximumActive
}

func recordMaximum(maximum *atomic.Int32, candidate int32) {
	for current := maximum.Load(); candidate > current; current = maximum.Load() {
		if maximum.CompareAndSwap(current, candidate) {
			return
		}
	}
}

func assertOverflowReconciled(t *testing.T, reconciled <-chan []LocalScheduledJob) string {
	t.Helper()
	select {
	case protected := <-reconciled:
		for index := range 24 {
			jobID := fmt.Sprintf("job-%d", index)
			if !containsJob(protected, jobID) {
				return jobID
			}
		}
		t.Fatal("reconciliation protected every burst occurrence")
	case <-time.After(time.Second):
		t.Fatal("overflow did not request reconciliation")
	}
	return ""
}

func containsJob(jobs []LocalScheduledJob, wantID string) bool {
	for _, job := range jobs {
		if job.ID == wantID {
			return true
		}
	}
	return false
}

func scheduledJobs(count int, due time.Time) []LocalScheduledJob {
	jobs := make([]LocalScheduledJob, count)
	for index := range jobs {
		jobs[index] = LocalScheduledJob{ID: fmt.Sprintf("job-%d", index), Status: "active", NextRunAt: due}
	}
	return jobs
}

func TestLocalScheduler_SkipsOccurrencesOlderThanDueCutoff(t *testing.T) {
	now := time.Now()
	due := now.Add(-localSchedulerDueCutoff - time.Second)
	nextDue := now.Add(time.Hour)
	claimCalls := make(chan struct{}, 1)
	scheduler := newLocalScheduler(t, LocalSchedulerOptions{
		Snapshot: func(context.Context, []LocalScheduledJob) ([]LocalScheduledJob, error) {
			return []LocalScheduledJob{{ID: "job", Status: "active", NextRunAt: nextDue}}, nil
		},
		Claim: func(context.Context, string, time.Time) (LocalSchedulerClaimResult, error) {
			claimCalls <- struct{}{}
			return LocalSchedulerClaimResult{}, nil
		},
		Execute: unexpectedExecute(t),
		Now:     func() time.Time { return now },
	})
	defer scheduler.Close()
	armTestTimer(scheduler, "job", due)
	scheduler.handleDue("job", due)
	waitForProtectedJob(t, scheduler, "job", nextDue)
	select {
	case <-claimCalls:
		t.Fatal("stale occurrence was claimed")
	case <-time.After(30 * time.Millisecond):
	}
}

func waitForClaims(t *testing.T, claims <-chan struct{}, want int) {
	t.Helper()
	for range want {
		select {
		case <-claims:
		case <-time.After(time.Second):
			t.Fatalf("claims did not reach %d", want)
		}
	}
}

func assertNoClaim(t *testing.T, claimCalls <-chan string) {
	t.Helper()
	select {
	case got := <-claimCalls:
		t.Fatalf("unexpected claim: %q", got)
	case <-time.After(30 * time.Millisecond):
	}
}
