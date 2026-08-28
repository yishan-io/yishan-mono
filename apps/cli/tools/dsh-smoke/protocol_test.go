package main

import (
	"bufio"
	"strings"
	"testing"
)

func TestParseResponse_Initialize(t *testing.T) {
	envelope, err := parseResponse([]byte(`{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}`))
	if err != nil {
		t.Fatalf("parse response: %v", err)
	}
	if envelope.ID != 1 {
		t.Fatalf("id = %d, want 1", envelope.ID)
	}
	if string(envelope.Result) != `{"protocolVersion":1}` {
		t.Fatalf("result = %s", envelope.Result)
	}
}

func TestParseResponse_RejectsProtocolNotification(t *testing.T) {
	_, err := parseResponse([]byte(`{"jsonrpc":"2.0","method":"session/update","params":{}}`))
	if err == nil {
		t.Fatal("parse response succeeded for notification")
	}
}

func TestReadResponse_ReturnsExpectedRPCError(t *testing.T) {
	scanner := bufio.NewScanner(strings.NewReader(`{"jsonrpc":"2.0","id":3,"error":{"code":-32600,"message":"invalid prompt"}}`))
	_, err := readResponse(scanner, 3)
	if err == nil || !strings.Contains(err.Error(), "invalid prompt") {
		t.Fatalf("error = %v, want invalid prompt", err)
	}
}

func TestParseResponse_RejectsErrorResponse(t *testing.T) {
	envelope, err := parseResponse([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"invalid"}}`))
	if err == nil {
		t.Fatal("parse response succeeded for error response")
	}
	if envelope.ID != 1 {
		t.Fatalf("error response id = %d, want 1", envelope.ID)
	}
}
