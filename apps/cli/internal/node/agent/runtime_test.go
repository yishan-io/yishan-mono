package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/workspace"
)

func TestService_AgentStartDispatchesToDSHRuntime(t *testing.T) {
	runtime := &recordingDSHSessions{}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, ProjectID: "project", OrgID: "organization", Path: "/workspace", State: workspace.StateActive}, nil
		}),
		DSH:         runtime,
		OwnerNodeID: "node",
	})
	_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "session-1", TabID: "tab-1", WorkspaceID: "workspace-1", CWD: "/workspace",
	})
	if err != nil {
		t.Fatalf("AgentStart: %v", err)
	}
	if got := runtime.startRequest.Binding; got != (dsh.SessionBinding{Version: 1, WorkspaceID: "workspace-1", ProjectID: "project", OrganizationID: "organization", OwnerNodeID: "node", CWD: "/workspace", Policy: dsh.WorkspaceBindingPolicy{Authorization: "daemon-authorized"}}) {
		t.Fatalf("start binding = %#v", got)
	}
}

func TestService_DSHSelectionUsesConfiguredDefaultRoute(t *testing.T) {
	runtime := &recordingDSHSessions{}
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(id string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: id, Path: "/workspace", State: workspace.StateActive}, nil
	}), DSH: runtime, OwnerNodeID: "node", DSHProvider: "configured-provider", DSHModel: "configured-model"})
	_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "session", TabID: "tab", WorkspaceID: "workspace", CWD: "/workspace"})
	if err != nil {
		t.Fatalf("AgentStart: %v", err)
	}
	if got := runtime.startRequest.AgentOptions; got == nil || got.Provider != "configured-provider" || got.Model != "configured-model" {
		t.Fatalf("start selection = %#v", got)
	}
	_, err = service.AgentSetModel(context.Background(), rpc.AgentSetModelParams{SessionID: "session", WorkspaceID: "workspace", CWD: "/workspace", ModelID: "configured-model"})
	if err != nil {
		t.Fatalf("AgentSetModel: %v", err)
	}
	if got := runtime.setModelRequest; got.Provider != "configured-provider" || got.Model != "configured-model" {
		t.Fatalf("set selection = %#v", got)
	}
}

func TestService_AgentInspectionDispatchesToAuthorizedRuntime(t *testing.T) {
	runtime := &recordingDSHSessions{listResult: dsh.SessionListResult{Sessions: []dsh.SessionListEntry{{SessionID: "dsh-1"}}}}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/authorized/workspace", State: workspace.StateActive}, nil
		}),
		DSH: runtime,
	})
	result, err := service.AgentListSessions(context.Background(), rpc.AgentListSessionsParams{
		Runtime: rpc.AgentRuntimeDSH, WorkspaceID: "workspace-1", CWD: "/authorized/workspace",
	})
	if err != nil {
		t.Fatalf("AgentListSessions: %v", err)
	}
	response := result.(rpc.AgentSessionsResult)
	if response.Runtime != rpc.AgentRuntimeDSH || runtime.listCWD != "/authorized/workspace" {
		t.Fatalf("response = %#v, runtime cwd = %q", response, runtime.listCWD)
	}
	historyResult, err := service.AgentReadHistory(context.Background(), rpc.AgentReadHistoryParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "dsh-1", WorkspaceID: "workspace-1", CWD: "/authorized/workspace",
	})
	if err != nil {
		t.Fatalf("AgentReadHistory: %v", err)
	}
	if response := historyResult.(rpc.AgentHistoryResult); response.Runtime != rpc.AgentRuntimeDSH || runtime.readCWD != "/authorized/workspace" {
		t.Fatalf("history = %#v, runtime cwd = %q", response, runtime.readCWD)
	}
	if runtime.resumeCWD != "" {
		t.Fatal("agent.readHistory resumed DSH")
	}
}

