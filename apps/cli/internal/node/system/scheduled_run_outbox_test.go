package system

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestScheduledRunOutboxRunner_RecoverFinalizesInterruptedRunsAndRetriesFinishedDelivery(t *testing.T) {
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{
		{RunID: "claimed", NodeID: "node-1", State: ScheduledRunOutboxStateClaimed},
		{RunID: "started", NodeID: "node-1", State: ScheduledRunOutboxStateStarted},
		{RunID: "finished", NodeID: "node-1", State: ScheduledRunOutboxStateFinished, Result: ScheduledRunOutboxResult{Status: "succeeded", ResponseBody: "saved"}},
	}}
	var starts []string
	var completes []string
	failedFinishedDelivery := false
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			starts = append(starts, row.RunID)
			return nil
		},
		Complete: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			completes = append(completes, row.RunID)
			if row.RunID == "finished" && !failedFinishedDelivery {
				failedFinishedDelivery = true
				return errors.New("temporarily unavailable")
			}
			return nil
		},
		RetryInitial: time.Nanosecond,
		RetryMax:     time.Nanosecond,
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	if err := runner.Recover(context.Background()); err != nil {
		t.Fatalf("recover outbox: %v", err)
	}
	if got, want := starts, []string{"claimed", "started"}; !sameStrings(got, want) {
		t.Fatalf("starts = %v, want %v", got, want)
	}
	if got, want := completes, []string{"claimed", "started", "finished", "finished"}; !sameStrings(got, want) {
		t.Fatalf("completes = %v, want %v", got, want)
	}
	for _, runID := range []string{"claimed", "started"} {
		result, exists := store.results[runID]
		if !exists || result.Status != "failed" || result.ErrorCode != ScheduledRunOutboxDaemonInterruptedCode {
			t.Fatalf("recovered %q result = %+v, exists = %t", runID, result, exists)
		}
	}
	if got, want := store.delivered, []string{"claimed", "started", "finished"}; !sameStrings(got, want) {
		t.Fatalf("delivered = %v, want %v", got, want)
	}
}

func TestScheduledRunOutboxRunner_RecoverPersistsAndAcknowledgesStartRejectionsLocally(t *testing.T) {
	startRejectedErr := errors.New("start rejected")
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{
		{RunID: "rejected-start", State: ScheduledRunOutboxStateClaimed},
		{RunID: "rejected-finished", State: ScheduledRunOutboxStateFinished, Result: ScheduledRunOutboxResult{Status: "rejected"}},
		{RunID: "completed-finished", State: ScheduledRunOutboxStateFinished, Result: ScheduledRunOutboxResult{Status: "succeeded"}},
	}}
	var completeCalls []string
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			if row.RunID == "rejected-start" {
				return startRejectedErr
			}
			return nil
		},
		Complete: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			completeCalls = append(completeCalls, row.RunID)
			return nil
		},
		IsStartRejected: func(err error) bool { return errors.Is(err, startRejectedErr) },
		RetryInitial:    time.Nanosecond,
		RetryMax:        time.Nanosecond,
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	if err := runner.Recover(context.Background()); err != nil {
		t.Fatalf("recover outbox: %v", err)
	}
	result, exists := store.results["rejected-start"]
	if !exists || result.Status != "rejected" || result.ErrorCode != ScheduledRunOutboxStartRejectedCode {
		t.Fatalf("rejected start result = %+v, exists = %t", result, exists)
	}
	if got, want := completeCalls, []string{"completed-finished"}; !sameStrings(got, want) {
		t.Fatalf("complete calls = %v, want %v", got, want)
	}
	if got, want := store.delivered, []string{"rejected-start", "rejected-finished", "completed-finished"}; !sameStrings(got, want) {
		t.Fatalf("delivered = %v, want %v", got, want)
	}
}

