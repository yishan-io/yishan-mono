package agent

import (
	"sync"

	"yishan/apps/cli/internal/rpc"
)

// runtimeIdentityRegistry reserves identities scoped to their runtime. A start
// claim is exclusive only within its runtime identity: the caller must complete
// it before another start can acquire that same identity.
type runtimeIdentityState uint8

const (
	runtimeIdentityStarting runtimeIdentityState = iota + 1
	runtimeIdentityOwned
	runtimeIdentityQuarantined
)

type runtimeIdentityClaim struct {
	isFresh       bool
	isQuarantined bool
	operation     uint64
}

type runtimeIdentityEntry struct {
	state     runtimeIdentityState
	operation uint64
}

type runtimeIdentityKey struct {
	runtime   rpc.AgentRuntime
	sessionID string
}

type runtimeIdentityRegistry struct {
	mu       sync.Mutex
	runtimes map[runtimeIdentityKey]runtimeIdentityEntry
}

func newRuntimeIdentityRegistry() *runtimeIdentityRegistry {
	return &runtimeIdentityRegistry{runtimes: make(map[runtimeIdentityKey]runtimeIdentityEntry)}
}

// claim reserves a runtime identity outside of a DSH start operation.
func (r *runtimeIdentityRegistry) claim(sessionID string, runtime rpc.AgentRuntime) (runtimeIdentityClaim, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := runtimeIdentityKey{runtime: runtime, sessionID: sessionID}
	entry, exists := r.runtimes[key]
	if !exists {
		r.runtimes[key] = runtimeIdentityEntry{state: runtimeIdentityOwned}
		return runtimeIdentityClaim{isFresh: true}, nil
	}
	return runtimeIdentityClaim{isQuarantined: entry.state == runtimeIdentityQuarantined}, nil
}

// acquireDSHStart atomically reserves the sole DSH start operation for
// sessionID. A fresh identity and a quarantined retry both enter starting.
func (r *runtimeIdentityRegistry) acquireDSHStart(sessionID string) (runtimeIdentityClaim, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := runtimeIdentityKey{runtime: rpc.AgentRuntimeDSH, sessionID: sessionID}
	entry, exists := r.runtimes[key]
	if !exists {
		entry = runtimeIdentityEntry{state: runtimeIdentityStarting, operation: 1}
		r.runtimes[key] = entry
		return runtimeIdentityClaim{isFresh: true, operation: entry.operation}, nil
	}
	if entry.state != runtimeIdentityQuarantined {
		return runtimeIdentityClaim{}, dshSessionConflict(sessionID)
	}
	entry.state = runtimeIdentityStarting
	entry.operation++
	r.runtimes[key] = entry
	return runtimeIdentityClaim{isQuarantined: true, operation: entry.operation}, nil
}

// completeStart applies a start operation outcome only when this caller still
// owns its operation token. Failed fresh starts release the identity. Failed
// quarantined retries return it to quarantine unless disposal was confirmed.
func (r *runtimeIdentityRegistry) completeStart(sessionID string, runtime rpc.AgentRuntime, claim runtimeIdentityClaim, isOwned bool, isQuarantined bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := runtimeIdentityKey{runtime: runtime, sessionID: sessionID}
	entry, exists := r.runtimes[key]
	if !exists || entry.state != runtimeIdentityStarting || entry.operation != claim.operation {
		return
	}
	if isOwned {
		entry.state = runtimeIdentityOwned
		r.runtimes[key] = entry
		return
	}
	if isQuarantined {
		entry.state = runtimeIdentityQuarantined
		r.runtimes[key] = entry
		return
	}
	delete(r.runtimes, key)
}

func (r *runtimeIdentityRegistry) release(sessionID string, runtime rpc.AgentRuntime) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.runtimes, runtimeIdentityKey{runtime: runtime, sessionID: sessionID})
}
