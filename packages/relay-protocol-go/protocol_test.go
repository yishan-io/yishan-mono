package relayprotocol

import (
	"bytes"
	"encoding/json"
	"testing"
)

// TestMethodConstants pins the wire method strings. Changing a value here
// breaks the deployed CLI<->relay protocol; version it instead.
func TestMethodConstants(t *testing.T) {
	expect := map[string]string{
		"MethodPing":                     "relay.ping",
		"MethodPong":                     "relay.pong",
		"MethodJobRun":                   "job.run",
		"MethodJobAck":                   "job.ack",
		"MethodJobResult":                "job.result",
		"MethodWorkspaceSnapshotChanged": "workspace.snapshot.changed",
		"MethodTerminalSessionChanged":   "terminal.session.changed",
		"MethodTerminalStreamRequest":    "terminal.stream.request",
		"MethodTerminalStreamAccept":     "terminal.stream.accept",
		"MethodTerminalStreamCancel":     "terminal.stream.cancel",
	}
	got := map[string]string{
		"MethodPing": MethodPing, "MethodPong": MethodPong,
		"MethodJobRun": MethodJobRun, "MethodJobAck": MethodJobAck, "MethodJobResult": MethodJobResult,
		"MethodWorkspaceSnapshotChanged": MethodWorkspaceSnapshotChanged,
		"MethodTerminalSessionChanged":   MethodTerminalSessionChanged,
		"MethodTerminalStreamRequest":    MethodTerminalStreamRequest,
		"MethodTerminalStreamAccept":     MethodTerminalStreamAccept,
		"MethodTerminalStreamCancel":     MethodTerminalStreamCancel,
	}
	for name, want := range expect {
		if got[name] != want {
			t.Errorf("%s = %q, want %q", name, got[name], want)
		}
	}
}

// TestEnvelopeRoundTrip verifies the JSON-RPC envelopes keep their wire shape.
func TestEnvelopeRoundTrip(t *testing.T) {
	req := Request{JSONRPC: "2.0", ID: json.RawMessage(`"dispatch-node-1"`), Method: MethodWorkspaceSnapshotChanged, Params: json.RawMessage(`{"organizationId":"org"}`)}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var back Request
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	if string(back.ID) != `"dispatch-node-1"` || back.Method != req.Method || string(back.Params) != string(req.Params) {
		t.Errorf("request round trip mismatch: %+v", back)
	}

	notif := Notification{JSONRPC: "2.0", Method: MethodJobRun, Params: map[string]any{"runId": "r1"}}
	data, err = json.Marshal(notif)
	if err != nil {
		t.Fatalf("marshal notification: %v", err)
	}
	if !bytes.Contains(data, []byte(`"method":"job.run"`)) {
		t.Errorf("notification wire shape changed: %s", data)
	}

	resp := Response{JSONRPC: "2.0", ID: "dispatch-node-1", Result: DispatchVerdict{Accepted: true, TargetOnline: true}}
	data, err = json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	if !bytes.Contains(data, []byte(`"accepted":true`)) || !bytes.Contains(data, []byte(`"targetOnline":true`)) {
		t.Errorf("response payload wire shape changed: %s", data)
	}

	rpcErr := RPCError{Code: CodeNodeOffline, Message: "node is offline"}
	data, err = json.Marshal(rpcErr)
	if err != nil {
		t.Fatalf("marshal rpc error: %v", err)
	}
	if !bytes.Contains(data, []byte(`"code":-32002`)) || bytes.Contains(data, []byte(`"data"`)) {
		t.Errorf("rpc error wire shape changed: %s", data)
	}
}

// TestJobParamsRoundTrip verifies job.run/ack/result keep their wire shape,
// including the JobError.Details field that previously drifted on the CLI.
func TestJobParamsRoundTrip(t *testing.T) {
	run := JobRunParams{RunID: "r1", JobID: "j1", ScheduledFor: "2026-08-16T00:00:00Z", IdempotencyKey: "k", Payload: map[string]any{"agentKind": "builder"}}
	data, err := json.Marshal(run)
	if err != nil {
		t.Fatalf("marshal job.run: %v", err)
	}
	for _, key := range []string{`"runId"`, `"jobId"`, `"scheduledFor"`, `"idempotencyKey"`, `"payload"`} {
		if !bytes.Contains(data, []byte(key)) {
			t.Errorf("job.run missing %s: %s", key, data)
		}
	}

	result := JobResultParams{RunID: "r1", Status: "failed", DurationMs: 12, Error: &JobError{Code: "AGENT_EXEC_ERROR", Message: "boom", Details: map[string]any{"exitCode": 1}}}
	data, err = json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal job.result: %v", err)
	}
	if !bytes.Contains(data, []byte(`"details":{"exitCode":1}`)) {
		t.Errorf("job.result error details missing: %s", data)
	}
	var back JobResultParams
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal job.result: %v", err)
	}
	if back.Error == nil || back.Error.Details == nil {
		t.Errorf("job.result error details lost in round trip: %+v", back.Error)
	}
}

