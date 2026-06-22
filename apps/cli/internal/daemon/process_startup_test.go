package daemon

import (
	"testing"

	"yishan/apps/cli/internal/config"
	cliruntime "yishan/apps/cli/internal/runtime"
)

func TestRegisterNodeSkipsAgentDetectionDuringStartup(t *testing.T) {
	t.Parallel()

	originalRegisterStartupRemoteNode := registerStartupRemoteNode
	t.Cleanup(func() {
		registerStartupRemoteNode = originalRegisterStartupRemoteNode
	})

	var captured NodeRegistration
	registerStartupRemoteNode = func(runtime *cliruntime.Runtime, registration NodeRegistration) error {
		captured = registration
		return nil
	}

	runtime := cliruntime.New(&config.Config{
		API: config.APIConfig{
			BaseURL: "http://127.0.0.1:8789",
			Token:   "yst_test_token",
		},
	})

	err := registerNode(&daemonRuntime{
		actualAddr: "127.0.0.1:62383",
		daemonID:   "node-123",
	}, runtime)
	if err != nil {
		t.Fatalf("registerNode returned error: %v", err)
	}

	if captured.ID != "node-123" {
		t.Fatalf("expected node ID %q, got %q", "node-123", captured.ID)
	}
	if captured.Endpoint != "http://127.0.0.1:62383" {
		t.Fatalf("expected endpoint %q, got %q", "http://127.0.0.1:62383", captured.Endpoint)
	}
	if len(captured.AgentDetectionStatus) != 0 {
		t.Fatalf("expected startup registration to skip agent detection, got %d statuses", len(captured.AgentDetectionStatus))
	}
}
