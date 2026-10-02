package jobqueue

import (
	"sync"
	"testing"
	"time"

	relayprotocol "yishan/packages/relay-protocol-go"
)

func TestRetryOwnership_ConcurrentTimeoutDisconnectAndReconnectDispatchesOnce(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	if result := dispatchRun(manager, "run-1", "job-1", "node-1"); !result.OK {
		t.Fatalf("dispatch: expected OK, got %+v", result)
	}
	transport.setOnline("node-1", false)

	manager.mu.Lock()
	run := manager.runs["run-1"]
	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	waitGroup.Add(2)
	go func() {
		defer waitGroup.Done()
		<-start
		manager.handleAckTimeout(run, run.attemptGeneration)
	}()
	go func() {
		defer waitGroup.Done()
		<-start
		manager.HandleNodeDisconnect("node-1")
	}()
	close(start)
	manager.mu.Unlock()
	waitGroup.Wait()

	transport.setOnline("node-1", true)
	manager.HandleNodeReconnect("node-1")

	if notifications := transport.notifications(); len(notifications) != 2 {
		t.Fatalf("expected initial dispatch and one retry, got %d notifications", len(notifications))
	}
	stored := manager.GetRun("run-1")
	if stored.Status != StatusAwaitingAck || stored.Attempts != 2 {
		t.Fatalf("expected second attempt awaiting ack, got status=%s attempts=%d", stored.Status, stored.Attempts)
	}
	metrics := manager.GetMetrics()
	if metrics.PendingDepth != 1 || metrics.AwaitingAck != 1 || metrics.TotalRetries != 1 {
		t.Errorf("unexpected metrics after retry ownership race: %+v", metrics)
	}
}

type ackOnSendTransport struct {
	manager       *Manager
	notifications int
}

func (t *ackOnSendTransport) IsOnline(string) bool { return true }

func (t *ackOnSendTransport) SendNotificationWithError(nodeID, _ string, params any) error {
	t.notifications++
	runID := params.(relayprotocol.JobRunParams).RunID
	t.manager.HandleAck(nodeID, AckParams{RunID: runID, Status: "accepted"})
	return nil
}

func TestAttemptDispatch_AckDuringSendDoesNotInstallStaleAckTimer(t *testing.T) {
	transport := &ackOnSendTransport{}
	manager := NewManager(transport, Config{AckTimeout: 5 * time.Millisecond, ResultTimeout: time.Second, MaxRetries: 3})
	transport.manager = manager

	result := dispatchRun(manager, "run-1", "job-1", "node-1")
	if !result.OK {
		t.Fatalf("dispatch: expected OK, got %+v", result)
	}
	time.Sleep(20 * time.Millisecond)

	stored := manager.GetRun("run-1")
	if stored.Status != StatusAwaitingResult {
		t.Fatalf("expected accepted run to await a result, got %s", stored.Status)
	}
	metrics := manager.GetMetrics()
	if metrics.PendingDepth != 1 || metrics.AwaitingAck != 0 || metrics.AwaitingResult != 1 {
		t.Errorf("unexpected metrics after ack during send: %+v", metrics)
	}
	manager.mu.RLock()
	ackTimerCount := len(manager.ackTimers)
	manager.mu.RUnlock()
	if ackTimerCount != 0 || transport.notifications != 1 {
		t.Errorf("expected one notification and no stale ack timer, got notifications=%d timers=%d", transport.notifications, ackTimerCount)
	}
}

func TestDispatchInitial_LostOwnershipAfterDisconnectReconnectDoesNotSendStaleAttempt(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	run := createDispatchingRun(t, manager)

	transport.setOnline("node-1", false)
	manager.HandleNodeDisconnect("node-1")
	transport.setOnline("node-1", true)
	manager.HandleNodeReconnect("node-1")

	result := manager.dispatchInitial(run, true)
	if !result.OK || result.Reason != "" {
		t.Fatalf("expected ownership-loss no-op, got %+v", result)
	}
	if notifications := transport.notifications(); len(notifications) != 1 {
		t.Fatalf("expected only the reconnect retry notification, got %d", len(notifications))
	}
	stored := manager.GetRun("run-1")
	if stored.Status != StatusAwaitingAck || stored.Attempts != 1 {
		t.Fatalf("expected reconnect retry to remain awaiting ack, got status=%s attempts=%d", stored.Status, stored.Attempts)
	}
	metrics := manager.GetMetrics()
	if metrics.PendingDepth != 1 || metrics.AwaitingAck != 1 || metrics.TotalDispatched != 1 ||
		metrics.TotalRetries != 1 || metrics.TotalSkippedOffline != 0 {
		t.Errorf("unexpected metrics after initial ownership loss: %+v", metrics)
	}
}

func TestDispatchInitial_OfflineBranchDoesNotOverwriteRetry(t *testing.T) {
	transport := newStubTransport()
	manager := newTestManager(transport)
	run := createDispatchingRun(t, manager)

	manager.HandleNodeDisconnect("node-1")
	result := manager.dispatchInitial(run, false)

	if !result.OK || result.Reason != "" {
		t.Fatalf("expected ownership-loss no-op rather than node_offline, got %+v", result)
	}
	stored := manager.GetRun("run-1")
	if stored.Status != StatusRetrying {
		t.Fatalf("expected claimed retry to remain queued, got %s", stored.Status)
	}
	if notifications := transport.notifications(); len(notifications) != 0 {
		t.Fatalf("expected no notification while retry is queued offline, got %d", len(notifications))
	}
	metrics := manager.GetMetrics()
	if metrics.PendingDepth != 1 || metrics.AwaitingAck != 0 || metrics.TotalDispatched != 0 ||
		metrics.TotalRetries != 1 || metrics.TotalSkippedOffline != 0 {
		t.Errorf("unexpected metrics after offline ownership loss: %+v", metrics)
	}
}

func createDispatchingRun(t *testing.T, manager *Manager) *PendingRun {
	t.Helper()
	payloadHash, payload, err := snapshotPayload(map[string]any{"prompt": "hello"})
	if err != nil {
		t.Fatalf("snapshot payload: %v", err)
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.createRunLocked(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: payload,
	}, payloadHash, payload)
}
