package jobqueue

import (
	"testing"

	relayprotocol "yishan/packages/relay-protocol-go"
)

func TestDispatch_DistinctRunIDsInSameMinuteDispatchIndependently(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)

	for _, runID := range []string{"run-1", "run-2"} {
		if result := dispatchRun(m, runID, "job-1", "node-1"); !result.OK {
			t.Fatalf("dispatch %s: expected OK, got %q", runID, result.Reason)
		}
	}

	notes := tr.notifications()
	if len(notes) != 2 {
		t.Fatalf("expected two job.run notifications, got %d", len(notes))
	}
	for _, note := range notes {
		params := note.params.(relayprotocol.JobRunParams)
		if params.IdempotencyKey != params.RunID {
			t.Errorf("expected idempotency key %q, got %q", params.RunID, params.IdempotencyKey)
		}
	}
}

func TestDispatch_RedeliveryAfterAcceptanceOrCompletionDoesNotRedispatch(t *testing.T) {
	for _, status := range []string{"accepted", "completed"} {
		t.Run(status, func(t *testing.T) {
			tr := newStubTransport("node-1")
			m := newTestManager(tr)
			dispatchRun(m, "run-1", "job-1", "node-1")
			m.HandleAck("node-1", AckParams{RunID: "run-1", Status: "accepted"})
			if status == "completed" {
				m.HandleResult("node-1", ResultParams{RunID: "run-1", Status: "completed"})
			}
			before := m.GetMetrics()

			result := dispatchRun(m, "run-1", "job-1", "node-1")
			if !result.OK || result.RunID != "run-1" {
				t.Errorf("expected successful idempotent response, got %+v", result)
			}
			if len(tr.notifications()) != 1 {
				t.Error("redelivery must not send a second notification")
			}
			if after := m.GetMetrics(); after != before {
				t.Errorf("redelivery must not change metrics: before=%+v after=%+v", before, after)
			}
		})
	}
}

func TestDispatch_OfflineRedeliveryReportsNodeOffline(t *testing.T) {
	tr := newStubTransport()
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")
	before := m.GetMetrics()

	result := dispatchRun(m, "run-1", "job-1", "node-1")
	if result.Reason != "node_offline" || result.RunID != "run-1" {
		t.Errorf("expected node_offline for redelivery, got %+v", result)
	}
	if after := m.GetMetrics(); after != before {
		t.Errorf("redelivery must not change metrics: before=%+v after=%+v", before, after)
	}
}

func TestDispatch_ConflictingRunIDFailsClosed(t *testing.T) {
	tr := newStubTransport("node-1")
	m := newTestManager(tr)
	dispatchRun(m, "run-1", "job-1", "node-1")

	result := dispatchRun(m, "run-1", "job-2", "node-1")
	if result.OK || result.Reason != "conflict" {
		t.Errorf("expected conflicting run ID to fail closed, got %+v", result)
	}
	if len(tr.notifications()) != 1 {
		t.Error("conflicting redelivery must not send a second notification")
	}
}

type payloadRedeliveryTestCase struct {
	name     string
	payload  map[string]any
	shouldOK bool
}

func TestDispatch_RedeliveryRequiresMatchingPayload(t *testing.T) {
	testCases := []payloadRedeliveryTestCase{
		{name: "same semantic payload with a different insertion order", payload: reorderedPayload(), shouldOK: true},
		{name: "changed prompt", payload: map[string]any{"prompt": "goodbye", "model": "gpt-4.1", "command": "review"}},
		{name: "changed model", payload: map[string]any{"prompt": "hello", "model": "gpt-4.2", "command": "review"}},
		{name: "changed command", payload: map[string]any{"prompt": "hello", "model": "gpt-4.1", "command": "execute"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assertPayloadRedelivery(t, testCase)
		})
	}
}

func assertPayloadRedelivery(t *testing.T, testCase payloadRedeliveryTestCase) {
	t.Helper()
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	initialPayload := map[string]any{"prompt": "hello", "model": "gpt-4.1", "command": "review"}
	manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: initialPayload,
	})
	metricsBefore := manager.GetMetrics()
	result := manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: testCase.payload,
	})
	if result.OK != testCase.shouldOK {
		t.Errorf("expected OK=%t, got %+v", testCase.shouldOK, result)
	}
	if !testCase.shouldOK && result.Reason != "conflict" {
		t.Errorf("expected conflict, got %+v", result)
	}
	if len(transport.notifications()) != 1 {
		t.Error("redelivery must not send a second notification")
	}
	if metricsAfter := manager.GetMetrics(); metricsAfter != metricsBefore {
		t.Errorf("redelivery must not change metrics: before=%+v after=%+v", metricsBefore, metricsAfter)
	}
}

func reorderedPayload() map[string]any {
	payload := make(map[string]any)
	payload["command"] = "review"
	payload["prompt"] = "hello"
	payload["model"] = "gpt-4.1"
	return payload
}

