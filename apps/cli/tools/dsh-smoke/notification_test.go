package main

import "testing"

func TestParseAssistantTextUpdate_ReturnsCommittedText(t *testing.T) {
	line := []byte(`{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"session-1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"PONG"}}}}`)
	if text := parseAssistantTextUpdate(line, "session-1"); text != "PONG" {
		t.Fatalf("text = %q, want PONG", text)
	}
}

func TestParseAssistantTextUpdate_IgnoresOtherSessions(t *testing.T) {
	line := []byte(`{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"session-2","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"PONG"}}}}`)
	if text := parseAssistantTextUpdate(line, "session-1"); text != "" {
		t.Fatalf("text = %q, want empty", text)
	}
}
