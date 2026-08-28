package main

import "testing"

const validInitializeResult = `{"protocolVersion":1,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false}},"authMethods":[]}`

func TestParseInitializeResult_RequiresPinnedProtocolAndAgent(t *testing.T) {
	version, err := parseInitializeResult([]byte(validInitializeResult))
	if err != nil {
		t.Fatalf("parse initialize result: %v", err)
	}
	if version != expectedACPProtocolVersion {
		t.Fatalf("protocol version = %d, want %d", version, expectedACPProtocolVersion)
	}
}

func TestParseInitializeResult_RejectsUnexpectedProtocol(t *testing.T) {
	raw := []byte(`{"protocolVersion":2,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false}},"authMethods":[]}`)
	if _, err := parseInitializeResult(raw); err == nil {
		t.Fatal("parse initialize result succeeded for protocol version 2")
	}
}

func TestParseInitializeResult_RejectsMissingOrAdditionalCapabilities(t *testing.T) {
	missing := []byte(`{"protocolVersion":1,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{},"authMethods":[]}`)
	if _, err := parseInitializeResult(missing); err == nil {
		t.Fatal("parse initialize result succeeded without prompt capabilities")
	}
	extra := []byte(`{"protocolVersion":1,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false},"tools":true},"authMethods":[]}`)
	if _, err := parseInitializeResult(extra); err == nil {
		t.Fatal("parse initialize result succeeded with an unexpected capability")
	}
}

func TestParseInitializeResult_RejectsNullCapabilitiesOrAuth(t *testing.T) {
	capability := []byte(`{"protocolVersion":1,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":null,"audio":false,"embeddedContext":false}},"authMethods":[]}`)
	if _, err := parseInitializeResult(capability); err == nil {
		t.Fatal("parse initialize result succeeded with a null capability")
	}
	auth := []byte(`{"protocolVersion":1,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false}},"authMethods":null}`)
	if _, err := parseInitializeResult(auth); err == nil {
		t.Fatal("parse initialize result succeeded with null auth methods")
	}
}

func TestParseInitializeResult_RejectsChangedIdentityOrAuth(t *testing.T) {
	identity := []byte(`{"protocolVersion":1,"agentInfo":{"name":"other","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false}},"authMethods":[]}`)
	if _, err := parseInitializeResult(identity); err == nil {
		t.Fatal("parse initialize result succeeded for another agent")
	}
	auth := []byte(`{"protocolVersion":1,"agentInfo":{"name":"deepseek-harness-acp","version":"0.0.1"},"agentCapabilities":{"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false}},"authMethods":[{"id":"token"}]}`)
	if _, err := parseInitializeResult(auth); err == nil {
		t.Fatal("parse initialize result succeeded with an auth method")
	}
}

func TestParseSessionID_RequiresNonEmptyID(t *testing.T) {
	sessionID, err := parseSessionID([]byte(`{"sessionId":"dsh-session-1"}`))
	if err != nil {
		t.Fatalf("parse session ID: %v", err)
	}
	if sessionID != "dsh-session-1" {
		t.Fatalf("session ID = %q", sessionID)
	}
}

func TestParseSessionID_RejectsMissingID(t *testing.T) {
	_, err := parseSessionID([]byte(`{}`))
	if err == nil {
		t.Fatal("parse session ID succeeded without ID")
	}
}
