package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

const transcriptProtocolVersion = 2

func TestDSHTranscript_ProjectsInternalEventsAcrossRendererBoundaries(t *testing.T) {
	hidden := json.RawMessage(`{"type":"yishan/session-bound.v1","seq":0,"time":10,"data":{"workspaceId":"secret"}}`)
	visible := json.RawMessage(`{"type":"turn/end","seq":1,"time":11,"data":{"turn":0}}`)
	runtime := &executionDSH{subscribeSnapshot: dsh.SessionSubscribeResult{
		SessionID: "s", InstanceID: "inc", Events: []dsh.SessionEvent{
			{SessionID: "s", Seq: 0, Event: hidden}, {SessionID: "s", Seq: 1, Event: visible},
		}, AsOfSeq: 1, DurableThroughSeq: 1, HeadSeq: 1,
	}}
	service := newDSHExecutionService(runtime)
	connection, client := newTestWSConnState(t)
	startDSHTranscript(t, service, connection)

	result, err := service.AgentAttach(context.Background(), connection, dshAttachRequest(-1))
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	attach := result.(rpc.AgentDSHAttachResult)
	assertHiddenMarker(t, attach.Events[0], 0, 10)
	if string(attach.Events[1]) != string(visible) {
		t.Fatalf("visible event = %s, want unchanged %s", attach.Events[1], visible)
	}

	runtime.mu.Lock()
	updates := runtime.subscriptions[len(runtime.subscriptions)-1]
	runtime.mu.Unlock()
	updates <- dsh.SessionUpdate{Event: &dsh.SessionEvent{SessionID: "s", Seq: 0, Event: hidden}}
	assertLiveHiddenMarker(t, client, 0, 10)
}

func TestDSHTranscript_ForwardsValidSubagentSettlementLiveAndFromHistory(t *testing.T) {
	testCases := []struct {
		name       string
		settlement json.RawMessage
	}{
		{"aborted", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":10,"data":{"version":1,"childSessionId":"child","state":"aborted","diagnostic":{"reason":"aborted"}}}`)},
		{"max tokens", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":10,"data":{"version":1,"childSessionId":"child","state":"error","diagnostic":{"reason":"max-tokens"}}}`)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			runtime := &executionDSH{subscribeSnapshot: dsh.SessionSubscribeResult{
				SessionID: "s", InstanceID: "inc", Events: []dsh.SessionEvent{{SessionID: "s", Seq: 0, Event: testCase.settlement}},
				AsOfSeq: 0, DurableThroughSeq: 0, HeadSeq: 0,
			}}
			service := newDSHExecutionService(runtime)
			connection, client := newTestWSConnState(t)
			startDSHTranscript(t, service, connection)

			result, err := service.AgentAttach(context.Background(), connection, dshAttachRequest(-1))
			if err != nil {
				t.Fatalf("attach: %v", err)
			}
			attach := result.(rpc.AgentDSHAttachResult)
			assertForwardedDSHEvent(t, attach.Events[0], testCase.settlement)

			runtime.mu.Lock()
			updates := runtime.subscriptions[len(runtime.subscriptions)-1]
			runtime.mu.Unlock()
			updates <- dsh.SessionUpdate{Event: &dsh.SessionEvent{SessionID: "s", Seq: 0, Event: testCase.settlement}}
			assertLiveForwardedDSHEvent(t, client, testCase.settlement)

			runtime.readResult = dsh.SessionReadResult{Session: dsh.SessionHeader{SessionID: "s"}, Events: []json.RawMessage{testCase.settlement}}
			historyResult, err := service.AgentReadHistory(context.Background(), rpc.AgentReadHistoryParams{
				Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", TranscriptProtocolVersion: transcriptProtocolVersion,
			})
			if err != nil {
				t.Fatalf("read history: %v", err)
			}
			assertForwardedDSHEvent(t, historyResult.(rpc.AgentHistoryResult).DSH.Events[0], testCase.settlement)
		})
	}
}

