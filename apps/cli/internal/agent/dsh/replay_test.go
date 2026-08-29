package dsh

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

func TestReplayCoordinator_SubscribeMergesLiveEventsAfterDurableTail(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 2, Event: json.RawMessage(`{"seq":2,"type":"turn/end"}`)})
	result := SessionSubscribeResult{SessionID: "session", InstanceID: "run", Events: []SessionEvent{{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0,"type":"turn/end"}`)}, {SessionID: "session", Seq: 1, Event: json.RawMessage(`{"seq":1,"type":"turn/end"}`)}}, AsOfSeq: 1, DurableThroughSeq: 1, HeadSeq: 1}
	subscription, err := coordinator.subscribe(result, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	for sequence := int64(0); sequence <= 2; sequence++ {
		update := <-subscription.Updates
		if update.Event == nil || update.Event.Seq != sequence {
			t.Fatalf("update %d = %#v", sequence, update)
		}
	}
}

func TestReplayCoordinator_SubscribeQueuesDurableCursorAfterReplayedEvents(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	result := SessionSubscribeResult{
		SessionID: "session", InstanceID: "run", Events: []SessionEvent{
			{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0}`)},
			{SessionID: "session", Seq: 1, Event: json.RawMessage(`{"seq":1}`)},
		},
		AsOfSeq: 1, DurableThroughSeq: 1, HeadSeq: 1,
	}
	subscription, err := coordinator.subscribe(result, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	for sequence := int64(0); sequence <= 1; sequence++ {
		update := <-subscription.Updates
		if update.Event == nil || update.Event.Seq != sequence {
			t.Fatalf("event %d = %#v", sequence, update)
		}
	}
	cursor := <-subscription.Updates
	if cursor.Cursor == nil || cursor.Cursor.InstanceID != "run" || cursor.Cursor.DurableThroughSeq != 1 {
		t.Fatalf("cursor = %#v", cursor)
	}
}

func TestReplayCoordinator_ConflictingDuplicateInvalidatesSession(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0,"type":"turn/end"}`)})
	coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0,"type":"other"}`)})
	_, err := coordinator.subscribe(SessionSubscribeResult{SessionID: "session", InstanceID: "run", AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if !errors.Is(err, ErrSessionReplayReset) {
		t.Fatalf("subscribe error = %v", err)
	}
}

func TestReplayCoordinator_RejectsMissingCoverageAfterEviction(t *testing.T) {
	coordinator := newReplayCoordinator(1)
	coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0}`)})
	coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 1, Event: json.RawMessage(`{"seq":1}`)})
	_, err := coordinator.subscribe(SessionSubscribeResult{SessionID: "session", InstanceID: "run", AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if !errors.Is(err, ErrSessionReplayReset) {
		t.Fatalf("subscribe error = %v", err)
	}
}

func TestReplayCoordinator_DeduplicatesExactLiveEvent(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	result := SessionSubscribeResult{SessionID: "session", InstanceID: "run", Events: []SessionEvent{}, AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}
	subscription, err := coordinator.subscribe(result, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	event := SessionEvent{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0}`)}
	if err := coordinator.recordEvent("session", event); err != nil {
		t.Fatalf("record: %v", err)
	}
	if err := coordinator.recordEvent("session", event); err != nil {
		t.Fatalf("record duplicate: %v", err)
	}
	if update := <-subscription.Updates; update.Event == nil || update.Event.Seq != 0 {
		t.Fatalf("event = %#v", update)
	}
	select {
	case update := <-subscription.Updates:
		t.Fatalf("duplicate update = %#v", update)
	default:
	}
}

func TestReplayCoordinator_OverflowDeliversTerminalResetAndCloses(t *testing.T) {
	coordinator := newReplayCoordinator(1)
	result := SessionSubscribeResult{SessionID: "session", InstanceID: "run", Events: []SessionEvent{}, AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}
	subscription, err := coordinator.subscribe(result, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	for sequence := int64(0); sequence <= defaultReplayCapacity; sequence++ {
		if err := coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: sequence, Event: json.RawMessage(`{"seq":` + fmt.Sprint(sequence) + `}`)}); err != nil {
			t.Fatalf("record %d: %v", sequence, err)
		}
	}
	assertTerminalReset(t, subscription.Updates, defaultReplayCapacity)
}

func TestReplayCoordinator_OverlapConflictResetsWithoutReplay(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	initial := SessionSubscribeResult{SessionID: "session", InstanceID: "run", Events: []SessionEvent{}, AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}
	subscription, err := coordinator.subscribe(initial, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	if err := coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0,"type":"live"}`)}); err != nil {
		t.Fatalf("record: %v", err)
	}
	conflict := SessionSubscribeResult{SessionID: "session", InstanceID: "run", Events: []SessionEvent{{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0,"type":"durable"}`)}}, AsOfSeq: 0, DurableThroughSeq: 0, HeadSeq: 0}
	_, err = coordinator.subscribe(conflict, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if !errors.Is(err, ErrSessionReplayReset) {
		t.Fatalf("subscribe error = %v", err)
	}
	assertTerminalReset(t, subscription.Updates, 1)
}

