package memory

import (
	"sync"
	"testing"
	"time"
)

// TestSummarizeQueueSerializesRuns covers the queue's core contract: at most
// one run is in flight per queue even with concurrent submits.
func TestSummarizeQueueSerializesRuns(t *testing.T) {
	q := &summarizeQueue{}
	var mu sync.Mutex
	inFlight := 0
	maxInFlight := 0

	run := func(req summarizeRequest) {
		mu.Lock()
		inFlight++
		if inFlight > maxInFlight {
			maxInFlight = inFlight
		}
		mu.Unlock()

		time.Sleep(5 * time.Millisecond)

		mu.Lock()
		inFlight--
		mu.Unlock()
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			q.submit(summarizeRequest{agent: "pi", worktreePath: "/ws"}, run)
		}(i)
	}
	wg.Wait()

	// Wait until the queue drains (all coalesced runs finished) before
	// asserting on the observed concurrency.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		q.mu.Lock()
		idle := !q.inFlight
		q.mu.Unlock()
		if idle {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	if maxInFlight != 1 {
		t.Fatalf("expected at most 1 concurrent run, saw %d", maxInFlight)
	}
}

// TestSummarizeQueueCoalescesPending covers the pending-overwrite rule: while
// a run is in flight, newer requests replace the pending one instead of
// stacking.
func TestSummarizeQueueCoalescesPending(t *testing.T) {
	q := &summarizeQueue{}

	var mu sync.Mutex
	ran := make([]string, 0)
	block := make(chan struct{})
	started := make(chan struct{})

	run := func(req summarizeRequest) {
		mu.Lock()
		ran = append(ran, req.worktreePath)
		mu.Unlock()
		if req.worktreePath == "first" {
			close(started)
			<-block
		}
	}

	go q.submit(summarizeRequest{worktreePath: "first"}, run)

	// Wait for the first run to start, then submit two successors while it is
	// blocked: only the newest should run afterward.
	<-started
	q.submit(summarizeRequest{worktreePath: "second"}, run)
	q.submit(summarizeRequest{worktreePath: "third"}, run)

	close(block)
	time.Sleep(50 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if len(ran) != 2 || ran[0] != "first" || ran[1] != "third" {
		t.Fatalf("expected first then newest pending to run, got %v", ran)
	}
}

// TestSummarizeQueueDrainsAfterIdle covers the shutdown exit path: once no
// request is pending and the in-flight run finishes, the queue returns to
// idle (inFlight false) and holds no goroutine.
func TestSummarizeQueueDrainsAfterIdle(t *testing.T) {
	q := &summarizeQueue{}
	ran := make(chan struct{}, 1)

	run := func(req summarizeRequest) {
		ran <- struct{}{}
	}

	q.submit(summarizeRequest{worktreePath: "one"}, run)
	<-ran

	// Poll until the queue drains (the run goroutine releases inFlight).
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		q.mu.Lock()
		idle := !q.inFlight
		q.mu.Unlock()
		if idle {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("queue did not drain back to idle after the run completed")
}

// TestSummarizeQueueAcceptsNewWorkAfterDrain covers restart after shutdown:
// a fresh submit after the queue drained starts a new run normally.
func TestSummarizeQueueAcceptsNewWorkAfterDrain(t *testing.T) {
	q := &summarizeQueue{}
	ran := make(chan struct{}, 2)

	run := func(req summarizeRequest) {
		ran <- struct{}{}
	}

	q.submit(summarizeRequest{worktreePath: "one"}, run)
	<-ran
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		q.mu.Lock()
		idle := !q.inFlight
		q.mu.Unlock()
		if idle {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	q.submit(summarizeRequest{worktreePath: "two"}, run)
	select {
	case <-ran:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatal("queue did not run the request submitted after drain")
	}
}