func TestDSHTranscript_RejectsInvalidSubagentSettlement(t *testing.T) {
	testCases := []struct {
		name     string
		event    json.RawMessage
		expected int64
	}{
		{"extra data field", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":1,"data":{"version":1,"childSessionId":"child","state":"completed","extra":true}}`), 0},
		{"malformed sequence", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":"0","time":1,"data":{"version":1,"childSessionId":"child","state":"completed"}}`), 0},
		{"missing sequence", json.RawMessage(`{"type":"yishan/subagent-settled.v1","time":1,"data":{"version":1,"childSessionId":"child","state":"completed"}}`), 0},
		{"invalid time", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":-1,"data":{"version":1,"childSessionId":"child","state":"completed"}}`), 0},
		{"unsupported envelope field", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":1,"data":{"version":1,"childSessionId":"child","state":"completed"},"ignorable":true}`), 0},
		{"sequence mismatch", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":1,"time":1,"data":{"version":1,"childSessionId":"child","state":"completed"}}`), 0},
		{"invalid diagnostic reason", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":1,"data":{"version":1,"childSessionId":"child","state":"completed","diagnostic":{"reason":"unknown"}}}`), 0},
		{"extra diagnostic field", json.RawMessage(`{"type":"yishan/subagent-settled.v1","seq":0,"time":1,"data":{"version":1,"childSessionId":"child","state":"completed","diagnostic":{"reason":"error","extra":true}}}`), 0},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := projectDSHEventRaw(testCase.event, testCase.expected)
			if !errors.Is(err, errDSHTranscriptProtocolUnavailable) {
				t.Fatalf("project invalid settlement: %v", err)
			}
		})
	}
}

func TestDSHTranscript_ReadHistoryProjectsInternalChildMetadataEvents(t *testing.T) {
	descriptor := json.RawMessage(`{"type":"subagent/descriptor","seq":0,"time":10,"data":{"parentSessionId":"parent","task":"Inspect the workspace"}}`)
	visible := json.RawMessage(`{"type":"user/message","seq":1,"time":11,"data":{"id":"child-request"}}`)
	sandboxMode := json.RawMessage(`{"type":"sandbox/mode","seq":2,"time":12,"data":{"mode":"workspace-write"}}`)
	runtime := &executionDSH{}
	runtime.readResult = dsh.SessionReadResult{Session: dsh.SessionHeader{SessionID: "s"}, Events: []json.RawMessage{descriptor, visible, sandboxMode}}
	service := newDSHExecutionService(runtime)
	result, err := service.AgentReadHistory(context.Background(), rpc.AgentReadHistoryParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", TranscriptProtocolVersion: transcriptProtocolVersion,
	})
	if err != nil {
		t.Fatalf("read history: %v", err)
	}
	history := result.(rpc.AgentHistoryResult).DSH
	assertHiddenMarker(t, history.Events[0], 0, 10)
	if string(history.Events[1]) != string(visible) {
		t.Fatalf("visible history event = %s", history.Events[1])
	}
	assertHiddenMarker(t, history.Events[2], 2, 12)
}

func TestDSHTranscript_DoesNotHideUnknownDSHEvents(t *testing.T) {
	raw := json.RawMessage(`{"type":"subagent/unknown","seq":0,"time":1,"data":{"secret":true}}`)
	projected, err := projectDSHEventRaw(raw, 0)
	if err != nil {
		t.Fatalf("project unknown DSH event: %v", err)
	}
	assertForwardedDSHEvent(t, projected, raw)
}

func TestDSHTranscript_RejectsMalformedHiddenInternalEvents(t *testing.T) {
	testCases := []struct {
		name  string
		event json.RawMessage
	}{
		{"missing data", json.RawMessage(`{"type":"subagent/descriptor","seq":0,"time":1}`)},
		{"extra envelope field", json.RawMessage(`{"type":"sandbox/mode","seq":0,"time":1,"data":{},"ignorable":true}`)},
		{"invalid time", json.RawMessage(`{"type":"sandbox/mode","seq":0,"time":-1,"data":{}}`)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := projectDSHEventRaw(testCase.event, 0)
			if !errors.Is(err, errDSHTranscriptProtocolUnavailable) {
				t.Fatalf("project malformed hidden event: %v", err)
			}
		})
	}
}

func TestDSHTranscript_RejectsUnavailableVersionBeforeRuntimeAccess(t *testing.T) {
	runtime := &executionDSH{}
	service := newDSHExecutionService(runtime)
	for _, version := range []int{0, 1} {
		t.Run("version", func(t *testing.T) {
			_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
				Runtime: rpc.AgentRuntimeDSH, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative", TranscriptProtocolVersion: version,
			})
			assertTranscriptProtocolUnavailable(t, err)
		})
	}
	if runtime.started != 0 || len(runtime.subscriptions) != 0 {
		t.Fatalf("old protocol reached runtime: %#v", runtime)
	}
	_, err := service.AgentReadHistory(context.Background(), rpc.AgentReadHistoryParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative"})
	assertTranscriptProtocolUnavailable(t, err)
	if runtime.reads != 0 {
		t.Fatal("missing read protocol reached runtime")
	}
	startDSHTranscript(t, service, nil)
	_, err = service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: -1,
	})
	assertTranscriptProtocolUnavailable(t, err)
	if len(runtime.subscriptions) != 1 {
		t.Fatal("missing attach protocol reached subscription")
	}
}

func TestDSHTranscript_RejectsRemovedYishanMetadataEvents(t *testing.T) {
	for _, eventType := range []string{"yishan/session-summary.v1", "yishan/session-title.v1"} {
		t.Run(eventType, func(t *testing.T) {
			_, err := projectDSHEventRaw(json.RawMessage(`{"type":"`+eventType+`","seq":0,"time":1,"data":{}}`), 0)
			if !errors.Is(err, errDSHTranscriptProtocolUnavailable) {
				t.Fatalf("project removed metadata event: %v", err)
			}
		})
	}
}

