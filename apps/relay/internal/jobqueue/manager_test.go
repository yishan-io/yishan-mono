package jobqueue

import (
	"errors"
	"sync"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Stub transport
// ---------------------------------------------------------------------------

type stubTransport struct {
	mu       sync.Mutex
	online   map[string]bool
	sent     []sentNotification
	sendFail bool // force SendNotificationWithError to fail
}

type sentNotification struct {
	nodeID string
	method string
	params any
}

func newStubTransport(onlineNodes ...string) *stubTransport {
	t := &stubTransport{online: make(map[string]bool)}
	for _, n := range onlineNodes {
		t.online[n] = true
	}
	return t
}

func (s *stubTransport) IsOnline(nodeID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.online[nodeID]
}

func (s *stubTransport) SendNotificationWithError(nodeID, method string, params any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sendFail {
		return errors.New("write tcp 127.0.0.1:8788->127.0.0.1:57575: i/o timeout")
	}
	s.sent = append(s.sent, sentNotification{nodeID: nodeID, method: method, params: params})
	return nil
}

func (s *stubTransport) setOnline(nodeID string, v bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.online[nodeID] = v
}

func (s *stubTransport) notifications() []sentNotification {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]sentNotification, len(s.sent))
	copy(out, s.sent)
	return out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newTestManager(transport *stubTransport) *Manager {
	return NewManager(transport, Config{
		AckTimeout:    100 * time.Millisecond,
		ResultTimeout: 100 * time.Millisecond,
		MaxRetries:    3,
	})
}

func dispatchRun(m *Manager, runID, jobID, nodeID string) DispatchResult {
	return m.Dispatch(DispatchParams{
		RunID:        runID,
		JobID:        jobID,
		NodeID:       nodeID,
		ScheduledFor: "2025-01-15T10:30:00Z",
		Payload:      map[string]any{"prompt": "hello"},
	})
}

// ---------------------------------------------------------------------------
// Dispatch tests
// ---------------------------------------------------------------------------

func TestDispatch_HappyPath(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)

	result := dispatchRun(m, "run-1", "job-1", "node-1")

	if !result.OK {
		t.Errorf("expected OK, got reason %q", result.Reason)
	}
	if result.RunID != "run-1" {
		t.Errorf("unexpected RunID %q", result.RunID)
	}

	run := m.GetRun("run-1")
	if run == nil {
		t.Fatal("GetRun returned nil")
	}
	if run.Status != StatusAwaitingAck {
		t.Errorf("expected StatusAwaitingAck, got %s", run.Status)
	}
	if run.Attempts != 1 {
		t.Errorf("expected 1 attempt, got %d", run.Attempts)
	}

	metrics := m.GetMetrics()
	if metrics.PendingDepth != 1 {
		t.Errorf("expected PendingDepth 1, got %d", metrics.PendingDepth)
	}
	if metrics.TotalDispatched != 1 {
		t.Errorf("expected TotalDispatched 1, got %d", metrics.TotalDispatched)
	}
	if metrics.AwaitingAck != 1 {
		t.Errorf("expected AwaitingAck 1, got %d", metrics.AwaitingAck)
	}

	notes := tr.notifications()
	if len(notes) != 1 || notes[0].method != jobRunMethod {
		t.Errorf("expected one job.run notification, got %v", notes)
	}
}

func TestDispatch_Duplicate(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)

	dispatchRun(m, "run-1", "job-1", "node-1")
	result := dispatchRun(m, "run-2", "job-1", "node-1") // same job + same minute → duplicate

	if result.Reason != "duplicate" {
		t.Errorf("expected duplicate, got reason %q", result.Reason)
	}
	if result.ExistingRunID != "run-1" {
		t.Errorf("expected ExistingRunID 'run-1', got %q", result.ExistingRunID)
	}
	if m.GetRun("run-2") != nil {
		t.Error("duplicate run should not be stored")
	}
}

func TestDispatch_NodeOffline(t *testing.T) {
	tr := newStubTransport() // no nodes online
	m := newTestManager(tr)

	result := dispatchRun(m, "run-1", "job-1", "node-1")

	if result.Reason != "node_offline" {
		t.Errorf("expected node_offline, got %q", result.Reason)
	}

	run := m.GetRun("run-1")
	if run == nil {
		t.Fatal("run should be stored even when offline")
	}
	if run.Status != StatusSkippedOffline {
		t.Errorf("expected StatusSkippedOffline, got %s", run.Status)
	}
	if run.CompletedAt == nil {
		t.Error("CompletedAt should be set for offline run")
	}

	metrics := m.GetMetrics()
	if metrics.TotalSkippedOffline != 1 {
		t.Errorf("expected TotalSkippedOffline 1, got %d", metrics.TotalSkippedOffline)
	}
	if metrics.PendingDepth != 0 {
		t.Errorf("expected PendingDepth 0 after offline skip, got %d", metrics.PendingDepth)
	}
}