func assertInitialDurableCursor(t *testing.T, updates <-chan SessionUpdate, instanceID string, durableThroughSeq int64) {
	t.Helper()
	update := <-updates
	if update.Cursor == nil || update.Cursor.InstanceID != instanceID || update.Cursor.DurableThroughSeq != durableThroughSeq {
		t.Fatalf("initial cursor = %#v", update)
	}
}

func assertInitialSessionStatus(t *testing.T, updates <-chan SessionUpdate, status string) {
	t.Helper()
	update := <-updates
	if update.Status == nil || update.Status.Status != status {
		t.Fatalf("initial status = %#v", update)
	}
}

func assertTerminalReset(t *testing.T, updates <-chan SessionUpdate, eventCount int) {
	t.Helper()
	for index := range eventCount {
		update := <-updates
		if update.Event == nil || update.Event.Seq != int64(index) {
			t.Fatalf("update %d = %#v", index, update)
		}
	}
	terminal, ok := <-updates
	if !ok || terminal.Reset == nil {
		t.Fatalf("terminal update = %#v, open = %t", terminal, ok)
	}
	if _, ok := <-updates; ok {
		t.Fatal("subscription remained open after terminal reset")
	}
}

func TestReplayCoordinator_SubscribeReturnsSnapshotIdentityAndMergedBaseline(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	if err := coordinator.recordEvent("session", SessionEvent{SessionID: "session", Seq: 2, Event: json.RawMessage(`{"seq":2}`)}); err != nil {
		t.Fatalf("record live event: %v", err)
	}
	subscription, err := coordinator.subscribe(SessionSubscribeResult{
		SessionID: "session", InstanceID: "run-2", Events: []SessionEvent{{SessionID: "session", Seq: 0, Event: json.RawMessage(`{"seq":0}`)}, {SessionID: "session", Seq: 1, Event: json.RawMessage(`{"seq":1}`)}}, AsOfSeq: 1, DurableThroughSeq: 1, HeadSeq: 1,
	}, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	if subscription.InstanceID != "run-2" || subscription.Baseline != 2 {
		t.Fatalf("snapshot = instanceID %q, baseline %d", subscription.InstanceID, subscription.Baseline)
	}
	if subscription.Snapshot.AsOfSeq != 1 || subscription.Snapshot.DurableThroughSeq != 1 ||
		subscription.Snapshot.HeadSeq != 2 || len(subscription.Snapshot.Events) != 3 {
		t.Fatalf("merged attach snapshot = %#v", subscription.Snapshot)
	}
}

func TestReplayCoordinator_CursorInstanceIDMismatchEmitsReset(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	subscription, err := coordinator.subscribe(SessionSubscribeResult{SessionID: "session", InstanceID: "old", Events: []SessionEvent{}, AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1}, SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "old", -1)
	assertInitialSessionStatus(t, subscription.Updates, "idle")
	if err := coordinator.acceptCursor(DurableCursor{SessionID: "session", InstanceID: "new", DurableThroughSeq: -1}); err != nil {
		t.Fatalf("accept mismatched cursor: %v", err)
	}
	update := <-subscription.Updates
	if update.Reset == nil || update.Reset.InstanceID != "new" {
		t.Fatalf("reset = %#v", update)
	}
}

func TestReplayCoordinator_SubscribeQueuesLatestStatusAfterCursor(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	coordinator.publishStatus(SessionStatus{SessionID: "session", Status: "running"})
	subscription, err := coordinator.subscribe(
		SessionSubscribeResult{SessionID: "session", InstanceID: "run", AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1},
		SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1},
	)
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	update := <-subscription.Updates
	if update.Status == nil || update.Status.Status != "running" {
		t.Fatalf("status = %#v", update)
	}
}

func TestReplayCoordinator_SubscribeDefaultsQuiescentSessionToIdle(t *testing.T) {
	coordinator := newReplayCoordinator(4)
	subscription, err := coordinator.subscribe(
		SessionSubscribeResult{SessionID: "session", InstanceID: "run", AsOfSeq: -1, DurableThroughSeq: -1, HeadSeq: -1},
		SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1},
	)
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	assertInitialDurableCursor(t, subscription.Updates, "run", -1)
	update := <-subscription.Updates
	if update.Status == nil || update.Status.Status != "idle" {
		t.Fatalf("status = %#v", update)
	}
}
