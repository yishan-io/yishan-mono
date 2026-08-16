package memory

import "sync"

// summarizeQueue is the single owner of per-context-root summarization
// serialization: it ensures at most one summarization is in flight per
// context root while coalescing additional requests into a single pending
// retry. The run loop drains itself when no request is pending, so an idle
// queue holds no goroutine.
type summarizeQueue struct {
	mu       sync.Mutex
	inFlight bool
	pending  *summarizeRequest // at most one pending; newer replaces older
}

// summarizeRequest is one queued session-summarization request.
type summarizeRequest struct {
	agent        string
	worktreePath string
	projectID    string
}

// submit enqueues a request and runs it (plus any coalesced successor) on a
// single goroutine. While a summarization is in flight, newer requests for
// the same root replace the pending one — the in-flight run re-reads
// MEMORY.md when it finishes, so the latest session data is what matters.
func (q *summarizeQueue) submit(req summarizeRequest, run func(summarizeRequest)) {
	q.mu.Lock()
	if q.inFlight {
		// A summarization is already running for this root.
		// Overwrite any pending request with the newer one — the in-flight
		// summarization will re-read MEMORY.md when it finishes, so the
		// latest session data is what matters.
		q.pending = &req
		q.mu.Unlock()
		return
	}
	q.inFlight = true
	q.mu.Unlock()

	go func() {
		for {
			run(req)

			q.mu.Lock()
			next := q.pending
			q.pending = nil
			if next == nil {
				q.inFlight = false
				q.mu.Unlock()
				return
			}
			req = *next
			q.mu.Unlock()
		}
	}()
}