func TestScheduledRunOutboxRunner_RecoverEligibleSkipsIneligibleRows(t *testing.T) {
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{
		{RunID: "active-claimed", State: ScheduledRunOutboxStateClaimed},
		{RunID: "active-started", State: ScheduledRunOutboxStateStarted},
		{RunID: "active-finished", State: ScheduledRunOutboxStateFinished},
		{RunID: "idle-claimed", State: ScheduledRunOutboxStateClaimed},
		{RunID: "idle-finished", State: ScheduledRunOutboxStateFinished},
	}}
	var starts []string
	var completes []string
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			starts = append(starts, row.RunID)
			return nil
		},
		Complete: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			completes = append(completes, row.RunID)
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	err = runner.RecoverEligible(context.Background(), func(row ScheduledRunOutboxRow) bool {
		return row.RunID != "active-claimed" && row.RunID != "active-started" && row.RunID != "active-finished"
	})
	if err != nil {
		t.Fatalf("recover eligible outbox: %v", err)
	}
	if got, want := starts, []string{"idle-claimed"}; !sameStrings(got, want) {
		t.Fatalf("starts = %v, want %v", got, want)
	}
	if got, want := completes, []string{"idle-claimed", "idle-finished"}; !sameStrings(got, want) {
		t.Fatalf("completes = %v, want %v", got, want)
	}
	if got, want := store.delivered, []string{"idle-claimed", "idle-finished"}; !sameStrings(got, want) {
		t.Fatalf("delivered = %v, want %v", got, want)
	}
	if len(store.results) != 1 || store.results["idle-claimed"].ErrorCode != ScheduledRunOutboxDaemonInterruptedCode {
		t.Fatalf("results = %v, want only idle claimed interruption", store.results)
	}
}

func TestScheduledRunOutboxRunner_RecoverContinuesAfterPermanentError(t *testing.T) {
	permanentErr := errors.New("access denied")
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{
		{RunID: "permanent", State: ScheduledRunOutboxStateFinished},
		{RunID: "later", State: ScheduledRunOutboxStateFinished},
	}}
	completeCalls := 0
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(context.Context, ScheduledRunOutboxRow, time.Time) error { return nil },
		Complete: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			completeCalls++
			if row.RunID == "permanent" {
				return permanentErr
			}
			return nil
		},
		IsRetryable:  func(err error) bool { return !errors.Is(err, permanentErr) },
		RetryInitial: time.Nanosecond,
		RetryMax:     time.Nanosecond,
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	err = runner.Recover(context.Background())
	if !errors.Is(err, permanentErr) {
		t.Fatalf("recover error = %v, want permanent error", err)
	}
	if completeCalls != 2 {
		t.Fatalf("complete calls = %d, want 2", completeCalls)
	}
	if got, want := store.delivered, []string{"later"}; !sameStrings(got, want) {
		t.Fatalf("delivered = %v, want %v", got, want)
	}
}

func TestScheduledRunOutboxRunner_RecoverJoinsPermanentErrors(t *testing.T) {
	firstErr := errors.New("access denied")
	secondErr := errors.New("invalid request")
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{
		{RunID: "first", State: ScheduledRunOutboxStateFinished},
		{RunID: "second", State: ScheduledRunOutboxStateFinished},
	}}
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(context.Context, ScheduledRunOutboxRow, time.Time) error { return nil },
		Complete: func(_ context.Context, row ScheduledRunOutboxRow, _ time.Time) error {
			if row.RunID == "first" {
				return firstErr
			}
			return secondErr
		},
		IsRetryable: func(err error) bool {
			return !errors.Is(err, firstErr) && !errors.Is(err, secondErr)
		},
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	err = runner.Recover(context.Background())
	if !errors.Is(err, firstErr) || !errors.Is(err, secondErr) {
		t.Fatalf("recover error = %v, want both permanent errors", err)
	}
}

