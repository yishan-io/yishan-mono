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

	"yishan/apps/cli/internal/agent/dsh"
	agentmanager "yishan/apps/cli/internal/agent/process"
	"yishan/apps/cli/internal/events"
	nodeagent "yishan/apps/cli/internal/node/agent"
	"yishan/apps/cli/internal/rpc"
	"yishan/apps/cli/internal/terminal"
	workspaceDomain "yishan/apps/cli/internal/workspace"
	"yishan/apps/cli/internal/workspace/application"
)

func TestTaskRunDSHIntegration_CreatedSessionAttachesCancelsAndCleansUpOnWorkspaceClose(t *testing.T) {
	fixture := newTaskRunDSHFixture(t)
	attachTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	abortTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	assertTaskRunUsesOnlyDSH(t, fixture.agentManager, fixture.terminals, fixture.sessionID)
	if _, err := fixture.service.CloseLocal(context.Background(), workspaceDomain.CloseRequest{WorkspaceID: fixture.workspaceID}); err != nil {
		t.Fatalf("close workspace: %v", err)
	}
	assertClosedTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	assertTaskRunDSHOperations(t, fixture.operationsPath, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
}

func TestTaskRunDSHIntegration_CreatedSessionDisposesExplicitly(t *testing.T) {
	fixture := newTaskRunDSHFixture(t)
	attachTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	abortTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	disposeTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	assertDisposedTaskRunDSHSession(t, fixture.agents, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
	assertTaskRunUsesOnlyDSH(t, fixture.agentManager, fixture.terminals, fixture.sessionID)
	assertDisposedTaskRunDSHOperations(t, fixture.operationsPath, fixture.sessionID, fixture.workspaceID, fixture.workspacePath)
}

type taskRunDSHFixture struct {
	service        *Service
	agents         *nodeagent.Service
	agentManager   *agentmanager.Manager
	terminals      *terminal.Manager
	operationsPath string
	workspaceID    string
	workspacePath  string
	sessionID      string
}

func newTaskRunDSHFixture(t *testing.T) taskRunDSHFixture {
	t.Helper()
	service := newTestService(t, nil, "node-1")
	workspaceID := "task-run-workspace"
	openLocalWorkspace(t, service, workspaceID, t.TempDir())
	created, err := service.GetWorkspace(workspaceID)
	if err != nil {
		t.Fatalf("get created workspace: %v", err)
	}
	operationsPath := filepath.Join(t.TempDir(), "operations.jsonl")
	supervisor := newTaskRunDSHSupervisor(t, operationsPath, created.Path)
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("start DSH supervisor: %v", err)
	}
	t.Cleanup(func() { _ = supervisor.Close() })
	agents, agentManager, terminals := newTaskRunDSHAgents(service, supervisor)
	t.Cleanup(agents.Shutdown)
	wireRealAgentCleanup(service, agents)
	agents.PublishWorkspaceCreateCompleted(application.CreatePlan{LocalCreate: &workspaceDomain.CreateRequest{
		TaskRun: &workspaceDomain.TaskRunConfig{Runtime: workspaceDomain.TaskRunRuntimeDSH, AgentKind: "pi", Prompt: "inspect lifecycle"},
	}}, created, nil)
	return taskRunDSHFixture{service, agents, agentManager, terminals, operationsPath, workspaceID, created.Path, "task-" + workspaceID}
}

func newTaskRunDSHAgents(service *Service, supervisor *dsh.Supervisor) (*nodeagent.Service, *agentmanager.Manager, *terminal.Manager) {
	agentManager := agentmanager.NewManager()
	terminals := terminal.NewManager()
	agents := nodeagent.NewService(nodeagent.Deps{
		Workspace: service, DSH: supervisor, OwnerNodeID: "node-1", AgentMgr: agentManager,
		Events: eventbus.NewHub(), Terminals: terminals,
	})
	return agents, agentManager, terminals
}

func newTaskRunDSHSupervisor(t *testing.T, operationsPath, cwd string) *dsh.Supervisor {
	t.Helper()
	return dsh.NewSupervisor(dsh.Config{
		Command: func(context.Context) (*exec.Cmd, error) {
			command := exec.Command(os.Args[0], "-test.run=TestTaskRunDSHIntegrationHelper", "--")
			command.Env = append(os.Environ(), "GO_WANT_TASKRUN_DSH_INTEGRATION=1", "TASKRUN_DSH_OPERATIONS="+operationsPath)
			return command, nil
		},
		Initialize: dsh.InitializeConfig{CWD: cwd, Provider: "deepseek-official", Model: "deepseek-v4-flash"},
	})
}

func attachTaskRunDSHSession(t *testing.T, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	result, err := agents.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion,
		SessionID: sessionID, WorkspaceID: workspaceID, CWD: cwd, AfterSeq: -1, AfterSeqProvided: true,
	})
	if err != nil {
		t.Fatalf("attach task run: %v", err)
	}
	attach, ok := result.(rpc.AgentDSHAttachResult)
	if !ok {
		t.Fatalf("attach result = %T, want DSH attach result", result)
	}
	if attach.Runtime != rpc.AgentRuntimeDSH || attach.SessionID != sessionID || attach.Incarnation != "task-run-incarnation" || attach.AsOfSeq != 1 || attach.DurableThroughSeq != 1 || attach.HeadSeq != 1 {
		t.Fatalf("attach snapshot = %#v", attach)
	}
	if len(attach.Events) != 2 || string(attach.Events[0]) != `{"seq":0,"type":"turn/start"}` || string(attach.Events[1]) != `{"seq":1,"type":"turn/end"}` {
		t.Fatalf("attach events = %s, want contiguous durable transcript", attach.Events)
	}
}

