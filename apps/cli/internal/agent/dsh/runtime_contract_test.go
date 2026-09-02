package dsh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
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
		WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
			if request.SessionID != "bound" || request.WorkspaceID != "workspace" {
				return WorkspaceBindingResult{}, errors.New("session workspace binding is not registered")
			}
			return WorkspaceBindingResult{WorkspaceID: "workspace", CWD: runtimeContractCWD, Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
		},
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

func bundledRuntimeCommand(runtimePath, dataDirectory string, executableOverride ...string) CommandFactory {
	executablePath, err := resolveBundledRuntimeExecutable(runtimePath, executableOverride)
	return func(ctx context.Context) (*exec.Cmd, error) {
		if err != nil {
			return nil, err
		}
		command := exec.CommandContext(ctx, executablePath, runtimePath)
		command.Env = append(os.Environ(), electronRunAsNodeEnvKey+"=1", dshDataDirEnvKey+"="+dataDirectory, dshTestReplayEnvKey+"=1")
		return command, nil
	}
}

func resolveBundledRuntimeExecutable(runtimePath string, executableOverride []string) (string, error) {
	if len(executableOverride) > 0 {
		return executableOverride[0], nil
	}
	desktopDirectory := filepath.Dir(filepath.Dir(filepath.Dir(runtimePath)))
	pathFile := filepath.Join(desktopDirectory, "node_modules", "electron", "path.txt")
	relativeExecutable, err := os.ReadFile(pathFile)
	if err != nil {
		return "", fmt.Errorf("read packaged Electron path: %w", err)
	}
	executable := strings.TrimSpace(string(relativeExecutable))
	if executable == "" {
		return "", fmt.Errorf("packaged Electron path is empty")
	}
	electronDirectory, err := filepath.EvalSymlinks(filepath.Dir(pathFile))
	if err != nil {
		return "", fmt.Errorf("resolve packaged Electron directory: %w", err)
	}
	return filepath.Join(electronDirectory, "dist", executable), nil
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
	binding := SessionBinding{Version: 1, WorkspaceID: "workspace", ProjectID: "project", OrganizationID: "organization", OwnerNodeID: "node", CWD: runtimeContractCWD, Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}
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

func TestSupervisor_BundledRuntime_RestartsPersistsAndResumesThroughWorkspaceBinding(t *testing.T) {
	runtimePath := buildProductionRuntime(t)
	admitted := make(chan WorkspaceBindingRequest, 2)
	supervisor := NewSupervisor(Config{
		Command:         bundledRuntimeCommand(runtimePath, t.TempDir()),
		Initialize:      InitializeConfig{CWD: runtimeContractCWD, Provider: "smoke-replay", Model: "smoke-model"},
		StartupTimeout:  30 * time.Second,
		ShutdownTimeout: 10 * time.Second,
		RestartLimit:    1,
		RestartBackoff:  time.Millisecond,
		WorkspaceBindingResolver: func(_ context.Context, request WorkspaceBindingRequest) (WorkspaceBindingResult, error) {
			admitted <- request
			return WorkspaceBindingResult{WorkspaceID: request.WorkspaceID, CWD: runtimeContractCWD, Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}, nil
		},
	})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	binding := SessionBinding{Version: 1, WorkspaceID: "workspace", ProjectID: "project", OrganizationID: "organization", OwnerNodeID: "node", CWD: runtimeContractCWD, Policy: WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}
	if _, err := supervisor.StartSession(context.Background(), SessionStartRequest{CWD: runtimeContractCWD, SessionID: "restart-bound", Binding: binding}); err != nil {
		t.Fatalf("StartSession: %v", err)
	}
	assertWorkspaceBinding(t, admitted, WorkspaceBindingRequest{SessionID: "restart-bound", WorkspaceID: "workspace"})
	if err := supervisor.Restart(context.Background()); err != nil {
		t.Fatalf("Restart: %v", err)
	}
	if _, err := supervisor.ResumeSession(context.Background(), SessionResumeRequest{CWD: runtimeContractCWD, SessionID: "restart-bound", WorkspaceID: "workspace"}); err != nil {
		t.Fatalf("ResumeSession: %v", err)
	}
	assertWorkspaceBinding(t, admitted, WorkspaceBindingRequest{SessionID: "restart-bound", WorkspaceID: "workspace"})
}

func assertWorkspaceBinding(t *testing.T, admitted <-chan WorkspaceBindingRequest, want WorkspaceBindingRequest) {
	t.Helper()
	select {
	case got := <-admitted:
		if got != want {
			t.Fatalf("workspace binding = %#v, want %#v", got, want)
		}
	case <-time.After(10 * time.Second):
		t.Fatalf("timed out waiting for workspace binding %#v", want)
	}
}

func TestBundledRuntimeCommand_UsesElectronAsNode(t *testing.T) {
	desktopDirectory := repositoryDesktopDirectory(t)
	wantExecutable := packagedElectronExecutable(t, desktopDirectory)
	runtimePath := filepath.Join(desktopDirectory, "dist", "resources", "dsh-runtime.mjs")
	dataDirectory := t.TempDir()

	command, err := bundledRuntimeCommand(runtimePath, dataDirectory)(context.Background())
	if err != nil {
		t.Fatalf("build bundled runtime command: %v", err)
	}
	if command.Path != wantExecutable {
		t.Fatalf("command path = %q, want packaged Electron %q", command.Path, wantExecutable)
	}
	if !hasEnvironment(command.Env, electronRunAsNodeEnvKey, "1") {
		t.Fatalf("command env = %#v, want %s=1", command.Env, electronRunAsNodeEnvKey)
	}
}

func packagedElectronExecutable(t *testing.T, desktopDirectory string) string {
	t.Helper()
	pathFile := filepath.Join(desktopDirectory, "node_modules", "electron", "path.txt")
	relativeExecutable, err := os.ReadFile(pathFile)
	if err != nil {
		t.Fatalf("read packaged Electron path: %v", err)
	}
	electronDirectory, err := filepath.EvalSymlinks(filepath.Dir(pathFile))
	if err != nil {
		t.Fatalf("resolve packaged Electron directory: %v", err)
	}
	return filepath.Join(electronDirectory, "dist", strings.TrimSpace(string(relativeExecutable)))
}

func TestBundledRuntimeCommand_PreservesExplicitExecutableOverride(t *testing.T) {
	const executableOverride = "/custom/electron"

	command, err := bundledRuntimeCommand("/custom/dsh-runtime.mjs", t.TempDir(), executableOverride)(context.Background())
	if err != nil {
		t.Fatalf("build bundled runtime command: %v", err)
	}
	if command.Path != executableOverride {
		t.Fatalf("command path = %q, want explicit override %q", command.Path, executableOverride)
	}
	if !hasEnvironment(command.Env, electronRunAsNodeEnvKey, "1") {
		t.Fatalf("command env = %#v, want %s=1", command.Env, electronRunAsNodeEnvKey)
	}
}