// TestTerminalParamsRoundTrip verifies the terminal stream params keep their
// wire shape.
func TestTerminalParamsRoundTrip(t *testing.T) {
	req := TerminalStreamRequestParams{SessionID: "s1", OwnerNode: "n1", FromNode: "n2"}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal terminal stream request: %v", err)
	}
	if string(data) != `{"sessionId":"s1","ownerNode":"n1","fromNode":"n2"}` {
		t.Errorf("terminal stream request wire shape changed: %s", data)
	}

	accept := TerminalStreamAcceptParams{SessionID: "s1"}
	data, _ = json.Marshal(accept)
	if string(data) != `{"sessionId":"s1"}` {
		t.Errorf("terminal stream accept wire shape changed: %s", data)
	}

	cancel := TerminalStreamCancelParams{SessionID: "s1", FromNode: "n2"}
	data, _ = json.Marshal(cancel)
	if string(data) != `{"sessionId":"s1","fromNode":"n2"}` {
		t.Errorf("terminal stream cancel wire shape changed: %s", data)
	}
}

// TestBinaryFrameEncodeDecode verifies the binary PTY frame format round-trips
// and rejects malformed frames.
func TestBinaryFrameEncodeDecode(t *testing.T) {
	cases := []struct {
		name      string
		opcode    byte
		sessionID string
		payload   []byte
	}{
		{name: "input", opcode: BinaryFrameOpcodeInput, sessionID: "s1", payload: []byte("keystroke")},
		{name: "output", opcode: BinaryFrameOpcodeOutput, sessionID: "s-remote-2", payload: []byte("hello\x00world")},
		{name: "empty payload", opcode: BinaryFrameOpcodeOutput, sessionID: "s3", payload: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			frame := EncodeBinaryFrame(tc.opcode, tc.sessionID, tc.payload)
			opcode, sessionID, payload, ok := DecodeBinaryFrame(frame)
			if !ok {
				t.Fatal("expected valid frame")
			}
			if opcode != tc.opcode || string(sessionID) != tc.sessionID || !bytes.Equal(payload, tc.payload) {
				t.Errorf("round trip mismatch: opcode=%d session=%q payload=%q", opcode, sessionID, payload)
			}
		})
	}

	for _, bad := range [][]byte{nil, {0x01}, {0x01, 'a'}, {0x01, 0}} {
		if _, _, _, ok := DecodeBinaryFrame(bad); ok {
			t.Errorf("expected malformed frame to be rejected: %v", bad)
		}
	}
}

// TestSnapshotHeaderAndVerdict verifies the workspace snapshot routing header
// and the dispatch verdict keep their wire shape.
func TestSnapshotHeaderAndVerdict(t *testing.T) {
	header := WorkspaceSnapshotChangedParams{OrganizationID: "org", SourceNodeID: "n1", TargetNodeID: "n2"}
	data, err := json.Marshal(header)
	if err != nil {
		t.Fatalf("marshal snapshot header: %v", err)
	}
	if string(data) != `{"organizationId":"org","sourceNodeId":"n1","targetNodeId":"n2"}` {
		t.Errorf("snapshot header wire shape changed: %s", data)
	}

	accepted := DispatchVerdict{Accepted: true, TargetOnline: true}
	data, _ = json.Marshal(accepted)
	if string(data) != `{"accepted":true,"targetOnline":true}` {
		t.Errorf("accepted verdict wire shape changed: %s", data)
	}

	rejected := DispatchVerdict{Accepted: false, Reason: "target node offline"}
	data, _ = json.Marshal(rejected)
	if string(data) != `{"accepted":false,"reason":"target node offline"}` {
		t.Errorf("rejected verdict wire shape changed: %s", data)
	}
}
