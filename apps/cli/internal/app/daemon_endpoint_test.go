package app

import (
	"testing"

	"yishan/apps/cli/internal/memory"
)

func TestBootstrapPropagatesDaemonEndpoint(t *testing.T) {
	database := openTestDB(t)
	endpoint := "ws://127.0.0.1:4312/ws"
	application, err := Bootstrap(Config{
		NodeID: "node-1", Database: database, EnvDir: t.TempDir(), DataDir: t.TempDir(),
		MemorySummarizer: memory.SummarizerConfig{}, DaemonWSEndpoint: endpoint,
	})
	if err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}
	defer application.Close()

	if application.agentSvc == nil || application.agentSvc.DaemonWSEndpoint() != endpoint {
		t.Fatal("expected endpoint propagated to Pi service")
	}
	if application.terminals.DaemonWSEndpoint() != endpoint {
		t.Fatal("expected endpoint propagated to terminal manager")
	}
}