func TestService_AgentGetSessionFilePathDispatchesToAuthorizedRuntime(t *testing.T) {
	runtime := &recordingDSHSessions{filePathResult: dsh.SessionFilePathResult{FilePath: "/authorized/session.jsonl"}}
	service := NewService(Deps{
		Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
			return workspace.Workspace{ID: workspaceID, Path: "/authorized", State: workspace.StateActive}, nil
		}),
		DSH: runtime,
	})
	result, err := service.AgentGetSessionFilePath(context.Background(), rpc.AgentGetSessionFilePathParams{
		Runtime: rpc.AgentRuntimeDSH, SessionID: "dsh-1", WorkspaceID: "workspace-1", CWD: "/authorized",
	})
	if err != nil {
		t.Fatalf("AgentGetSessionFilePath: %v", err)
	}
	if response := result.(rpc.AgentSessionFilePathResult); response.FilePath != "/authorized/session.jsonl" || runtime.readCWD != "/authorized" {
		t.Fatalf("response = %#v, runtime cwd = %q", response, runtime.readCWD)
	}
}

func TestService_AgentExecutionMethodsRequireDSHRegistryOwnership(t *testing.T) {
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: "/w", State: workspace.StateActive}, nil
	})})
	for _, call := range []struct {
		name string
		call func() error
	}{
		{"attach", func() error {
			_, err := service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", WorkspaceID: "w", CWD: "/w"})
			return err
		}},
		{"prompt", func() error {
			_, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/w", Message: []byte(`{}`)})
			return err
		}},
		{"abort", func() error {
			_, err := service.AgentAbort(context.Background(), rpc.AgentAbortParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/w"})
			return err
		}},
		{"dispose", func() error {
			_, err := service.AgentDispose(context.Background(), rpc.AgentDisposeParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/w"})
			return err
		}},
	} {
		t.Run(call.name, func(t *testing.T) { assertRPCErrorCode(t, call.call(), rpc.CodeNotFound) })
	}
}

func TestService_AgentPiInspectionReturnsRuntimeTag(t *testing.T) {
	workspacePath := t.TempDir()
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: workspacePath, State: workspace.StateActive}, nil
	})})
	result, err := service.AgentListSessions(context.Background(), rpc.AgentListSessionsParams{
		Runtime: rpc.AgentRuntimePi, WorkspaceID: "workspace-1", CWD: workspacePath,
	})
	if err != nil {
		t.Fatalf("AgentListSessions: %v", err)
	}
	if response := result.(rpc.AgentSessionsResult); response.Runtime != rpc.AgentRuntimePi {
		t.Fatalf("response = %#v", response)
	}
}

func TestService_AgentFacadeValidatesRuntimeAndWorkspaceFields(t *testing.T) {
	service := NewService(Deps{})
	_, err := service.AgentListSessions(context.Background(), rpc.AgentListSessionsParams{
		Runtime: "unknown", WorkspaceID: "workspace-1", CWD: "/workspace",
	})
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)
	_, err = service.AgentListSessions(context.Background(), rpc.AgentListSessionsParams{Runtime: rpc.AgentRuntimePi, CWD: "/workspace"})
	assertRPCErrorCode(t, err, rpc.CodeInvalidParams)
}

func TestService_AgentOperationsRejectMismatchedWorkspacePath(t *testing.T) {
	service := NewService(Deps{Workspace: testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: "/authorized", State: workspace.StateActive}, nil
	})})
	for _, call := range []func() error{
		func() error {
			_, err := service.AgentStart(context.Background(), nil, rpc.AgentStartParams{Runtime: rpc.AgentRuntimePi, SessionID: "s", TabID: "t", WorkspaceID: "w", CWD: "/supplied"})
			return err
		},
		func() error {
			_, err := service.AgentListSessions(context.Background(), rpc.AgentListSessionsParams{Runtime: rpc.AgentRuntimePi, WorkspaceID: "w", CWD: "/supplied"})
			return err
		},
		func() error {
			_, err := service.AgentReadHistory(context.Background(), rpc.AgentReadHistoryParams{Runtime: rpc.AgentRuntimePi, SessionID: "s", WorkspaceID: "w", CWD: "/supplied"})
			return err
		},
	} {
		assertRPCErrorCode(t, call(), rpc.CodeInvalidParams)
	}
}