func TestDispatch_SendFailure_ReturnsNodeOffline(t *testing.T) {
	tr := newStubTransport("node-1")
	tr.sendFail = true
	m := newTestManager(tr)

	result := dispatchRun(m, "run-1", "job-1", "node-1")

	if result.Reason != "node_offline" {
		t.Errorf("expected node_offline, got %q", result.Reason)
	}

	run := m.GetRun("run-1")
	if run.Status != StatusSkippedOffline {
		t.Errorf("expected StatusSkippedOffline, got %s", run.Status)
	}

	metrics := m.GetMetrics()
	if metrics.AwaitingAck != 0 {
		t.Errorf("AwaitingAck should be 0 after send failure, got %d", metrics.AwaitingAck)
	}
	if metrics.TotalSkippedOffline != 1 {
		t.Errorf("expected TotalSkippedOffline 1, got %d", metrics.TotalSkippedOffline)
	}
}

// ---------------------------------------------------------------------------
// HandleAck tests
// ---------------------------------------------------------------------------

func TestHandleAck_Accepted(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	run := m.GetRun("run-1")
	if run.Status != StatusAwaitingResult {
		t.Errorf("expected StatusAwaitingResult, got %s", run.Status)
	}
	if run.AckedAt == nil {
		t.Error("AckedAt should be set after accept")
	}

	metrics := m.GetMetrics()
	if metrics.AwaitingAck != 0 {
		t.Errorf("expected AwaitingAck 0, got %d", metrics.AwaitingAck)
	}
	if metrics.AwaitingResult != 1 {
		t.Errorf("expected AwaitingResult 1, got %d", metrics.AwaitingResult)
	}
}

func TestHandleAck_Rejected(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "rejected", Reason: "busy"})

	run := m.GetRun("run-1")
	if run.Status != StatusRejected {
		t.Errorf("expected StatusRejected, got %s", run.Status)
	}
	if run.LastError != "busy" {
		t.Errorf("expected LastError 'busy', got %q", run.LastError)
	}

	metrics := m.GetMetrics()
	if metrics.AwaitingAck != 0 {
		t.Errorf("expected AwaitingAck 0, got %d", metrics.AwaitingAck)
	}
	if metrics.TotalFailed != 1 {
		t.Errorf("expected TotalFailed 1, got %d", metrics.TotalFailed)
	}
	if metrics.PendingDepth != 0 {
		t.Errorf("expected PendingDepth 0, got %d", metrics.PendingDepth)
	}
}

func TestHandleAck_UnknownRun(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	// Should not panic.
	m.HandleAck("node-1", AckParams{RunID: "unknown", Status: "accepted"})
}

func TestHandleAck_WrongNode(t *testing.T) {
	tr := newStubTransport("node-1", "node-2")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	m.HandleAck("node-2", AckParams{RunID: "run-1", Status: "accepted"})

	// Status should not change — wrong node.
	run := m.GetRun("run-1")
	if run.Status != StatusAwaitingAck {
		t.Errorf("expected status unchanged (StatusAwaitingAck), got %s", run.Status)
	}
}

func TestHandleAck_StatusAlreadyAdvanced_GuardDoubleDec(t *testing.T) {
	// Simulate the timer callback racing with HandleAck.
	// Manually advance the status first, then call HandleAck.
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	// Accept the run to advance status to AwaitingResult.
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	awaitingAckBefore := m.GetMetrics().AwaitingAck

	// Now call HandleAck again (simulating a late/duplicate callback).
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	if m.GetMetrics().AwaitingAck != awaitingAckBefore {
		t.Error("AwaitingAck should not change when status is already past AwaitingAck")
	}
}

// ---------------------------------------------------------------------------
// HandleResult tests
// ---------------------------------------------------------------------------

func TestHandleResult_Completed(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	m.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed", DurationMs: 500})

	run := m.GetRun("run-1")
	if run.Status != StatusCompleted {
		t.Errorf("expected StatusCompleted, got %s", run.Status)
	}
	if run.CompletedAt == nil {
		t.Error("CompletedAt should be set")
	}

	metrics := m.GetMetrics()
	if metrics.TotalCompleted != 1 {
		t.Errorf("expected TotalCompleted 1, got %d", metrics.TotalCompleted)
	}
	if metrics.AwaitingResult != 0 {
		t.Errorf("expected AwaitingResult 0, got %d", metrics.AwaitingResult)
	}
	if metrics.PendingDepth != 0 {
		t.Errorf("expected PendingDepth 0, got %d", metrics.PendingDepth)
	}
}