func TestDispatch_InvalidInitialPayloadFailsClosed(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	metricsBefore := manager.GetMetrics()
	result := manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z",
		Payload: map[string]any{"command": func() {}},
	})
	assertInvalidPayloadRejected(t, result)
	if len(transport.notifications()) != 0 || manager.GetRun("run-1") != nil {
		t.Error("invalid payload must not send a notification or create a run")
	}
	if metricsAfter := manager.GetMetrics(); metricsAfter != metricsBefore {
		t.Errorf("invalid payload must not change metrics: before=%+v after=%+v", metricsBefore, metricsAfter)
	}
}

func TestDispatch_InvalidRedeliveryPayloadFailsClosed(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	dispatchRun(manager, "run-1", "job-1", "node-1")
	metricsBefore := manager.GetMetrics()
	result := manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z",
		Payload: map[string]any{"command": func() {}},
	})
	assertInvalidPayloadRejected(t, result)
	if len(transport.notifications()) != 1 {
		t.Error("invalid redelivery must not send a second notification")
	}
	if metricsAfter := manager.GetMetrics(); metricsAfter != metricsBefore {
		t.Errorf("invalid redelivery must not change metrics: before=%+v after=%+v", metricsBefore, metricsAfter)
	}
}

func assertInvalidPayloadRejected(t *testing.T, result DispatchResult) {
	t.Helper()
	if result.OK || result.Reason != "invalid_payload" {
		t.Errorf("expected invalid payload rejection, got %+v", result)
	}
}

func TestDispatch_SnapshotsNestedPayload(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	payload := map[string]any{
		"options":  map[string]any{"model": "gpt-4.1", "temperature": 0.2},
		"messages": []any{map[string]any{"content": "original"}},
	}

	if result := manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: payload,
	}); !result.OK {
		t.Fatalf("dispatch: expected OK, got %+v", result)
	}
	payload["options"].(map[string]any)["model"] = "changed"
	payload["messages"].([]any)[0].(map[string]any)["content"] = "changed"

	assertJobRunPayload(t, transport.notifications()[0], "gpt-4.1", "original")
	stored := manager.GetRun("run-1")
	if stored == nil {
		t.Fatal("expected stored run")
	}
	if stored.Payload["options"].(map[string]any)["model"] != "gpt-4.1" {
		t.Errorf("stored payload changed after caller mutation: %#v", stored.Payload)
	}

	manager.HandleNodeDisconnect("node-1")
	manager.HandleNodeReconnect("node-1")
	notifications := transport.notifications()
	if len(notifications) != 2 {
		t.Fatalf("expected retry notification, got %d notifications", len(notifications))
	}
	assertJobRunPayload(t, notifications[1], "gpt-4.1", "original")
}

func TestGetRun_NestedPayloadIsIsolated(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z",
		Payload: map[string]any{"options": map[string]any{"model": "gpt-4.1"}},
	})

	run := manager.GetRun("run-1")
	if run == nil {
		t.Fatal("expected stored run")
	}
	run.Payload["options"].(map[string]any)["model"] = "changed"

	stored := manager.GetRun("run-1")
	if stored.Payload["options"].(map[string]any)["model"] != "gpt-4.1" {
		t.Errorf("GetRun exposed mutable nested payload: %#v", stored.Payload)
	}
}

func TestDispatch_NestedPayloadRedeliveryUsesCanonicalIdentity(t *testing.T) {
	transport := newStubTransport("node-1")
	manager := newTestManager(transport)
	initialPayload := map[string]any{"options": map[string]any{"model": "gpt-4.1", "temperature": 0.2}}
	manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: initialPayload,
	})

	reorderedPayload := map[string]any{"options": map[string]any{"temperature": 0.2, "model": "gpt-4.1"}}
	if result := manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: reorderedPayload,
	}); !result.OK {
		t.Errorf("expected canonical nested payload redelivery to succeed, got %+v", result)
	}

	changedPayload := map[string]any{"options": map[string]any{"model": "gpt-4.2", "temperature": 0.2}}
	if result := manager.Dispatch(DispatchParams{
		RunID: "run-1", JobID: "job-1", NodeID: "node-1", ScheduledFor: "2025-01-15T10:30:00Z", Payload: changedPayload,
	}); result.OK || result.Reason != "conflict" {
		t.Errorf("expected changed nested payload conflict, got %+v", result)
	}
}

func assertJobRunPayload(t *testing.T, notification sentNotification, model, content string) {
	t.Helper()
	params, ok := notification.params.(relayprotocol.JobRunParams)
	if !ok {
		t.Fatalf("expected job.run params, got %T", notification.params)
	}
	options := params.Payload["options"].(map[string]any)
	messages := params.Payload["messages"].([]any)
	if options["model"] != model || messages[0].(map[string]any)["content"] != content {
		t.Errorf("expected payload model=%q content=%q, got %#v", model, content, params.Payload)
	}
}
