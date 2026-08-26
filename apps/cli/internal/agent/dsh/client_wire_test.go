package dsh

import (
	"errors"
	"testing"
)

func TestParseInitializeResponse_RejectsErrorWithoutCode(t *testing.T) {
	_, err := parseInitializeResponse([]byte(`{"jsonrpc":"2.0","id":1,"error":{"message":"failed"}}`))
	if err == nil {
		t.Fatal("accepted initialize error without code")
	}
}

func TestParseRPCEnvelope_RejectsAmbiguousResponse(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":3,"result":{},"error":{"code":1,"message":"bad"}}`))
	if err == nil {
		t.Fatal("accepted response with both result and error")
	}
}

func TestParseRPCEnvelope_RejectsUnknownResponseField(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":3,"result":{},"extra":true}`))
	if err == nil {
		t.Fatal("accepted response with unknown field")
	}
}

func TestParseRPCEnvelope_RejectsIncompleteError(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":3,"error":{"message":"bad"}}`))
	if err == nil {
		t.Fatal("accepted response without an error code")
	}
}

func TestParseRPCEnvelope_RejectsNullID(t *testing.T) {
	_, err := parseRPCEnvelope([]byte(`{"jsonrpc":"2.0","id":null,"result":{}}`))
	if err == nil {
		t.Fatal("accepted response with a null id")
	}
}

func TestSupervisor_RouteOutputInvalidatesKnownMalformedNotification(t *testing.T) {
	process := &runtimeProcess{pending: make(map[uint64]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor := NewSupervisor(Config{})
	supervisor.routeOutput(process, []byte(`{"jsonrpc":"wrong","method":"session.event"}`))
	if err := process.replay.errorIfInvalid("session"); !errors.Is(err, ErrSessionReplayReset) {
		t.Fatalf("generation error = %v", err)
	}
}

func TestSupervisor_RouteOutputKeepsUnknownMalformedEnvelopeDiagnostic(t *testing.T) {
	process := &runtimeProcess{pending: make(map[uint64]chan rpcResponse), replay: newReplayCoordinator(1)}
	supervisor := NewSupervisor(Config{})
	supervisor.routeOutput(process, []byte(`{"jsonrpc":"wrong","method":"unknown.event"}`))
	if err := process.replay.errorIfInvalid("session"); err != nil {
		t.Fatalf("generation error = %v", err)
	}
}

func TestSessionReadWireResult_RequiresDurableSnapshotCursorsAndIncarnation(t *testing.T) {
	var response sessionReadWireResult
	err := decodeStrictJSON([]byte(`{
		"session":{"sessionId":"session","createdAt":1},
		"events":[],
		"incarnation":"run-1",
		"asOfSeq":-1,
		"durableThroughSeq":-1
	}`), &response)
	if err != nil {
		t.Fatalf("decodeStrictJSON: %v", err)
	}
	result, err := response.validate(SessionReadRequest{CWD: "/workspace", SessionID: "session"})
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if result.Incarnation != "run-1" || result.AsOfSeq != -1 || result.DurableThroughSeq != -1 {
		t.Fatalf("result = %#v", result)
	}
}

func TestSessionReadWireResult_RejectsUnsafeDurableSnapshotCursors(t *testing.T) {
	var response sessionReadWireResult
	err := decodeStrictJSON([]byte(`{
		"session":{"sessionId":"session","createdAt":1},
		"events":[],
		"incarnation":"run-1",
		"asOfSeq":0,
		"durableThroughSeq":-1
	}`), &response)
	if err != nil {
		t.Fatalf("decodeStrictJSON: %v", err)
	}
	if _, err := response.validate(SessionReadRequest{CWD: "/workspace", SessionID: "session"}); err == nil {
		t.Fatal("accepted divergent snapshot cursors")
	}
}
