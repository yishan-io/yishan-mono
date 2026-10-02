package app

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/relay"
)

func TestRelayHandler_HandleRelayMessage_CoalescesBlockingScheduledJobRefresh(t *testing.T) {
	refreshStarted := make(chan struct{}, 2)
	refreshCompleted := make(chan struct{}, 2)
	releaseFirstRefresh := make(chan struct{})
	handler := relayHandler{
		refreshScheduledJobs: func(ctx context.Context) {
			refreshStarted <- struct{}{}
			select {
			case <-releaseFirstRefresh:
			case <-ctx.Done():
			}
			refreshCompleted <- struct{}{}
		},
		scheduleRefreshState: &scheduleRefreshState{},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if !handler.HandleRelayMessage(ctx, nil, "node-1", relay.MethodJobScheduleChanged, json.RawMessage(`{}`)) {
		t.Fatal("first job.schedule.changed was not handled")
	}
	awaitSignal(t, refreshStarted, "first scheduled job refresh did not start")

	handled := make(chan bool, 1)
	go func() {
		handled <- handler.HandleRelayMessage(ctx, nil, "node-1", relay.MethodJobScheduleChanged, json.RawMessage(`{}`))
	}()
	select {
	case isHandled := <-handled:
		if !isHandled {
			t.Fatal("second job.schedule.changed was not handled")
		}
	case <-time.After(time.Second):
		t.Fatal("blocking scheduled job refresh stalled relay handler")
	}

	close(releaseFirstRefresh)
	awaitSignal(t, refreshCompleted, "first scheduled job refresh did not finish")
	awaitSignal(t, refreshStarted, "coalesced scheduled job refresh did not start")
	awaitSignal(t, refreshCompleted, "coalesced scheduled job refresh did not finish")
}

func awaitSignal(t *testing.T, signal <-chan struct{}, message string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatal(message)
	}
}
