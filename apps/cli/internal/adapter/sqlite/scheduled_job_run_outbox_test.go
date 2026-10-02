package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"sync"
	"testing"
	"time"
)

func TestScheduledJobRunOutbox_PersistsIdempotentLifecycleAcrossReopen(t *testing.T) {
	profileDir := t.TempDir()
	database, store := openMigratedScheduledJobRunOutboxStore(t, profileDir)
	claim := ScheduledJobRunOutboxClaim{RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: time.UnixMilli(1_700_000_000_000)}

	assertOutboxApplied(t, func() (bool, error) { return store.SaveClaim(context.Background(), claim) }, true)
	assertOutboxApplied(t, func() (bool, error) { return store.SaveClaim(context.Background(), claim) }, false)
	assertStartedOutboxRun(t, store, claim.RunID, time.UnixMilli(1_700_000_001_000))
	result := ScheduledJobRunOutboxResult{Status: "succeeded", ResponseBody: "completed"}
	assertFinishedOutboxRun(t, store, claim.RunID, result, time.UnixMilli(1_700_000_002_000))
	if err := database.Close(); err != nil {
		t.Fatalf("close database: %v", err)
	}

	reopened, reopenedStore := openMigratedScheduledJobRunOutboxStore(t, profileDir)
	t.Cleanup(func() { _ = reopened.Close() })
	rows, err := reopenedStore.ListUndelivered(context.Background())
	if err != nil {
		t.Fatalf("list undelivered rows: %v", err)
	}
	if len(rows) != 1 || rows[0].State != ScheduledJobRunOutboxStateFinished || rows[0].Result != result {
		t.Fatalf("persisted rows = %#v, want one finished result", rows)
	}
}

func TestScheduledJobRunOutbox_ConcurrentLifecycleOperationsAreIdempotent(t *testing.T) {
	profileDir := t.TempDir()
	firstDatabase, firstStore := openMigratedScheduledJobRunOutboxStore(t, profileDir)
	t.Cleanup(func() { _ = firstDatabase.Close() })
	secondDatabase, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open second database: %v", err)
	}
	t.Cleanup(func() { _ = secondDatabase.Close() })
	setOutboxBusyTimeout(t, firstDatabase)
	setOutboxBusyTimeout(t, secondDatabase)
	secondStore := NewScheduledJobRunOutboxStore(secondDatabase)
	claim := ScheduledJobRunOutboxClaim{RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: time.UnixMilli(1_700_000_000_000)}

	assertConcurrentOutboxClaim(t, firstStore, secondStore, claim)
	assertConcurrentOutboxStart(t, firstStore, secondStore, claim.RunID)
	winningResult := assertConcurrentOutboxResult(t, firstStore, secondStore, claim.RunID)
	assertUndeliveredOutboxResult(t, firstStore, claim.RunID, winningResult)
	assertConcurrentOutboxDelivery(t, firstStore, secondStore, claim.RunID)
	assertOutboxApplied(t, func() (bool, error) {
		return firstStore.MarkDelivered(context.Background(), claim.RunID, time.UnixMilli(1_700_000_003_000))
	}, false)
	assertNoUndeliveredOutboxRows(t, firstStore)
}