func abortTaskRunDSHSession(t *testing.T, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	_, err := agents.AgentAbort(context.Background(), rpc.AgentAbortParams{Runtime: rpc.AgentRuntimeDSH, SessionID: sessionID, WorkspaceID: workspaceID, CWD: cwd})
	if err != nil {
		t.Fatalf("abort task run: %v", err)
	}
}

func disposeTaskRunDSHSession(t *testing.T, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	_, err := agents.AgentDispose(context.Background(), rpc.AgentDisposeParams{Runtime: rpc.AgentRuntimeDSH, SessionID: sessionID, WorkspaceID: workspaceID, CWD: cwd})
	if err != nil {
		t.Fatalf("dispose task run: %v", err)
	}
}

func assertTaskRunUsesOnlyDSH(t *testing.T, manager *agentmanager.Manager, terminals *terminal.Manager, sessionID string) {
	t.Helper()
	if _, exists := manager.Session(sessionID); exists {
		t.Fatal("DSH task run started a Pi session")
	}
	if sessions := terminals.ListSessions(terminal.ListSessionsRequest{IncludeExited: true}); len(sessions) != 0 {
		t.Fatalf("DSH task run started terminals: %#v", sessions)
	}
}

func assertClosedTaskRunDSHSession(t *testing.T, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	_, err := agents.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion,
		SessionID: sessionID, WorkspaceID: workspaceID, CWD: cwd, AfterSeq: -1,
	})
	if err == nil {
		t.Fatal("workspace close retained task-run DSH session")
	}
}

func assertDisposedTaskRunDSHSession(t *testing.T, agents *nodeagent.Service, sessionID, workspaceID, cwd string) {
	t.Helper()
	_, err := agents.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{
		Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion,
		SessionID: sessionID, WorkspaceID: workspaceID, CWD: cwd, AfterSeq: -1,
	})
	if err == nil {
		t.Fatal("disposed task-run DSH session remained attachable")
	}
}

type taskRunDSHOperation struct {
	Method string `json:"method"`
	Params struct {
		SessionID string `json:"sessionId"`
		CWD       string `json:"cwd"`
		Binding   struct {
			WorkspaceID    string `json:"workspaceId"`
			ProjectID      string `json:"projectId"`
			OrganizationID string `json:"organizationId"`
			OwnerNodeID    string `json:"ownerNodeId"`
			CWD            string `json:"cwd"`
		} `json:"binding"`
	} `json:"params"`
}

func assertTaskRunDSHOperations(t *testing.T, path, sessionID, workspaceID, cwd string) {
	t.Helper()
	operations := readTaskRunDSHOperations(t, path)
	if len(operations) != 7 {
		t.Fatalf("DSH operations = %#v, want start, two subscriptions, prompt, cancel, dispose, list", operations)
	}
	assertTaskRunDSHStartBinding(t, operations[0], sessionID, workspaceID, cwd)
	for _, index := range []int{1, 3} {
		if operations[index].Method != "yishan.v1.session.subscribe" || operations[index].Params.SessionID != sessionID || operations[index].Params.CWD != cwd {
			t.Fatalf("operation %d = %#v, want task-run subscription", index, operations[index])
		}
	}
	for index, wantMethod := range map[int]string{2: "yishan.v1.session.prompt", 4: "yishan.v1.session.cancel", 5: "yishan.v1.session.dispose"} {
		operation := operations[index]
		if operation.Method != wantMethod || operation.Params.SessionID != sessionID || operation.Params.CWD != cwd {
			t.Fatalf("operation %d = %#v, want %s for task run", index, operation, wantMethod)
		}
	}
	if operation := operations[6]; operation.Method != "yishan.v1.session.list" || operation.Params.CWD != cwd {
		t.Fatalf("cleanup list = %#v, want workspace-scoped DSH list", operation)
	}
}