func TestHandleResult_Failed(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	m.HandleResult("node-1", ResultParams{
		RunID:  "run-1",
		Status: "failed",
		Error:  &ResultError{Message: "timeout"},
	})

	run := m.GetRun("run-1")
	if run.Status != StatusFailed {
		t.Errorf("expected StatusFailed, got %s", run.Status)
	}
	if run.LastError != "timeout" {
		t.Errorf("expected LastError 'timeout', got %q", run.LastError)
	}

	metrics := m.GetMetrics()
	if metrics.TotalFailed != 1 {
		t.Errorf("expected TotalFailed 1, got %d", metrics.TotalFailed)
	}
}

func TestHandleResult_UnknownRun(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	// Should not panic.
	m.HandleResult("node-1", ResultParams{RunID: "unknown", Status: "completed"})
}

func TestHandleResult_WrongNode(t *testing.T) {
	tr := newStubTransport("node-1", "node-2")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	m.HandleResult("node-2", ResultParams{RunID: "run-1", Status: "completed"})

	// Status should not change — wrong node.
	run := m.GetRun("run-1")
	if run.Status != StatusAwaitingResult {
		t.Errorf("expected StatusAwaitingResult unchanged, got %s", run.Status)
	}
}

// ---------------------------------------------------------------------------
// HandleNodeDisconnect tests
// ---------------------------------------------------------------------------

func TestHandleNodeDisconnect_AwaitingAck_QueuesRetry(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	// Node goes offline — disconnect, then reconnect for immediate retry.
	tr.setOnline("node-1", false)
	m.HandleNodeDisconnect("node-1")

	run := m.GetRun("run-1")
	if run.Status != StatusRetrying && run.Status != StatusFailed {
		t.Errorf("expected StatusRetrying or StatusFailed after disconnect, got %s", run.Status)
	}
	// AwaitingAck should be 0 (cleared by disconnect handling).
	metrics := m.GetMetrics()
	if metrics.AwaitingAck != 0 {
		t.Errorf("expected AwaitingAck 0 after disconnect, got %d", metrics.AwaitingAck)
	}
}

func TestHandleNodeDisconnect_AwaitingResult_FailsRun(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	m.HandleNodeDisconnect("node-1")

	run := m.GetRun("run-1")
	if run.Status != StatusFailed {
		t.Errorf("expected StatusFailed when disconnect during execution, got %s", run.Status)
	}
	if run.LastError != "node disconnected during execution" {
		t.Errorf("unexpected LastError: %q", run.LastError)
	}

	metrics := m.GetMetrics()
	if metrics.AwaitingResult != 0 {
		t.Errorf("expected AwaitingResult 0, got %d", metrics.AwaitingResult)
	}
}

// ---------------------------------------------------------------------------
// HandleNodeReconnect tests
// ---------------------------------------------------------------------------

func TestHandleNodeReconnect_RetriesQueuedRuns(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	// Force run into retrying state by failing it and scheduling retry.
	tr.setOnline("node-1", false)
	m.HandleNodeDisconnect("node-1")

	// Now node comes back.
	tr.setOnline("node-1", true)
	m.HandleNodeReconnect("node-1")

	run := m.GetRun("run-1")
	// After reconnect, the run should either be re-dispatched (AwaitingAck) or failed.
	if run.Status == StatusRetrying {
		t.Error("run should have been dispatched on reconnect, not still retrying")
	}
}

// ---------------------------------------------------------------------------
// Retry / scheduleRetry tests
// ---------------------------------------------------------------------------

func TestScheduleRetry_MaxRetriesExceeded(t *testing.T) {
	tr := newStubTransport("node-1")
	m := NewManager(tr, Config{
		AckTimeout:    10 * time.Millisecond,
		ResultTimeout: 100 * time.Millisecond,
		MaxRetries:    1, // low to hit the limit quickly
	})
	dispatchRun(m, "run-1", "job-1", "node-1")

	// Exhaust retries by disconnecting repeatedly.
	for i := 0; i < 2; i++ {
		tr.setOnline("node-1", false)
		m.HandleNodeDisconnect("node-1")
		tr.setOnline("node-1", true)
		m.HandleNodeReconnect("node-1")
	}

	run := m.GetRun("run-1")
	if run.Status != StatusFailed {
		t.Errorf("expected StatusFailed after exceeding retries, got %s", run.Status)
	}
	if run.LastError == "" {
		t.Error("LastError should be set on max retries exceeded")
	}
}