func TestDSHTranscript_DoesNotHideStandardTitleEvents(t *testing.T) {
	for _, eventType := range []string{"session/title", "session/title-llm-request"} {
		t.Run(eventType, func(t *testing.T) {
			raw := json.RawMessage(`{"type":"` + eventType + `","seq":0,"time":1,"data":{"title":"visible"}}`)
			projected, err := projectDSHEventRaw(raw, 0)
			if err != nil {
				t.Fatalf("project title event: %v", err)
			}
			if string(projected) != string(raw) {
				t.Fatalf("title event was hidden: %s", projected)
			}
		})
	}
}

func TestDSHTranscript_RejectsUnknownInternalEvent(t *testing.T) {
	runtime := &executionDSH{subscribeSnapshot: dsh.SessionSubscribeResult{
		SessionID: "s", InstanceID: "inc", Events: []dsh.SessionEvent{{SessionID: "s", Seq: 0, Event: json.RawMessage(`{"type":"yishan/unknown.v1","seq":0,"time":1,"data":{"secret":true}}`)}},
		AsOfSeq: 0, DurableThroughSeq: 0, HeadSeq: 0,
	}}
	service := newDSHExecutionService(runtime)
	_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative", TranscriptProtocolVersion: transcriptProtocolVersion,
	})
	assertTranscriptProtocolUnavailable(t, err)
}

func startDSHTranscript(t *testing.T, service *Service, connection *rpc.Connection) {
	t.Helper()
	_, err := service.AgentStart(context.Background(), connection, rpc.AgentStartParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "s", TabID: "tab", WorkspaceID: "w", CWD: "/authoritative", TranscriptProtocolVersion: transcriptProtocolVersion,
	})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
}

func dshAttachRequest(afterSeq int64) rpc.AgentAttachParams {
	return rpc.AgentAttachParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: afterSeq, AfterSeqProvided: true, TranscriptProtocolVersion: transcriptProtocolVersion}
}

func assertHiddenMarker(t *testing.T, raw json.RawMessage, sequence, eventTime int64) {
	t.Helper()
	var marker struct {
		Type string `json:"type"`
		Seq  int64  `json:"seq"`
		Time int64  `json:"time"`
		Data struct {
			Version int `json:"version"`
		} `json:"data"`
		Ignorable bool `json:"ignorable"`
	}
	if err := json.Unmarshal(raw, &marker); err != nil {
		t.Fatalf("decode marker: %v", err)
	}
	if marker.Type != "dsh/hidden.v1" || marker.Seq != sequence || marker.Time != eventTime || marker.Data.Version != 1 || !marker.Ignorable || string(raw) == "" {
		t.Fatalf("marker = %s", raw)
	}
	if string(raw) != `{"type":"dsh/hidden.v1","seq":`+jsonNumber(sequence)+`,"time":`+jsonNumber(eventTime)+`,"data":{"version":1},"ignorable":true}` {
		t.Fatalf("marker leaked fields: %s", raw)
	}
}

func jsonNumber(value int64) string { return strconv.FormatInt(value, 10) }

func assertLiveHiddenMarker(t *testing.T, client interface {
	SetReadDeadline(time.Time) error
	ReadJSON(any) error
}, sequence, eventTime int64) {
	t.Helper()
	if err := client.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("set deadline: %v", err)
	}
	var notification struct {
		Params struct {
			Payload struct {
				Update struct {
					Event struct {
						Event json.RawMessage `json:"event"`
					} `json:"event"`
				} `json:"update"`
			} `json:"payload"`
		} `json:"params"`
	}
	if err := client.ReadJSON(&notification); err != nil {
		t.Fatalf("read live notification: %v", err)
	}
	assertHiddenMarker(t, notification.Params.Payload.Update.Event.Event, sequence, eventTime)
}

func assertForwardedDSHEvent(t *testing.T, actual, expected json.RawMessage) {
	t.Helper()
	if string(actual) != string(expected) {
		t.Fatalf("event = %s, want %s", actual, expected)
	}
}

func assertLiveForwardedDSHEvent(t *testing.T, client interface {
	SetReadDeadline(time.Time) error
	ReadJSON(any) error
}, expected json.RawMessage) {
	t.Helper()
	if err := client.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("set deadline: %v", err)
	}
	var notification struct {
		Params struct {
			Payload struct {
				Update struct {
					Event struct {
						Event json.RawMessage `json:"event"`
					} `json:"event"`
				} `json:"update"`
			} `json:"payload"`
		} `json:"params"`
	}
	if err := client.ReadJSON(&notification); err != nil {
		t.Fatalf("read live notification: %v", err)
	}
	assertForwardedDSHEvent(t, notification.Params.Payload.Update.Event.Event, expected)
}

func assertTranscriptProtocolUnavailable(t *testing.T, err error) {
	t.Helper()
	var rpcErr *rpc.Error
	if !errors.As(err, &rpcErr) || rpcErr.Data["code"] != rpc.ErrorDataCodeDSHTranscriptProtocolUnavailable {
		t.Fatalf("error = %#v", err)
	}
}
