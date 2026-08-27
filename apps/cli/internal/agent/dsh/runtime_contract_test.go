package dsh

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

const runtimeContractCWD = "/dsh-runtime-smoke"

func TestSupervisor_StartSession_BundledRuntimeRequiresAndPersistsBinding(t *testing.T) {
	runtimePath := buildProductionRuntime(t)
	supervisor := NewSupervisor(Config{
		Command:         bundledRuntimeCommand(runtimePath, t.TempDir()),
		Initialize:      InitializeConfig{CWD: runtimeContractCWD, Provider: "smoke-replay", Model: "smoke-model"},
		StartupTimeout:  30 * time.Second,
		ShutdownTimeout: 10 * time.Second,
		RestartLimit:    1,
		RestartBackoff:  time.Millisecond,
	})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	assertMissingBindingRejected(t, supervisor)
	assertExactBindingPersisted(t, supervisor)
}

func buildProductionRuntime(t *testing.T) string {
	t.Helper()
	desktopDirectory := repositoryDesktopDirectory(t)
	command := exec.Command("bun", "run", "dsh:build")
	command.Dir = desktopDirectory
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("build production DSH runtime: %v\n%s", err, output)
	}
	return filepath.Join(desktopDirectory, "dist", "resources", "dsh-runtime.mjs")
}

func repositoryDesktopDirectory(t *testing.T) string {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate runtime contract source")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "..", "..", "..", "..", "..", "apps", "desktop"))
}

func bundledRuntimeCommand(runtimePath, dataDirectory string) CommandFactory {
	return func(ctx context.Context) (*exec.Cmd, error) {
		command := exec.CommandContext(ctx, "node", runtimePath)
		command.Env = append(os.Environ(), "YISHAN_DSH_DATA_DIR="+dataDirectory, "YISHAN_DSH_TEST_REPLAY=1")
		return command, nil
	}
}

func assertMissingBindingRejected(t *testing.T, supervisor *Supervisor) {
	t.Helper()
	_, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: runtimeContractCWD, SessionID: "missing-binding"})
	if err == nil {
		t.Fatal("StartSession accepted a missing binding")
	}
}

func assertExactBindingPersisted(t *testing.T, supervisor *Supervisor) {
	t.Helper()
	binding := SessionBinding{Version: 1, WorkspaceID: "workspace", ProjectID: "project", OrganizationID: "organization", OwnerNodeID: "node", CWD: runtimeContractCWD}
	if _, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: runtimeContractCWD, SessionID: "bound", Binding: binding}); err != nil {
		t.Fatalf("StartSession: %v", err)
	}
	subscription, err := supervisor.SubscribeSession(context.Background(), SessionSubscribeRequest{CWD: runtimeContractCWD, SessionID: "bound", AfterSeq: -1})
	if err != nil {
		t.Fatalf("SubscribeSession: %v", err)
	}
	defer subscription.Unsubscribe()
	if len(subscription.Snapshot.Events) != 1 || subscription.Snapshot.Events[0].Seq != 0 {
		t.Fatalf("binding snapshot = %#v", subscription.Snapshot)
	}
	var event struct {
		Type string         `json:"type"`
		Data SessionBinding `json:"data"`
	}
	if err := json.Unmarshal(subscription.Snapshot.Events[0].Event, &event); err != nil {
		t.Fatalf("decode binding event: %v", err)
	}
	if event.Type != "yishan/session-bound.v1" || event.Data != binding {
		t.Fatalf("persisted binding = %#v", event)
	}
}
