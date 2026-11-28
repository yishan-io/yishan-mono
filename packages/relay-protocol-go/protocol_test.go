package relayprotocol

import (
	"bytes"
	"encoding/json"
	"testing"
)

// TestMethodConstants pins the wire method strings. Changing a value here
// breaks the deployed CLI<->relay protocol; version it instead.
func TestMethodConstants(t *testing.T) {
	if MethodPing != "relay.ping" {
		t.Errorf("MethodPing = %q, want %q", MethodPing, "relay.ping")
	}
	if MethodPong != "relay.pong" {
		t.Errorf("MethodPong = %q, want %q", MethodPong, "relay.pong")
	}
}

// TestEnvelopeRoundTrip verifies the JSON-RPC envelopes keep their wire shape.
func TestEnvelopeRoundTrip(t *testing.T) {
	req := Request{JSONRPC: "2.0", ID: json.RawMessage(`"dispatch-node-1"`), Method: MethodPing, Params: json.RawMessage(`{"organizationId":"org"}`)}
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

	notif := Notification{JSONRPC: "2.0", Method: MethodPing, Params: map[string]any{"seq": 1}}
	data, err = json.Marshal(notif)
	if err != nil {
		t.Fatalf("marshal notification: %v", err)
	}
	if !bytes.Contains(data, []byte(`"method":"relay.ping"`)) {
		t.Errorf("notification wire shape changed: %s", data)
	}

	resp := Response{JSONRPC: "2.0", ID: "dispatch-node-1", Result: map[string]bool{"ok": true}}
	data, err = json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	if !bytes.Contains(data, []byte(`"result":{"ok":true}`)) {
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
