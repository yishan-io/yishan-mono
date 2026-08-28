package dsh

import (
	"context"
	"encoding/json"
	"testing"
)

func TestNormalizeSessionAgentOptions_SerializesLegacyProvider(t *testing.T) {
	tests := []struct {
		name         string
		input        *SessionAgentOptions
		wantProvider string
		wantModel    string
	}{
		{name: "nil options", wantProvider: defaultLegacyProvider, wantModel: defaultLegacyModel},
		{name: "model without provider", input: &SessionAgentOptions{Model: "deepseek-v4"}, wantProvider: defaultLegacyProvider, wantModel: "deepseek-v4"},
		{name: "explicit provider", input: &SessionAgentOptions{Provider: "runtime-provider", Model: "model"}, wantProvider: "runtime-provider", wantModel: "model"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			serialized, err := json.Marshal(struct {
				AgentOptions *SessionAgentOptions `json:"agentOptions"`
			}{AgentOptions: normalizeSessionAgentOptions(test.input)})
			if err != nil {
				t.Fatalf("Marshal normalized options: %v", err)
			}
			var wire struct {
				AgentOptions SessionAgentOptions `json:"agentOptions"`
			}
			if err := json.Unmarshal(serialized, &wire); err != nil {
				t.Fatalf("Unmarshal normalized options: %v", err)
			}
			if wire.AgentOptions.Provider != test.wantProvider || wire.AgentOptions.Model != test.wantModel {
				t.Fatalf("serialized options = %#v, want provider %q and model %q", wire.AgentOptions, test.wantProvider, test.wantModel)
			}
		})
	}
}

func TestNormalizeLegacyProvider_SerializesSetModelProvider(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		wantProvider string
	}{
		{name: "missing provider", wantProvider: defaultLegacyProvider},
		{name: "explicit provider", input: "runtime-provider", wantProvider: "runtime-provider"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			serialized, err := json.Marshal(SetModelRequest{CWD: "/workspace", SessionID: "session", Model: "model", Provider: normalizeLegacyProvider(test.input)})
			if err != nil {
				t.Fatalf("Marshal normalized model request: %v", err)
			}
			var wire SetModelRequest
			if err := json.Unmarshal(serialized, &wire); err != nil {
				t.Fatalf("Unmarshal normalized model request: %v", err)
			}
			if wire.Provider != test.wantProvider {
				t.Fatalf("serialized provider = %q, want %q", wire.Provider, test.wantProvider)
			}
		})
	}
}

func TestSupervisor_ProviderlessLegacyRequestsSerializeDefaultProvider(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-provider")})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	for _, request := range []SessionStartRequest{
		{CWD: "/workspace", SessionID: "nil-options", Binding: testSessionBinding("/workspace")},
		{CWD: "/workspace", SessionID: "model-only", Binding: testSessionBinding("/workspace"), AgentOptions: &SessionAgentOptions{Model: "deepseek-v4"}},
	} {
		if _, err := supervisor.StartSession(context.Background(), request); err != nil {
			t.Fatalf("StartSession(%s): %v", request.SessionID, err)
		}
	}
	if err := supervisor.SetModelSession(context.Background(), SetModelRequest{CWD: "/workspace", SessionID: "model-only", Model: "deepseek-v4"}); err != nil {
		t.Fatalf("SetModelSession: %v", err)
	}
}