func TestScheduledRunOutboxRunner_RecoverRetriesTransientError(t *testing.T) {
	transientErr := errors.New("service unavailable")
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{{RunID: "finished", State: ScheduledRunOutboxStateFinished}}}
	completeCalls := 0
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(context.Context, ScheduledRunOutboxRow, time.Time) error { return nil },
		Complete: func(context.Context, ScheduledRunOutboxRow, time.Time) error {
			completeCalls++
			if completeCalls == 1 {
				return transientErr
			}
			return nil
		},
		IsRetryable:  func(err error) bool { return errors.Is(err, transientErr) },
		RetryInitial: time.Nanosecond,
		RetryMax:     time.Nanosecond,
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	if err := runner.Recover(context.Background()); err != nil {
		t.Fatalf("recover outbox: %v", err)
	}
	if completeCalls != 2 {
		t.Fatalf("complete calls = %d, want 2", completeCalls)
	}
}

func TestScheduledRunOutboxRunner_RecoverDoesNotSaveResultWhenStartCancelsContext(t *testing.T) {
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{{RunID: "claimed", State: ScheduledRunOutboxStateClaimed}}}
	ctx, cancel := context.WithCancel(context.Background())
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(context.Context, ScheduledRunOutboxRow, time.Time) error {
			cancel()
			return nil
		},
		Complete: func(context.Context, ScheduledRunOutboxRow, time.Time) error { return nil },
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	if err := runner.Recover(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("recover error = %v, want context canceled", err)
	}
	if len(store.results) != 0 {
		t.Fatalf("results = %v, want no result after cancellation", store.results)
	}
}

func TestScheduledRunOutboxRunner_RecoverDoesNotMarkDeliveredWhenCompleteCancelsContext(t *testing.T) {
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{{RunID: "finished", State: ScheduledRunOutboxStateFinished}}}
	ctx, cancel := context.WithCancel(context.Background())
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(context.Context, ScheduledRunOutboxRow, time.Time) error { return nil },
		Complete: func(context.Context, ScheduledRunOutboxRow, time.Time) error {
			cancel()
			return nil
		},
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	if err := runner.Recover(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("recover error = %v, want context canceled", err)
	}
	if len(store.delivered) != 0 {
		t.Fatalf("delivered = %v, want no delivery after cancellation", store.delivered)
	}
}

func TestScheduledRunOutboxRunner_RecoverStopsRetryingWhenContextIsCanceled(t *testing.T) {
	store := &fakeScheduledRunOutboxStore{rows: []ScheduledRunOutboxRow{{RunID: "finished", State: ScheduledRunOutboxStateFinished}}}
	ctx, cancel := context.WithCancel(context.Background())
	runner, err := NewScheduledRunOutboxRunner(ScheduledRunOutboxRunnerOptions{
		Store: store,
		Start: func(context.Context, ScheduledRunOutboxRow, time.Time) error { return nil },
		Complete: func(context.Context, ScheduledRunOutboxRow, time.Time) error {
			cancel()
			return errors.New("unavailable")
		},
		RetryInitial: time.Hour,
		RetryMax:     time.Hour,
	})
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}
	if err := runner.Recover(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("recover error = %v, want context canceled", err)
	}
	if len(store.delivered) != 0 {
		t.Fatalf("delivered = %v, want no delivery without acknowledgement", store.delivered)
	}
}

type fakeScheduledRunOutboxStore struct {
	mu        sync.Mutex
	rows      []ScheduledRunOutboxRow
	results   map[string]ScheduledRunOutboxResult
	delivered []string
}

func (s *fakeScheduledRunOutboxStore) ListUndelivered(context.Context) ([]ScheduledRunOutboxRow, error) {
	return append([]ScheduledRunOutboxRow(nil), s.rows...), nil
}

func (s *fakeScheduledRunOutboxStore) SaveResult(_ context.Context, runID string, result ScheduledRunOutboxResult, _ time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.results == nil {
		s.results = make(map[string]ScheduledRunOutboxResult)
	}
	s.results[runID] = result
	return true, nil
}

func (s *fakeScheduledRunOutboxStore) MarkDelivered(_ context.Context, runID string, _ time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.delivered = append(s.delivered, runID)
	return true, nil
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}