func TestScheduledJobRunOutbox_RetainsOnlyRecentDeliveredRowsAndHonorsCanceledContext(t *testing.T) {
	database, store := openMigratedScheduledJobRunOutboxStore(t, t.TempDir())
	t.Cleanup(func() { _ = database.Close() })
	claim := ScheduledJobRunOutboxClaim{RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: time.Now().UTC()}
	assertOutboxApplied(t, func() (bool, error) { return store.SaveClaim(context.Background(), claim) }, true)
	assertOutboxApplied(t, func() (bool, error) { return store.MarkStarted(context.Background(), claim.RunID, time.Now().UTC()) }, true)
	assertCanceledOutboxResultDoesNotPersist(t, store, claim.RunID)

	rows, err := store.ListUndelivered(context.Background())
	if err != nil {
		t.Fatalf("list after canceled result: %v", err)
	}
	if len(rows) != 1 || rows[0].State != ScheduledJobRunOutboxStateStarted {
		t.Fatalf("rows after canceled result = %#v, want unchanged started row", rows)
	}
	assertOutboxApplied(t, func() (bool, error) {
		return store.SaveResult(context.Background(), claim.RunID, ScheduledJobRunOutboxResult{Status: "failed"}, time.Now().UTC())
	}, true)
	seedExpiredDeliveredOutboxRow(t, database)
	assertOutboxApplied(t, func() (bool, error) { return store.MarkDelivered(context.Background(), claim.RunID, time.Now().UTC()) }, true)

	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM scheduled_job_run_outbox`).Scan(&count); err != nil {
		t.Fatalf("count outbox rows: %v", err)
	}
	if count != 1 {
		t.Fatalf("outbox row count = %d, want current delivered row only", count)
	}
}

const outboxConcurrentBusyTimeoutMilliseconds = 5_000

type outboxOperationOutcome struct {
	applied bool
	err     error
}

func setOutboxBusyTimeout(t *testing.T, database *sql.DB) {
	t.Helper()
	if _, err := database.Exec("PRAGMA busy_timeout = " + strconv.Itoa(outboxConcurrentBusyTimeoutMilliseconds)); err != nil {
		t.Fatalf("set SQLite busy timeout: %v", err)
	}
}

func runConcurrentOutboxOperations(operations ...func() (bool, error)) []outboxOperationOutcome {
	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	outcomes := make([]outboxOperationOutcome, len(operations))
	for index, operation := range operations {
		waitGroup.Add(1)
		go func(index int, operation func() (bool, error)) {
			defer waitGroup.Done()
			<-start
			outcomes[index].applied, outcomes[index].err = operation()
		}(index, operation)
	}
	close(start)
	waitGroup.Wait()
	return outcomes
}

func assertExactlyOneConcurrentOutboxOperationApplied(t *testing.T, outcomes []outboxOperationOutcome) int {
	t.Helper()
	winningIndex := -1
	for index, outcome := range outcomes {
		if outcome.err != nil {
			t.Fatalf("concurrent outbox operation %d error: %v", index, outcome.err)
		}
		if outcome.applied {
			if winningIndex >= 0 {
				t.Fatalf("concurrent outbox operations applied at indexes %d and %d; want exactly one", winningIndex, index)
			}
			winningIndex = index
		}
	}
	if winningIndex < 0 {
		t.Fatal("concurrent outbox operations applied zero times; want exactly one")
	}
	return winningIndex
}

func assertConcurrentOutboxClaim(t *testing.T, firstStore, secondStore *ScheduledJobRunOutboxStore, claim ScheduledJobRunOutboxClaim) {
	t.Helper()
	assertExactlyOneConcurrentOutboxOperationApplied(t, runConcurrentOutboxOperations(
		func() (bool, error) { return firstStore.SaveClaim(context.Background(), claim) },
		func() (bool, error) { return secondStore.SaveClaim(context.Background(), claim) },
	))
}

func assertConcurrentOutboxStart(t *testing.T, firstStore, secondStore *ScheduledJobRunOutboxStore, runID string) {
	t.Helper()
	startedAt := time.UnixMilli(1_700_000_001_000)
	assertExactlyOneConcurrentOutboxOperationApplied(t, runConcurrentOutboxOperations(
		func() (bool, error) { return firstStore.MarkStarted(context.Background(), runID, startedAt) },
		func() (bool, error) { return secondStore.MarkStarted(context.Background(), runID, startedAt) },
	))
}

func assertConcurrentOutboxResult(t *testing.T, firstStore, secondStore *ScheduledJobRunOutboxStore, runID string) ScheduledJobRunOutboxResult {
	t.Helper()
	results := []ScheduledJobRunOutboxResult{
		{Status: "succeeded", ResponseBody: "first result"},
		{Status: "failed", ErrorCode: "second result"},
	}
	finishedAt := time.UnixMilli(1_700_000_002_000)
	winningIndex := assertExactlyOneConcurrentOutboxOperationApplied(t, runConcurrentOutboxOperations(
		func() (bool, error) {
			return firstStore.SaveResult(context.Background(), runID, results[0], finishedAt)
		},
		func() (bool, error) {
			return secondStore.SaveResult(context.Background(), runID, results[1], finishedAt)
		},
	))
	return results[winningIndex]
}

func assertConcurrentOutboxDelivery(t *testing.T, firstStore, secondStore *ScheduledJobRunOutboxStore, runID string) {
	t.Helper()
	deliveredAt := time.UnixMilli(1_700_000_003_000)
	assertExactlyOneConcurrentOutboxOperationApplied(t, runConcurrentOutboxOperations(
		func() (bool, error) { return firstStore.MarkDelivered(context.Background(), runID, deliveredAt) },
		func() (bool, error) { return secondStore.MarkDelivered(context.Background(), runID, deliveredAt) },
	))
}

func assertUndeliveredOutboxResult(t *testing.T, store *ScheduledJobRunOutboxStore, runID string, want ScheduledJobRunOutboxResult) {
	t.Helper()
	rows, err := store.ListUndelivered(context.Background())
	if err != nil {
		t.Fatalf("list undelivered rows: %v", err)
	}
	if len(rows) != 1 || rows[0].RunID != runID || rows[0].Result != want {
		t.Fatalf("undelivered rows = %#v, want run %q with result %#v", rows, runID, want)
	}
}

func assertNoUndeliveredOutboxRows(t *testing.T, store *ScheduledJobRunOutboxStore) {
	t.Helper()
	rows, err := store.ListUndelivered(context.Background())
	if err != nil {
		t.Fatalf("list undelivered rows: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("undelivered rows = %#v, want none", rows)
	}
}

func openMigratedScheduledJobRunOutboxStore(t *testing.T, profileDir string) (*sql.DB, *ScheduledJobRunOutboxStore) {
	t.Helper()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := Migrate(database); err != nil {
		_ = database.Close()
		t.Fatalf("migrate database: %v", err)
	}
	return database, NewScheduledJobRunOutboxStore(database)
}

func assertStartedOutboxRun(t *testing.T, store *ScheduledJobRunOutboxStore, runID string, startedAt time.Time) {
	t.Helper()
	assertOutboxApplied(t, func() (bool, error) { return store.MarkStarted(context.Background(), runID, startedAt) }, true)
	assertOutboxApplied(t, func() (bool, error) { return store.MarkStarted(context.Background(), runID, startedAt) }, false)
}

func assertFinishedOutboxRun(t *testing.T, store *ScheduledJobRunOutboxStore, runID string, result ScheduledJobRunOutboxResult, finishedAt time.Time) {
	t.Helper()
	assertOutboxApplied(t, func() (bool, error) { return store.SaveResult(context.Background(), runID, result, finishedAt) }, true)
	assertOutboxApplied(t, func() (bool, error) { return store.SaveResult(context.Background(), runID, result, finishedAt) }, false)
}

func assertCanceledOutboxResultDoesNotPersist(t *testing.T, store *ScheduledJobRunOutboxStore, runID string) {
	t.Helper()
	canceledContext, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := store.SaveResult(canceledContext, runID, ScheduledJobRunOutboxResult{Status: "failed"}, time.Now().UTC())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("save result with canceled context error = %v, want context canceled", err)
	}
}

func seedExpiredDeliveredOutboxRow(t *testing.T, database *sql.DB) {
	t.Helper()
	deliveredAt := time.Now().Add(-ScheduledJobRunOutboxDeliveredRetention - time.Second).UnixMilli()
	_, err := database.Exec(`INSERT INTO scheduled_job_run_outbox
		(run_id, job_id, node_id, scheduled_for, state, result_status, response_body, error_code, error_message, updated_at, delivered_at)
		VALUES ('old', 'job-old', 'node-1', 1, 'finished', 'succeeded', '', '', '', ?, ?)`, deliveredAt, deliveredAt)
	if err != nil {
		t.Fatalf("seed expired delivered row: %v", err)
	}
}

func assertOutboxApplied(t *testing.T, operation func() (bool, error), want bool) {
	t.Helper()
	applied, err := operation()
	if err != nil || applied != want {
		t.Fatalf("applied = %t, error = %v; want %t, nil", applied, err, want)
	}
}
