package app

import (
	"context"
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/adapter/relay"
)

func TestRelayHandler_IgnoresRemoteScheduleChanges(t *testing.T) {
	handler := relayHandler{}
	if !handler.HandleRelayMessage(context.Background(), nil, "node-1", relay.MethodJobScheduleChanged, json.RawMessage(`{}`)) {
		t.Fatal("job.schedule.changed must be consumed so it is not forwarded")
	}
}