func assertDisposedTaskRunDSHOperations(t *testing.T, path, sessionID, workspaceID, cwd string) {
	t.Helper()
	operations := readTaskRunDSHOperations(t, path)
	if len(operations) != 6 {
		t.Fatalf("DSH operations = %#v, want start, two subscriptions, prompt, cancel, dispose", operations)
	}
	assertTaskRunDSHStartBinding(t, operations[0], sessionID, workspaceID, cwd)
	for _, index := range []int{1, 3} {
		if operation := operations[index]; operation.Method != "yishan.v1.session.subscribe" || operation.Params.SessionID != sessionID || operation.Params.CWD != cwd {
			t.Fatalf("operation %d = %#v, want task-run subscription", index, operation)
		}
	}
	for index, wantMethod := range map[int]string{2: "yishan.v1.session.prompt", 4: "yishan.v1.session.cancel", 5: "yishan.v1.session.dispose"} {
		if operation := operations[index]; operation.Method != wantMethod || operation.Params.SessionID != sessionID || operation.Params.CWD != cwd {
			t.Fatalf("operation %d = %#v, want %s for task run", index, operation, wantMethod)
		}
	}
}

func assertTaskRunDSHStartBinding(t *testing.T, operation taskRunDSHOperation, sessionID, workspaceID, cwd string) {
	t.Helper()
	binding := operation.Params.Binding
	if operation.Method != "yishan.v1.session.start" || operation.Params.SessionID != sessionID || operation.Params.CWD != cwd || binding.WorkspaceID != workspaceID || binding.ProjectID != "project-1" || binding.OrganizationID != "org-1" || binding.OwnerNodeID != "node-1" || binding.CWD != cwd {
		t.Fatalf("task-run start binding = %#v", operation)
	}
}

func readTaskRunDSHOperations(t *testing.T, path string) []taskRunDSHOperation {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open DSH operations: %v", err)
	}
	defer file.Close()
	var operations []taskRunDSHOperation
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var operation taskRunDSHOperation
		if err := json.Unmarshal(scanner.Bytes(), &operation); err != nil {
			t.Fatalf("decode DSH operation: %v", err)
		}
		operations = append(operations, operation)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("read DSH operations: %v", err)
	}
	return operations
}

func TestTaskRunDSHIntegrationHelper(t *testing.T) {
	if os.Getenv("GO_WANT_TASKRUN_DSH_INTEGRATION") != "1" {
		return
	}
	input := bufio.NewScanner(os.Stdin)
	if !input.Scan() || !isTaskRunDSHInitialize(input.Bytes()) {
		os.Exit(2)
	}
	writeTaskRunDSHResponse(1, `{"serverInfo":{"name":"deepseek-harness-sdk-runtime","version":"0.0.1"}}`)
	serveTaskRunDSHRequests(input, os.Getenv("TASKRUN_DSH_OPERATIONS"))
}

func isTaskRunDSHInitialize(raw []byte) bool {
	var request taskRunDSHOperation
	return json.Unmarshal(raw, &request) == nil && request.Method == "initialize"
}

func serveTaskRunDSHRequests(input *bufio.Scanner, operationsPath string) {
	for input.Scan() {
		var request taskRunDSHOperation
		if json.Unmarshal(input.Bytes(), &request) != nil {
			os.Exit(3)
		}
		recordTaskRunDSHOperation(operationsPath, input.Bytes())
		writeTaskRunDSHResponse(taskRunDSHRequestID(input.Bytes()), taskRunDSHResult(request))
		if request.Method == "shutdown" {
			return
		}
	}
}

func recordTaskRunDSHOperation(path string, operation []byte) {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		os.Exit(4)
	}
	defer file.Close()
	if _, err := fmt.Fprintln(file, string(operation)); err != nil {
		os.Exit(4)
	}
}

func taskRunDSHRequestID(raw []byte) uint64 {
	var request struct {
		ID uint64 `json:"id"`
	}
	if json.Unmarshal(raw, &request) != nil {
		os.Exit(3)
	}
	return request.ID
}

func taskRunDSHResult(request taskRunDSHOperation) string {
	sessionID := request.Params.SessionID
	switch request.Method {
	case "yishan.v1.session.start":
		return `{"sessionId":"` + sessionID + `","incarnation":"task-run-incarnation"}`
	case "yishan.v1.session.subscribe":
		return `{"sessionId":"` + sessionID + `","incarnation":"task-run-incarnation","events":[{"seq":0,"type":"turn/start"},{"seq":1,"type":"turn/end"}],"asOfSeq":1,"durableThroughSeq":1,"headSeq":1}`
	case "yishan.v1.session.prompt":
		return `{"messageId":"task-run-message"}`
	case "yishan.v1.session.cancel":
		return `{"sessionId":"` + sessionID + `","cancelled":true}`
	case "yishan.v1.session.dispose":
		return `{"sessionId":"` + sessionID + `","disposed":true}`
	case "yishan.v1.session.list":
		return `{"sessions":[]}`
	case "shutdown":
		return `{}`
	}
	return `{}`
}

func writeTaskRunDSHResponse(id uint64, result string) {
	_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":%s}`+"\n", id, result)
}
