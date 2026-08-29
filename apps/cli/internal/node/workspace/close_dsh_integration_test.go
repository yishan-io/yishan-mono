package workspace

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	agentmanager "yishan/apps/cli/internal/agent/process"
	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/rpc"
	workspaceDomain "yishan/apps/cli/internal/workspace"
)

func TestCloseLifecycle_DSHOperationBarrierDisposesOnlyClosedWorkspace(t *testing.T) {
	markerPath, releasePath := closeDSHBarrierPaths(t)
	svc := newTestService(t, nil, "node-1")
	matchingPath, unrelatedPath := openCloseDSHWorkspaces(t, svc)
	supervisor := newCloseDSHSupervisor(t, markerPath, releasePath, matchingPath)
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("start supervisor: %v", err)
	}
	t.Cleanup(func() { _ = supervisor.Close() })
	agents := nodeagent.NewService(nodeagent.Deps{Workspace: svc, DSH: supervisor, OwnerNodeID: "node-1", AgentMgr: agentmanager.NewManager()})
	t.Cleanup(agents.Shutdown)
	wireRealAgentCleanup(svc, agents)
	startCloseDSHSession(t, svc, agents, "unrelated-session", "unrelated", unrelatedPath)
	startCloseDSHSession(t, svc, agents, "matching-session", "matching", matchingPath)
	promptDone := startBlockingCloseDSHPrompt(agents, matchingPath)
	waitForCloseDSHMarker(t, markerPath)
	cleanupAdmissionClosed := make(chan struct{})
	releaseCleanup := make(chan struct{})
	agents.SetAfterWorkspaceCleanupAdmissionClosedForTest(func() {
		close(cleanupAdmissionClosed)
		<-releaseCleanup
	})
	closeDone := startWorkspaceClose(svc)
	<-cleanupAdmissionClosed
	assertLateDSHStartRejectedForWorkspaceClosing(t, agents, matchingPath)
	close(releaseCleanup)
	releaseCloseDSHPrompt(t, releasePath)
	if err := <-promptDone; err != nil {
		t.Fatalf("crossing prompt: %v", err)
	}
	if err := <-closeDone; err != nil {
		t.Fatalf("close workspace: %v", err)
	}
	assertCloseDSHResults(t, agents, matchingPath, unrelatedPath, markerPath)
}

func closeDSHBarrierPaths(t *testing.T) (string, string) {
	t.Helper()
	directory := t.TempDir()
	return filepath.Join(directory, "started"), filepath.Join(directory, "release")
}

func newCloseDSHSupervisor(t *testing.T, markerPath, releasePath, cwd string) *dsh.Supervisor {
	t.Helper()
	return dsh.NewSupervisor(dsh.Config{Command: func(context.Context) (*exec.Cmd, error) {
		command := exec.Command(os.Args[0], "-test.run=TestCloseDSHIntegrationHelper", "--")
		command.Env = append(os.Environ(), "GO_WANT_CLOSE_DSH_INTEGRATION=1", "CLOSE_DSH_MARKER="+markerPath, "CLOSE_DSH_RELEASE="+releasePath)
		return command, nil
	}, Initialize: dsh.InitializeConfig{CWD: cwd, Provider: "deepseek-official", Model: "deepseek-v4-flash"}})
}

func openCloseDSHWorkspaces(t *testing.T, svc *Service) (string, string) {
	t.Helper()
	matchingPath, unrelatedPath := t.TempDir(), t.TempDir()
	openLocalWorkspace(t, svc, "matching", matchingPath)
	openLocalWorkspace(t, svc, "unrelated", unrelatedPath)
	matchingWorkspace, err := svc.GetWorkspace("matching")
	if err != nil {
		t.Fatalf("get matching workspace: %v", err)
	}
	unrelatedWorkspace, err := svc.GetWorkspace("unrelated")
	if err != nil {
		t.Fatalf("get unrelated workspace: %v", err)
	}
	return matchingWorkspace.Path, unrelatedWorkspace.Path
}

func startCloseDSHSession(t *testing.T, svc *Service, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	workspaceEntry, lookupErr := svc.GetWorkspace(workspaceID)
	if lookupErr != nil {
		t.Fatalf("lookup %s: %v", workspaceID, lookupErr)
	}
	if workspaceEntry.Path != cwd {
		t.Fatalf("workspace cwd = %q, request cwd = %q", workspaceEntry.Path, cwd)
	}
	_, err := agents.AgentStart(context.Background(), nil, rpc.AgentStartParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: sessionID, TabID: sessionID, WorkspaceID: workspaceID, CWD: cwd})
	if err != nil {
		t.Fatalf("start %s: %v", sessionID, err)
	}
}

func startBlockingCloseDSHPrompt(agents *nodeagent.Service, cwd string) <-chan error {
	finished := make(chan error, 1)
	go func() {
		_, err := agents.AgentPrompt(context.Background(), rpc.AgentPromptParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "matching-session", WorkspaceID: "matching", CWD: cwd, Message: json.RawMessage(`"hold"`)})
		finished <- err
	}()
	return finished
}