func TestAckTimeout_RetriesRun(t *testing.T) {
	tr := newStubTransport("node-1")
	m := NewManager(tr, Config{
		AckTimeout:    20 * time.Millisecond,
		ResultTimeout: time.Second,
		MaxRetries:    2,
	})
	dispatchRun(m, "run-1", "job-1", "node-1")

	// Wait for ack timer to fire.
	time.Sleep(50 * time.Millisecond)

	run := m.GetRun("run-1")
	// After ack timeout the run should be retrying or re-dispatched (attempt ≥ 2).
	if run.Status == StatusAwaitingAck && run.Attempts == 1 {
		t.Error("ack timeout should have advanced the run (retry or fail)")
	}
}

func TestResultTimeout_FailsRun(t *testing.T) {
	tr := newStubTransport("node-1")
	m := NewManager(tr, Config{
		AckTimeout:    time.Second,
		ResultTimeout: 20 * time.Millisecond,
		MaxRetries:    3,
	})
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	// Wait for result timer to fire.
	time.Sleep(50 * time.Millisecond)

	run := m.GetRun("run-1")
	if run.Status != StatusFailed {
		t.Errorf("expected StatusFailed after result timeout, got %s", run.Status)
	}
	if run.LastError != "result timeout" {
		t.Errorf("expected LastError 'result timeout', got %q", run.LastError)
	}
	if m.GetMetrics().AwaitingResult != 0 {
		t.Error("AwaitingResult should be 0 after result timeout")
	}
}

// ---------------------------------------------------------------------------
// GetRun / GetRunsForNode tests
// ---------------------------------------------------------------------------

func TestGetRun_UnknownRunID_ReturnsNil(t *testing.T) {
	m := newTestManager(newStubTransport())
	if m.GetRun("unknown") != nil {
		t.Error("GetRun should return nil for unknown runID")
	}
}

func TestGetRunsForNode(t *testing.T) {
	tr := newStubTransport("node-1", "node-2")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	dispatchRun(m, "run-2", "job-2", "node-1")
	dispatchRun(m, "run-3", "job-3", "node-2")

	runs := m.GetRunsForNode("node-1")
	if len(runs) != 2 {
		t.Errorf("expected 2 runs for node-1, got %d", len(runs))
	}
	runs2 := m.GetRunsForNode("unknown")
	if len(runs2) != 0 {
		t.Errorf("expected 0 runs for unknown node, got %d", len(runs2))
	}
}

// ---------------------------------------------------------------------------
// PruneCompleted tests
// ---------------------------------------------------------------------------

func TestPruneCompleted_RemovesOldRuns(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})
	m.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed"})

	// Prune with maxAge=0 removes the completed run.
	n := m.PruneCompleted(0)
	if n != 1 {
		t.Errorf("expected 1 pruned run, got %d", n)
	}
	if m.GetRun("run-1") != nil {
		t.Error("pruned run should not be retrievable")
	}
}

func TestPruneCompleted_KeepsActiveRuns(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-active", "job-a", "node-1")

	n := m.PruneCompleted(0)
	if n != 0 {
		t.Errorf("expected 0 pruned (active run), got %d", n)
	}
	if m.GetRun("run-active") == nil {
		t.Error("active run should not be pruned")
	}
}

func TestPruneCompleted_ClearsIdempotencyIndex(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})
	m.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed"})

	m.PruneCompleted(0)

	// Now dispatching the same job again should succeed (idempotency key cleared).
	result := dispatchRun(m, "run-2", "job-1", "node-1")
	if !result.OK {
		t.Errorf("expected OK after pruning idempotency key, got %q", result.Reason)
	}
}

// ---------------------------------------------------------------------------
// Metrics tests
// ---------------------------------------------------------------------------

func TestGetMetrics_ConsistentSnapshot(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)

	dispatchRun(m, "run-1", "job-1", "node-1")
	dispatchRun(m, "run-2", "job-2", "node-1")
	m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	metrics := m.GetMetrics()
	if metrics.PendingDepth != 2 {
		t.Errorf("expected PendingDepth 2, got %d", metrics.PendingDepth)
	}
	if metrics.AwaitingAck != 1 {
		t.Errorf("expected AwaitingAck 1, got %d", metrics.AwaitingAck)
	}
	if metrics.AwaitingResult != 1 {
		t.Errorf("expected AwaitingResult 1, got %d", metrics.AwaitingResult)
	}
	if metrics.TotalDispatched != 2 {
		t.Errorf("expected TotalDispatched 2, got %d", metrics.TotalDispatched)
	}
}