func TestBuildAgentPromptCommand_EncodesSemanticPrompt(t *testing.T) {
	command, err := buildAgentPromptCommand(rpc.AgentRuntimePi, json.RawMessage(`"hello"`), "steer")
	if err != nil {
		t.Fatalf("buildAgentPromptCommand: %v", err)
	}
	if got := string(command); got != `{"type":"prompt","message":"hello","streamingBehavior":"steer"}` {
		t.Fatalf("command = %s", got)
	}
	command, err = buildAgentPromptCommand(rpc.AgentRuntimeDSH, json.RawMessage(`"hello"`), "steer")
	if err != nil {
		t.Fatalf("build DSH prompt command: %v", err)
	}
	if got := string(command); got != `{"type":"prompt","message":"hello"}` {
		t.Fatalf("DSH command = %s", got)
	}
}

func TestService_AgentAttachRejectsLiveSessionOwnershipMismatch(t *testing.T) {
	service, originalConnection, cwd := startPiForAttachTest(t)
	defer stopPiForAttachTest(t, service, originalConnection, "session-attach")
	service.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: cwd, State: workspace.StateActive}, nil
	})

	_, err := service.AgentAttach(context.Background(), &rpc.Connection{}, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "session-attach", WorkspaceID: "other-workspace", CWD: cwd,
	})
	assertRPCErrorCode(t, err, rpc.CodeNotFound)
	assertPiAttachOwnership(t, service, originalConnection)
}

func TestService_AgentAbortKeepsSessionLiveAndDisposeStopsIt(t *testing.T) {
	homeDir := t.TempDir()
	markerPath := filepath.Join(homeDir, "abort-command")
	installRecordingPiBinary(t, markerPath)
	cwd := filepath.Join(homeDir, "workspace")
	if err := os.MkdirAll(cwd, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	service := newTestHandler(t)
	service.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		return workspace.Workspace{ID: workspaceID, Path: cwd, State: workspace.StateActive}, nil
	})
	_, err := service.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{
		SessionID: "abort-session", TabID: "tab", WorkspaceID: "workspace", CWD: cwd,
	})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer func() { _, _ = service.Stop(context.Background(), rpc.PiStopParams{SessionID: "abort-session"}) }()

	_, err = service.AgentAbort(context.Background(), rpc.AgentAbortParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "abort-session", WorkspaceID: "workspace", CWD: cwd,
	})
	if err != nil {
		t.Fatalf("AgentAbort: %v", err)
	}
	if got := waitForFileContent(t, markerPath); got != `{"type":"abort"}` {
		t.Fatalf("abort command = %q", got)
	}
	if _, live := service.deps.AgentMgr.Session("abort-session"); !live {
		t.Fatal("AgentAbort disposed the live session")
	}

	_, err = service.AgentDispose(context.Background(), rpc.AgentDisposeParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "abort-session", WorkspaceID: "workspace", CWD: cwd,
	})
	if err != nil {
		t.Fatalf("AgentDispose: %v", err)
	}
	if _, exists := service.piSessions.Get("abort-session"); exists {
		t.Fatal("AgentDispose kept the registry session")
	}
}

func installRecordingPiBinary(t *testing.T, markerPath string) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nIFS= read -r command || exit 0\nprintf '%s' \"$command\" > " + markerPath + "\nwhile IFS= read -r _; do :; done\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func TestService_AgentPromptAndAbortDoNotSendToSameIDReplacement(t *testing.T) {
	for _, operation := range []struct {
		name string
		call func(*Service, string) error
		want string
	}{
		{"prompt", callOwnedPrompt, `{"type":"prompt","message":"hello"}`},
		{"abort", callOwnedAbort, `{"type":"abort"}`},
	} {
		t.Run(operation.name, func(t *testing.T) {
			service, originalPath, replacementPath := startReplacementRaceSessions(t)
			service.afterOwnedProcess = func() { replaceRaceSession(t, service, replacementPath) }

			if err := operation.call(service, originalPath); err != nil {
				t.Fatalf("Agent%s: %v", operation.name, err)
			}
			if got := waitForFileContent(t, filepath.Join(originalPath, "command")); got != operation.want {
				t.Fatalf("original command = %q, want %q", got, operation.want)
			}
			if _, err := os.Stat(filepath.Join(replacementPath, "command")); !os.IsNotExist(err) {
				t.Fatalf("replacement received neutral command: %v", err)
			}
		})
	}
}