func waitForCloseDSHMarker(t *testing.T, markerPath string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(markerPath); err == nil {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("DSH prompt did not cross the operation barrier")
}

func startWorkspaceClose(svc *Service) <-chan error {
	finished := make(chan error, 1)
	go func() {
		_, err := svc.CloseLocal(context.Background(), workspaceDomain.CloseRequest{WorkspaceID: "matching"})
		finished <- err
	}()
	return finished
}

func assertLateDSHStartRejectedForWorkspaceClosing(t *testing.T, agents *nodeagent.Service, cwd string) {
	t.Helper()
	_, err := agents.AgentStart(context.Background(), nil, rpc.AgentStartParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "late-session", TabID: "late-session", WorkspaceID: "matching", CWD: cwd,
	})
	rpcErr, ok := err.(*rpc.Error)
	if !ok || rpcErr.Code != rpc.CodeNotFound || rpcErr.Message != "workspace is closing: matching" {
		t.Fatalf("late DSH start error = %v, want workspace-closing rejection", err)
	}
}

func releaseCloseDSHPrompt(t *testing.T, releasePath string) {
	t.Helper()
	if err := os.WriteFile(releasePath, nil, 0o600); err != nil {
		t.Fatalf("release prompt: %v", err)
	}
}

func assertCloseDSHResults(t *testing.T, agents *nodeagent.Service, matchingPath, unrelatedPath, markerPath string) {
	t.Helper()
	assertClosedDSHSessionRejected(t, agents, matchingPath)
	assertLiveDSHSessionAttachable(t, agents, "unrelated-session", "unrelated", unrelatedPath)
	disposals, err := os.ReadFile(markerPath + ".disposals")
	if err != nil {
		t.Fatalf("read disposals: %v", err)
	}
	if string(disposals) != "matching-session\n" {
		t.Fatalf("disposed sessions = %q, want exactly matching session", disposals)
	}
}

func assertClosedDSHSessionRejected(t *testing.T, agents *nodeagent.Service, cwd string) {
	t.Helper()
	_, err := agents.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "matching-session", WorkspaceID: "matching", CWD: cwd, AfterSeq: -1})
	if err == nil {
		t.Fatal("post-close attach succeeded")
	}
}

func assertLiveDSHSessionAttachable(t *testing.T, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	_, err := agents.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: sessionID, WorkspaceID: workspaceID, CWD: cwd, AfterSeq: -1,
	})
	if err != nil {
		t.Fatalf("unrelated DSH session %q was stopped: %v", sessionID, err)
	}
}

func TestCloseDSHIntegrationHelper(t *testing.T) {
	if os.Getenv("GO_WANT_CLOSE_DSH_INTEGRATION") != "1" {
		return
	}
	input := bufio.NewScanner(os.Stdin)
	if !input.Scan() || !isCloseDSHInitialize(input.Bytes()) {
		os.Exit(2)
	}
	writeCloseDSHResponse(1, `{"serverInfo":{"name":"deepseek-harness-sdk-runtime","version":"0.0.1"}}`)
	serveCloseDSHRequests(input)
}

type closeDSHRequest struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
	Params struct {
		SessionID string `json:"sessionId"`
	} `json:"params"`
}

func isCloseDSHInitialize(raw []byte) bool {
	var request closeDSHRequest
	return json.Unmarshal(raw, &request) == nil && request.Method == "initialize"
}

func serveCloseDSHRequests(input *bufio.Scanner) {
	for input.Scan() {
		var request closeDSHRequest
		if json.Unmarshal(input.Bytes(), &request) != nil {
			os.Exit(3)
		}
		if request.Method == "yishan.v1.session.prompt" {
			waitForCloseDSHRelease()
			writeCloseDSHResponse(request.ID, `{"messageId":"message"}`)
			continue
		}
		if request.Method == "yishan.v1.session.dispose" {
			recordCloseDSHDispose(request.Params.SessionID)
			writeCloseDSHResponse(request.ID, `{"sessionId":"`+request.Params.SessionID+`","disposed":true}`)
			continue
		}
		writeCloseDSHResponse(request.ID, closeDSHResult(request))
		if request.Method == "shutdown" {
			return
		}
	}
}

func waitForCloseDSHRelease() {
	marker := os.Getenv("CLOSE_DSH_MARKER")
	_ = os.WriteFile(marker, nil, 0o600)
	for {
		if _, err := os.Stat(os.Getenv("CLOSE_DSH_RELEASE")); err == nil {
			return
		}
		time.Sleep(time.Millisecond)
	}
}
func recordCloseDSHDispose(sessionID string) {
	file, err := os.OpenFile(os.Getenv("CLOSE_DSH_MARKER")+".disposals", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		os.Exit(4)
	}
	defer file.Close()
	_, _ = fmt.Fprintln(file, sessionID)
}
func closeDSHResult(request closeDSHRequest) string {
	switch request.Method {
	case "yishan.v1.session.start":
		return `{"sessionId":"` + request.Params.SessionID + `","instanceId":"runtime"}`
	case "yishan.v1.session.subscribe":
		return `{"sessionId":"` + request.Params.SessionID + `","instanceId":"runtime","events":[],"asOfSeq":-1,"durableThroughSeq":-1,"headSeq":-1}`
	case "yishan.v1.session.list":
		return `{"sessions":[]}`
	case "shutdown":
		return `{}`
	}
	return `{"sessionId":"` + request.Params.SessionID + `"}`
}
func writeCloseDSHResponse(id uint64, result string) {
	_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":%s}`+"\n", id, result)
}
