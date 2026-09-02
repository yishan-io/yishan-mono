package agent

import (
	"encoding/json"
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
)

func TestDSHNotificationEvents_ValidateApprovalAndTerminalShapes(t *testing.T) {
	route := dshRoute{sessionID: "s", instanceID: "i", generation: 1}
	invalidEvents := []string{
		`{"type":"approval/asked","data":{"id":"a"}}`,
		`{"type":"approval/asked","data":{"id":"a","toolName":"tool","extra":true}}`,
		`{"type":"approval/decided","data":{"id":"a","outcome":"allowed"}}`,
		`{"type":"turn/start","data":{"turn":-1}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"x"}}}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"x","code":"ERR","status":500.5}}}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"x","code":"ERR","status":99}}}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"x","code":"ERR","providerRetryAfterMs":0}}}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"error","error":{"message":"x","code":"ERR","requestId":""}}}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"aborted","reason":{"kind":"hook"}}}}`,
		`{"type":"turn/end","data":{"turn":0,"reason":{"kind":"completed","extra":true}}}`,
	}
	for index, raw := range invalidEvents {
		state := newDSHNotificationState()
		got := projectDSHNotification(&state, route, dsh.SessionUpdate{Event: &dsh.SessionEvent{Seq: int64(index), Event: json.RawMessage(raw)}})
		if len(got) != 0 {
			t.Fatalf("invalid event %d projected %#v", index, got)
		}
	}
	if _, _, ok := parseTurnEnd(json.RawMessage(`{"turn":0,"reason":{"kind":"error","error":{"message":"failed","code":"ERR","status":500,"providerRetryAfterMs":0.5,"requestId":"request-1"}}}`)); !ok {
		t.Fatal("valid error reason was rejected")
	}
	if id, ok := parseApprovalAsked(json.RawMessage(`{"id":"a","toolName":"tool","callId":"","reason":""}`)); !ok || id != "a" {
		t.Fatal("valid optional approval strings were rejected")
	}
}
