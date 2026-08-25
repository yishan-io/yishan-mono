package dsh

import "testing"

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
