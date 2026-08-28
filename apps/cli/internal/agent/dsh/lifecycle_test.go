package dsh

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestParseSubagentLifecycleNotification_ValidatesExactLifecyclePayload(t *testing.T) {
	valid := []byte(`{"version":1,"parentSessionId":"parent","incarnation":"run-1","revision":0,"event":"started","runId":"child","childSessionId":"child","provider":"spawn","local":true}`)
	lifecycle, err := parseSubagentLifecycleNotification(valid)
	if err != nil || lifecycle.Event != "started" || lifecycle.StopReason != "" {
		t.Fatalf("parse started = %#v, %v", lifecycle, err)
	}
	finished := []byte(`{"version":1,"parentSessionId":"parent","incarnation":"run-1","revision":1,"event":"finished","runId":"child","childSessionId":"child","provider":"spawn","local":false,"stopReason":"completed"}`)
	if _, err := parseSubagentLifecycleNotification(finished); err != nil {
		t.Fatalf("parse finished: %v", err)
	}
}

func TestParseSubagentLifecycleNotification_RejectsInvalidFields(t *testing.T) {
	testCases := []struct {
		name string
		json string
	}{
		{"extra", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":0,"event":"started","runId":"run","childSessionId":"child","provider":"spawn","local":true,"extra":true}`},
		{"negative revision", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":-1,"event":"started","runId":"run","childSessionId":"child","provider":"spawn","local":true}`},
		{"unsafe revision", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":9007199254740992,"event":"started","runId":"run","childSessionId":"child","provider":"spawn","local":true}`},
		{"null local", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":0,"event":"started","runId":"run","childSessionId":"child","provider":"spawn","local":null}`},
		{"missing local", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":0,"event":"started","runId":"run","childSessionId":"child","provider":"spawn"}`},
		{"started stop reason", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":0,"event":"started","runId":"run","childSessionId":"child","provider":"spawn","local":true,"stopReason":"completed"}`},
		{"unknown stop reason", `{"version":1,"parentSessionId":"parent","incarnation":"run","revision":0,"event":"finished","runId":"run","childSessionId":"child","provider":"spawn","local":true,"stopReason":"unknown"}`},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := parseSubagentLifecycleNotification([]byte(testCase.json)); err == nil {
				t.Fatal("accepted invalid lifecycle")
			}
		})
	}
}

func TestReplayCoordinator_LifecycleDeduplicatesAndDeliversWithoutSubscribeBaseline(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	subscription, err := coordinator.subscribe(emptySubscriptionResult(), emptySubscriptionRequest())
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	started := testLifecycle(0, "run", "started")
	if err := coordinator.recordLifecycle(started); err != nil {
		t.Fatalf("record started: %v", err)
	}
	if err := coordinator.recordLifecycle(started); err != nil {
		t.Fatalf("record duplicate: %v", err)
	}
	update := <-subscription.Updates
	if update.Lifecycle == nil || update.Lifecycle.Revision != 0 {
		t.Fatalf("lifecycle update = %#v", update)
	}
	select {
	case duplicate := <-subscription.Updates:
		t.Fatalf("duplicate update = %#v", duplicate)
	default:
	}
	if err := coordinator.recordLifecycle(testLifecycle(1, "run", "finished")); err != nil {
		t.Fatalf("record finished: %v", err)
	}
	finished := <-subscription.Updates
	if finished.Lifecycle == nil || finished.Lifecycle.Event != "finished" || finished.Lifecycle.Revision != 1 {
		t.Fatalf("finished update = %#v", finished)
	}
}

func TestReplayCoordinator_LifecycleRejectsConflictRegressionAndGap(t *testing.T) {
	testCases := []struct {
		name    string
		updates []SubagentLifecycle
	}{
		{"conflict", []SubagentLifecycle{testLifecycle(0, "run", "started"), testLifecycle(0, "run", "finished")}},
		{"regression", []SubagentLifecycle{testLifecycle(0, "run", "started"), testLifecycle(1, "run", "finished"), testLifecycle(0, "run", "started")}},
		{"gap", []SubagentLifecycle{testLifecycle(0, "run", "started"), testLifecycle(2, "run", "finished")}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			coordinator := newReplayCoordinator(4)
			for index, lifecycle := range testCase.updates {
				err := coordinator.recordLifecycle(lifecycle)
				if index == len(testCase.updates)-1 && !errors.Is(err, ErrSessionReplayReset) {
					t.Fatalf("last record error = %v", err)
				}
				if index < len(testCase.updates)-1 && err != nil {
					t.Fatalf("record %d: %v", index, err)
				}
			}
		})
	}
}

func TestReplayCoordinator_LifecycleFencesParentToCurrentIncarnation(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	subscription, err := coordinator.subscribe(SessionSubscribeResult{SessionID: "parent", Incarnation: "old", AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}, emptySubscriptionRequest())
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "old", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	if err := coordinator.recordLifecycle(testLifecycle(0, "old", "started")); err != nil {
		t.Fatalf("record old: %v", err)
	}
	if update := <-subscription.Updates; update.Lifecycle == nil || update.Lifecycle.Incarnation != "old" {
		t.Fatalf("old lifecycle = %#v", update)
	}
	coordinator.setIncarnation("parent", "new")
	if err := coordinator.recordLifecycle(testLifecycle(0, "new", "started")); err != nil {
		t.Fatalf("record new: %v", err)
	}
	if update := <-subscription.Updates; update.Lifecycle == nil || update.Lifecycle.Incarnation != "new" {
		t.Fatalf("new lifecycle = %#v", update)
	}
	if err := coordinator.recordLifecycle(testLifecycle(1, "old", "finished")); err != nil {
		t.Fatalf("record stale old: %v", err)
	}
	select {
	case update := <-subscription.Updates:
		t.Fatalf("stale lifecycle published = %#v", update)
	default:
	}
}

func TestSupervisor_SubscribeResyncsLifecycleObservedInResponseGap(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-subscribe-lifecycle-gap")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	subscription, err := supervisor.SubscribeSession(context.Background(), emptySubscriptionRequest())
	if err != nil {
		t.Fatalf("SubscribeSession: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	resync := <-subscription.Updates
	if resync.Lifecycle != nil || resync.LifecycleResync == nil || resync.LifecycleResync.ParentSessionID != "parent" || resync.LifecycleResync.Incarnation != "run" || resync.LifecycleResync.Revision != 0 {
		t.Fatalf("lifecycle resync = %#v", resync)
	}
	if _, err := supervisor.PromptSession(context.Background(), SessionPromptRequest{CWD: "/workspace", SessionID: "parent", ContentBlocks: []TextPromptContentBlock{{Type: "text", Text: "continue"}}}); err != nil {
		t.Fatalf("PromptSession: %v", err)
	}
	select {
	case update := <-subscription.Updates:
		if update.Lifecycle == nil || update.Lifecycle.Event != "finished" || update.Lifecycle.Revision != 1 {
			t.Fatalf("post-subscribe lifecycle = %#v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("post-subscribe lifecycle was not delivered")
	}
}

func emptySubscriptionResult() SessionSubscribeResult {
	return SessionSubscribeResult{SessionID: "parent", Incarnation: "run", AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}
}

func emptySubscriptionRequest() SessionSubscribeRequest {
	return SessionSubscribeRequest{CWD: "/workspace", SessionID: "parent", AfterSeq: -1}
}

func testLifecycle(revision int64, incarnation string, event string) SubagentLifecycle {
	lifecycle := SubagentLifecycle{Version: 1, ParentSessionID: "parent", Incarnation: incarnation, Revision: revision, Event: event, RunID: "child", ChildSessionID: "child", Provider: "spawn", Local: true}
	if event == "finished" {
		lifecycle.StopReason = "completed"
	}
	return lifecycle
}
