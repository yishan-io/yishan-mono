package agent

import (
	"sync"
	"testing"

	"yishan/apps/cli/internal/rpc"
)

func TestRuntimeIdentityRegistry_ConcurrentPiAndDSHClaimSameSession(t *testing.T) {
	registry := newRuntimeIdentityRegistry()
	start := make(chan struct{})
	results := make(chan runtimeIdentityClaim, 2)
	var group sync.WaitGroup
	for _, runtime := range []rpc.AgentRuntime{rpc.AgentRuntimePi, rpc.AgentRuntimeDSH} {
		group.Add(1)
		go func(runtime rpc.AgentRuntime) {
			defer group.Done()
			<-start
			claim, err := registry.claim("same-session", runtime)
			if err != nil {
				t.Errorf("claim %s: %v", runtime, err)
				return
			}
			results <- claim
		}(runtime)
	}
	close(start)
	group.Wait()
	close(results)

	for claim := range results {
		if !claim.isFresh {
			t.Fatal("concurrent runtime claim was not fresh")
		}
	}
	registry.release("same-session", rpc.AgentRuntimePi)
	claim, err := registry.claim("same-session", rpc.AgentRuntimePi)
	if err != nil || !claim.isFresh {
		t.Fatalf("Pi claim after Pi release = %#v, %v", claim, err)
	}
	if _, err := registry.acquireDSHStart("same-session"); err == nil {
		t.Fatal("Pi release removed the active DSH identity")
	}
}
