package jobqueue

import (
	"sync"
	"testing"
	"time"
)

func TestHandleResult_DuplicatePreservesTerminalMetrics(t *testing.T) {
	manager := newTestManager(newStubTransport("node-1"))
	if dispatch := dispatchRun(manager, "run-1", "job-1", "node-1"); !dispatch.OK {
		t.Fatalf("dispatch: expected OK, got %+v", dispatch)
	}
	manager.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	manager.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed"})
	manager.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "failed"})

	run := manager.GetRun("run-1")
	if run.Status != StatusCompleted {
		t.Errorf("expected first result to remain terminal, got %s", run.Status)
	}
	metrics := manager.GetMetrics()
	if metrics.PendingDepth != 0 || metrics.AwaitingResult != 0 || metrics.TotalCompleted != 1 || metrics.TotalFailed != 0 {
		t.Errorf("duplicate result changed terminal metrics: %+v", metrics)
	}
}

func TestHandleResult_ResultAndTimeoutTransitionOnce(t *testing.T) {
	manager := NewManager(newStubTransport("node-1"), Config{AckTimeout: time.Hour, ResultTimeout: time.Hour, MaxRetries: 3})
	if dispatch := dispatchRun(manager, "run-1", "job-1", "node-1"); !dispatch.OK {
		t.Fatalf("dispatch: expected OK, got %+v", dispatch)
	}
	manager.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})

	manager.mu.RLock()
	run := manager.runs["run-1"]
	timer := manager.resultTimers["run-1"]
	manager.mu.RUnlock()
	defer timer.Stop()
	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	waitGroup.Add(2)
	go func() {
		defer waitGroup.Done()
		<-start
		manager.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed"})
	}()
	go func() {
		defer waitGroup.Done()
		<-start
		manager.handleResultTimeout(run)
	}()
	close(start)
	waitGroup.Wait()

	metrics := manager.GetMetrics()
	if metrics.PendingDepth != 0 || metrics.AwaitingResult != 0 || metrics.TotalCompleted+metrics.TotalFailed != 1 {
		t.Errorf("result and timeout should have one terminal transition: %+v", metrics)
	}
}

func TestStartResultTimer_ResultBeforeInstallationDoesNotCreateTimer(t *testing.T) {
	manager := NewManager(newStubTransport("node-1"), Config{AckTimeout: time.Hour, ResultTimeout: time.Hour, MaxRetries: 3})
	if dispatch := dispatchRun(manager, "run-1", "job-1", "node-1"); !dispatch.OK {
		t.Fatalf("dispatch: expected OK, got %+v", dispatch)
	}
	manager.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})
	manager.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed"})

	manager.mu.RLock()
	run := manager.runs["run-1"]
	manager.mu.RUnlock()
	manager.startResultTimer(run)

	manager.mu.RLock()
	resultTimerCount := len(manager.resultTimers)
	manager.mu.RUnlock()
	if resultTimerCount != 0 {
		t.Errorf("result after ack before timer installation left %d timer(s)", resultTimerCount)
	}
}
