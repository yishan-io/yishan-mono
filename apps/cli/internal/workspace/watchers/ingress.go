package watchers

import (
	"errors"
	"time"
)

// A finite queue falls back to the downstream empty-list full-refresh contract.
const ordinaryQueueLimit = 1024
const ordinaryBatchSize = gitIgnoreBatchSize
const ordinaryGenerationAttempts = 2

func (w *worktreeWatcher) enqueueOrdinaryPath(path string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.isClosed || w.hasOrdinaryOverflow {
		return
	}
	if w.ordinaryPending[path] || w.ordinaryInflight[path] {
		return
	}
	if w.ordinaryPending == nil {
		w.ordinaryPending = make(map[string]bool)
	}
	if len(w.ordinaryPending) >= ordinaryQueueLimit {
		w.ordinaryPending = nil
		w.ordinaryOrder = nil
		w.hasOrdinaryOverflow = true
	} else {
		w.ordinaryPending[path] = true
		w.ordinaryOrder = append(w.ordinaryOrder, path)
	}
	if !w.isOrdinaryActive && w.ordinaryTimer == nil {
		w.ordinaryTimer = time.AfterFunc(watcherDebounce, w.drainOrdinaryPaths)
	}
}

// Timers never slide. A retained path reaches the sink within two debounce
// intervals plus at most generationAttempts*(ceil(queueLimit/batchSize)+1) bounded batches and sink
// execution, excluding scheduler delay. Invalidation retries may extend this;
// repeated invalidations fail open with a full refresh instead of starving.
func (w *worktreeWatcher) drainOrdinaryPaths() {
	w.mu.Lock()
	w.ordinaryTimer = nil
	if w.isClosed || w.isOrdinaryActive {
		w.mu.Unlock()
		return
	}
	w.isOrdinaryActive = true
	w.mu.Unlock()
	for {
		paths, generation := w.takeOrdinaryBatch()
		if len(paths) == 0 {
			return
		}
		w.classifyOrdinaryBatch(paths, generation)
	}
}

func (w *worktreeWatcher) takeOrdinaryBatch() ([]string, uint64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.isClosed {
		w.isOrdinaryActive = false
		return nil, 0
	}
	if w.hasOrdinaryOverflow {
		w.hasOrdinaryOverflow = false
		w.hasChangedPathsOverflow = true
		w.appendFileChangeLocked("")
	}
	count := min(len(w.ordinaryOrder), ordinaryBatchSize)
	paths := append([]string(nil), w.ordinaryOrder[:count]...)
	w.ordinaryOrder = w.ordinaryOrder[count:]
	for _, path := range paths {
		delete(w.ordinaryPending, path)
	}
	w.ordinaryInflight = dedupePaths(paths)
	if len(paths) == 0 {
		w.isOrdinaryActive = false
	}
	return paths, w.ignoreGeneration
}

func (w *worktreeWatcher) classifyOrdinaryBatch(paths []string, generation uint64) {
	for attempt := 0; attempt < ordinaryGenerationAttempts; attempt++ {
		ignored, err := w.classifyGitIgnoredPaths(w.commandParent(), paths)
		w.mu.Lock()
		if w.isClosed {
			w.ordinaryInflight = nil
			w.mu.Unlock()
			return
		}
		if generation != w.ignoreGeneration || errors.Is(err, errIgnoreGenerationChanged) {
			generation = w.ignoreGeneration
			w.mu.Unlock()
			continue
		}
		w.ordinaryInflight = nil
		for _, path := range paths {
			if err != nil || !ignored[path] {
				w.appendFileChangeLocked(path)
			}
		}
		w.mu.Unlock()
		return
	}
	w.fallbackOrdinaryBatch()
}

func (w *worktreeWatcher) fallbackOrdinaryBatch() {
	w.mu.Lock()
	w.ordinaryInflight = nil
	if !w.isClosed {
		w.hasChangedPathsOverflow = true
		w.appendFileChangeLocked("")
	}
	w.mu.Unlock()
}
