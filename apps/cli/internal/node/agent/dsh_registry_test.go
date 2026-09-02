package agent

import (
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

func TestDSHLiveRegistry_RebindInvalidatesOldPumpRoute(t *testing.T) {
	registry := newDSHLiveRegistry()
	connection := &rpc.Connection{}
	entry := &dshLiveSession{sessionID: "session", tabID: "tab", workspaceID: "workspace", instanceID: "old", connection: connection, subscription: dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate)}}
	oldBinding, registered := registry.register(entry)
	if !registered {
		t.Fatal("register")
	}
	newBinding, _, _, rebound := registry.rebind(entry, connection, dsh.SessionSubscription{InstanceID: "new", Updates: make(chan dsh.SessionUpdate)})
	if !rebound || newBinding.generation == oldBinding.generation {
		t.Fatalf("rebind = generation %d, rebound %t", newBinding.generation, rebound)
	}
	if _, found := registry.route(entry, oldBinding.generation); found {
		t.Fatal("old pump retained a route after rebind")
	}
	route, _, reset := registry.resetRoute(entry, newBinding.generation, "reset")
	if !reset {
		t.Fatal("reset route")
	}
	if entry.instanceID != "reset" || route.instanceID != "reset" {
		t.Fatalf("reset instanceID = %q / %q", entry.instanceID, route.instanceID)
	}
	if !registry.requiresResume(entry) {
		t.Fatal("reset left the session available")
	}
}

func TestDSHLiveRegistry_ConcurrentRebindAndOldPumpRoute(t *testing.T) {
	registry := newDSHLiveRegistry()
	entry := &dshLiveSession{sessionID: "session", tabID: "tab", workspaceID: "workspace", subscription: dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate)}}
	binding, registered := registry.register(entry)
	if !registered {
		t.Fatal("register")
	}
	for range 100 {
		oldGeneration := binding.generation
		done := make(chan struct{})
		go func(generation uint64) {
			defer close(done)
			_, _ = registry.route(entry, generation)
			_, _, _ = registry.resetRoute(entry, generation, "old")
		}(oldGeneration)
		newBinding, _, _, rebound := registry.rebind(entry, nil, dsh.SessionSubscription{InstanceID: "new", Updates: make(chan dsh.SessionUpdate)})
		<-done
		if !rebound || newBinding.generation <= oldGeneration {
			t.Fatalf("generation transition %d -> %d, rebound %t", oldGeneration, newBinding.generation, rebound)
		}
		if _, found := registry.route(entry, oldGeneration); found {
			t.Fatal("old pump acquired a route after rebind")
		}
		binding = newBinding
	}
}

func TestDSHLiveRegistry_DetachRequiresExactGenerationAndConnection(t *testing.T) {
	registry := newDSHLiveRegistry()
	firstConnection := &rpc.Connection{}
	secondConnection := &rpc.Connection{}
	entry := &dshLiveSession{sessionID: "session", connection: firstConnection, subscription: dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate)}}
	firstBinding, registered := registry.register(entry)
	if !registered {
		t.Fatal("register")
	}
	secondBinding, _, _, rebound := registry.rebind(entry, secondConnection, dsh.SessionSubscription{Updates: make(chan dsh.SessionUpdate)})
	if !rebound {
		t.Fatal("rebind")
	}
	registry.detach(entry, firstBinding.generation, firstConnection)
	route, found := registry.route(entry, secondBinding.generation)
	if !found || route.connection != secondConnection || route.generation != secondBinding.generation {
		t.Fatal("stale detach removed the newer connection generation")
	}
	if _, detached := registry.detach(entry, secondBinding.generation, secondConnection); !detached {
		t.Fatal("detach current generation")
	}
	if _, found := registry.route(entry, secondBinding.generation); found {
		t.Fatal("detached generation retained a route")
	}
}