func TestService_AgentDisposeDoesNotStopSameIDReplacement(t *testing.T) {
	service, originalPath, replacementPath := startReplacementRaceSessions(t)
	service.afterStopClaim = func() { replaceRaceSession(t, service, replacementPath) }

	_, err := service.AgentDispose(context.Background(), rpc.AgentDisposeParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "same-id", WorkspaceID: "workspace-a", CWD: originalPath,
	})
	if err != nil {
		t.Fatalf("AgentDispose: %v", err)
	}
	replacement, isLive := service.deps.AgentMgr.Session("replacement-id")
	if !isLive {
		t.Fatal("AgentDispose stopped the same-ID replacement")
	}
	state, exists := service.piSessions.Get("same-id")
	if !exists || state.Process != replacement || state.WorkspaceID != "workspace-b" {
		t.Fatalf("replacement registry state = %#v", state)
	}
}

func callOwnedPrompt(service *Service, cwd string) error {
	_, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "same-id", WorkspaceID: "workspace-a", CWD: cwd, Message: json.RawMessage(`"hello"`),
	})
	return err
}

func callOwnedAbort(service *Service, cwd string) error {
	_, err := service.AgentAbort(context.Background(), rpc.AgentAbortParams{
		Runtime: rpc.AgentRuntimePi, SessionID: "same-id", WorkspaceID: "workspace-a", CWD: cwd,
	})
	return err
}

func startReplacementRaceSessions(t *testing.T) (*Service, string, string) {
	t.Helper()
	installWorkspaceRecordingPiBinary(t)
	originalPath := filepath.Join(t.TempDir(), "workspace-a")
	replacementPath := filepath.Join(t.TempDir(), "workspace-b")
	for _, path := range []string{originalPath, replacementPath} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir workspace: %v", err)
		}
	}
	service := newTestHandler(t)
	service.deps.Workspace = testWorkspaceResolver(func(workspaceID string) (workspace.Workspace, error) {
		if workspaceID == "workspace-a" {
			return workspace.Workspace{ID: workspaceID, Path: originalPath, State: workspace.StateActive}, nil
		}
		return workspace.Workspace{ID: workspaceID, Path: replacementPath, State: workspace.StateActive}, nil
	})
	startReplacementRaceSession(t, service, "same-id", "workspace-a", originalPath)
	startReplacementRaceSession(t, service, "replacement-id", "workspace-b", replacementPath)
	t.Cleanup(func() { service.deps.AgentMgr.StopAll() })
	return service, originalPath, replacementPath
}

func startReplacementRaceSession(t *testing.T, service *Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	_, err := service.Start(context.Background(), &rpc.Connection{}, rpc.PiStartParams{
		SessionID: sessionID, TabID: "tab", WorkspaceID: workspaceID, CWD: cwd,
	})
	if err != nil {
		t.Fatalf("Start %s: %v", sessionID, err)
	}
}

func replaceRaceSession(t *testing.T, service *Service, replacementPath string) {
	t.Helper()
	replacement, isLive := service.deps.AgentMgr.Session("replacement-id")
	if !isLive {
		t.Fatal("replacement process is not live")
	}
	service.piSessions.Register("same-id", nil, replacement, "tab", "workspace-b", replacementPath, false)
}

func installWorkspaceRecordingPiBinary(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nIFS= read -r command || exit 0\nprintf '%s' \"$command\" > \"$PWD/command\"\nwhile IFS= read -r _; do :; done\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func TestMapAgentSessions_UsesAuthoritativeWorkspacePath(t *testing.T) {
	workspacePath := "/authorized/workspace"
	piSessions := mapPiSessions([]process.SessionSummary{{
		SessionID: "pi-1", CWD: "/untrusted/session", Timestamp: time.UnixMilli(1_700_000_000_000),
	}}, workspacePath)
	dshSessions := mapDSHSessions([]dsh.SessionListEntry{{SessionID: "dsh-1", CreatedAt: 1_700_000_001_000}}, workspacePath)

	if got := piSessions[0]; got.CWD != workspacePath || got.CreatedAt != 1_700_000_000_000 {
		t.Fatalf("Pi session = %#v", got)
	}
	if got := dshSessions[0]; got.CWD != workspacePath || got.CreatedAt != 1_700_000_001_000 {
		t.Fatalf("DSH session = %#v", got)
	}
}
