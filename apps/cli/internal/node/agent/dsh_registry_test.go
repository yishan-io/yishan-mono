package agent

import (
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

func TestDSHLiveRegistry_RebindInvalidatesOldPumpRoute(t *testing.T) {
	registry := newDSHLiveRegistry()
	connection := &rpc.Connection{}
	entry := &dshLiveSession{sessionID: "session", tabID: "tab", workspaceID: "workspace", incarnation: "old", connection: connection}
	if !registry.register(entry) {
		t.Fatal("register")
	}
	oldGeneration, _, found := registry.binding(entry)
	if !found {
		t.Fatal("initial binding missing")
	}
	newGeneration, _, rebound := registry.rebind(entry, connection, dsh.SessionSubscription{Incarnation: "new"})
	if !rebound || newGeneration == oldGeneration {
		t.Fatalf("rebind = generation %d, rebound %t", newGeneration, rebound)
	}
	if _, found := registry.route(entry, oldGeneration); found {
		t.Fatal("old pump retained a route after rebind")
	}
	route, reset := registry.resetRoute(entry, newGeneration, "reset")
	if !reset {
		t.Fatal("reset route")
	}
	if entry.incarnation != "reset" || route.incarnation != "reset" {
		t.Fatalf("reset incarnation = %q / %q", entry.incarnation, route.incarnation)
	}
	if !registry.requiresResume(entry) {
		t.Fatal("reset left the session available")
	}
}

func TestDSHLiveRegistry_ConcurrentRebindAndOldPumpRoute(t *testing.T) {
	registry := newDSHLiveRegistry()
	entry := &dshLiveSession{sessionID: "session", tabID: "tab", workspaceID: "workspace"}
	if !registry.register(entry) {
		t.Fatal("register")
	}
	for range 100 {
		oldGeneration, _, found := registry.binding(entry)
		if !found {
			t.Fatal("binding missing")
		}
		done := make(chan struct{})
		go func(generation uint64) {
			defer close(done)
			_, _ = registry.route(entry, generation)
			_, _ = registry.resetRoute(entry, generation, "old")
		}(oldGeneration)
		newGeneration, _, rebound := registry.rebind(entry, nil, dsh.SessionSubscription{Incarnation: "new"})
		<-done
		if !rebound || newGeneration <= oldGeneration {
			t.Fatalf("generation transition %d -> %d, rebound %t", oldGeneration, newGeneration, rebound)
		}
		if _, found := registry.route(entry, oldGeneration); found {
			t.Fatal("old pump acquired a route after rebind")
		}
	}
}

func TestDSHLiveRegistry_DetachRequiresExactGenerationAndConnection(t *testing.T) {
	registry := newDSHLiveRegistry()
	firstConnection := &rpc.Connection{}
	secondConnection := &rpc.Connection{}
	entry := &dshLiveSession{sessionID: "session", connection: firstConnection}
	if !registry.register(entry) {
		t.Fatal("register")
	}
	firstGeneration, _, found := registry.binding(entry)
	if !found {
		t.Fatal("initial binding missing")
	}
	secondGeneration, _, rebound := registry.rebind(entry, secondConnection, dsh.SessionSubscription{})
	if !rebound {
		t.Fatal("rebind")
	}
	registry.detach(entry, firstGeneration, firstConnection)
	route, found := registry.route(entry, secondGeneration)
	if !found || route.connection != secondConnection || route.generation != secondGeneration {
		t.Fatal("stale detach removed the newer connection generation")
	}
}
