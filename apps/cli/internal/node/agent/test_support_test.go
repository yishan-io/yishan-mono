package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/adapter/cloud/session"
	modellist "yishan/apps/cli/internal/agent/catalog"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/events"
	"yishan/apps/cli/internal/node/context"
	nodeterminal "yishan/apps/cli/internal/node/terminal"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
	term "yishan/apps/cli/internal/terminal"
)

// newTestService builds an agent application service for tests with a router
// wired for the pi/skill/customize namespaces.
func newTestService(t *testing.T, runtime *session.Session, nodeID string) *Service {
	t.Helper()
	events := eventbus.NewHub()
	terminals := term.NewManager()
	nodeterminal.WireTerminalListeners(terminals, events)
	agentLifecycleCtx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	svc := NewService(Deps{
		AgentMgr:             agentmanager.NewManager(),
		PIAuth:               NewManagedPiAuthStore(),
		ModelList:            modellist.NewService(),
		Events:               events,
		Terminals:            terminals,
		ContextStore:         contextstore.NewStore(""),
		AgentLifecycleCtx:    agentLifecycleCtx,
		AgentLifecycleCancel: cancel,
		ServerCtx:            context.Background(),
	})
	router := rpc.NewRouter()
	router.Register("pi", &rpc.AgentHandler{Pi: svc, Skill: svc, Customize: svc})
	router.Register("skill", &rpc.AgentHandler{Pi: svc, Skill: svc, Customize: svc})
	router.Register("customize", &rpc.AgentHandler{Pi: svc, Skill: svc, Customize: svc})
	svc.router = router
	return svc
}

// newTestHandler builds a plain agent service with a wired router.
func newTestHandler(t *testing.T) *Service {
	t.Helper()
	return newTestService(t, nil, "node-1")
}

// callRPCForTest routes a method+params through the namespace router, the
// same path rpc.Server uses for live connections.
func (s *Service) callRPCForTest(ctx context.Context, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, &rpc.Connection{}, method, params)
}

// callAgentRPCForTest routes an agent-namespace method (pi./skill./customize.)
// through the namespace router with an explicit connection.
func (s *Service) callAgentRPCForTest(ctx context.Context, conn *rpc.Connection, method string, params json.RawMessage) (any, error) {
	return s.router.Call(ctx, conn, method, params)
}

// installFakePiBinary writes a fake `pi` script that records the managed pi
// agent dir env value into markerPath, and puts it on PATH.
func installFakePiBinary(t *testing.T, markerPath string) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s' \"$%s\" > %q\n", config.PiAgentDirEnvKey, markerPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

// waitForFileContent polls path until it has content or the deadline expires.
func waitForFileContent(t *testing.T, path string) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			return string(content)
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", path)
	return ""
}
