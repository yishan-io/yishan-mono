package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/rpc"
)

func TestDSHIntegration_ForwardsCommittedLifecycle(t *testing.T) {
	supervisor := newLifecycleForwardingSupervisor(t)
	startDSHSupervisor(t, supervisor)
	service := newDSHExecutionService(supervisor)
	connection, client := newTestWSConnState(t)
	startDSHExecutionOnConnection(t, service, connection)
	if _, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"lifecycle"`)}); err != nil {
		t.Fatalf("prompt: %v", err)
	}
	assertCommittedLifecycleForwarding(t, client)
}

func newLifecycleForwardingSupervisor(t *testing.T) *dsh.Supervisor {
	t.Helper()
	return dsh.NewSupervisor(dsh.Config{
		Command: func(context.Context) (*exec.Cmd, error) {
			return newAgentDSHIntegrationCommand("lifecycle", ""), nil
		},
		Initialize: dsh.InitializeConfig{CWD: "/authoritative", Provider: "deepseek-official", Model: "deepseek-chat"},
	})
}

type lifecycleForwardingExpectation struct {
	revision   int64
	event      string
	stopReason string
}

type lifecycleForwardingNotification struct {
	Params struct {
		Topic   string `json:"topic"`
		Payload struct {
			SessionID   string            `json:"sessionId"`
			TabID       string            `json:"tabId"`
			WorkspaceID string            `json:"workspaceId"`
			Incarnation string            `json:"incarnation"`
			Update      dsh.SessionUpdate `json:"update"`
		} `json:"payload"`
	} `json:"params"`
}

func assertCommittedLifecycleForwarding(t *testing.T, client interface {
	ReadJSON(any) error
	SetReadDeadline(time.Time) error
}) {
	t.Helper()
	expected := []lifecycleForwardingExpectation{
		{revision: 0, event: "started"},
		{revision: 1, event: "finished", stopReason: "completed"},
	}
	for _, want := range expected {
		notification := readForwardedLifecycle(t, client)
		assertLifecycleForwardingEnvelope(t, notification)
		assertForwardedLifecycle(t, notification.Params.Payload.Update.Lifecycle, want)
	}
}

func readForwardedLifecycle(t *testing.T, client interface {
	ReadJSON(any) error
	SetReadDeadline(time.Time) error
}) lifecycleForwardingNotification {
	t.Helper()
	for range 3 {
		var notification lifecycleForwardingNotification
		readCrashFlowNotification(t, client, &notification)
		if notification.Params.Payload.Update.Lifecycle != nil {
			return notification
		}
	}
	t.Fatal("lifecycle was not forwarded")
	return lifecycleForwardingNotification{}
}

func assertLifecycleForwardingEnvelope(t *testing.T, notification lifecycleForwardingNotification) {
	t.Helper()
	payload := notification.Params.Payload
	if notification.Params.Topic != dshEventTopic || payload.SessionID != "s" || payload.TabID != "tab" || payload.WorkspaceID != "w" || payload.Incarnation != "runtime-1" {
		t.Fatalf("notification envelope = %#v", notification.Params)
	}
}

func assertForwardedLifecycle(t *testing.T, lifecycle *dsh.SubagentLifecycle, want lifecycleForwardingExpectation) {
	t.Helper()
	if lifecycle.ParentSessionID != "s" || lifecycle.ChildSessionID != "child-1" || lifecycle.RunID != "run-1" || lifecycle.Incarnation != "runtime-1" || lifecycle.Revision != want.revision || lifecycle.Event != want.event || lifecycle.StopReason != want.stopReason {
		t.Fatalf("lifecycle = %#v, want revision=%d event=%q stopReason=%q", lifecycle, want.revision, want.event, want.stopReason)
	}
}

func TestDSHIntegration_CrashResetResumesBeforeReplayOnRestartedSupervisor(t *testing.T) {
	backoffStarted := make(chan struct{}, 1)
	releaseRestart := make(chan struct{})
	operationsPath := filepath.Join(t.TempDir(), "operations")
	supervisor := newCrashFlowSupervisor(t, operationsPath, backoffStarted, releaseRestart)
	startDSHSupervisor(t, supervisor)
	service := newDSHExecutionService(supervisor)
	connection, client := newTestWSConnState(t)
	startDSHExecutionOnConnection(t, service, connection)
	assertCrashFlowSpeculativeEvent(t, client)
	crashDSHSession(t, service)
	assertCrashFlowResetAndUnavailable(t, client, supervisor, backoffStarted)
	close(releaseRestart)
	waitForCrashFlowRestart(t, supervisor)
	attach := attachCrashFlowSession(t, service, operationsPath)
	assertCrashFlowReplay(t, attach, operationsPath)
}

func newCrashFlowSupervisor(t *testing.T, operationsPath string, backoffStarted chan<- struct{}, releaseRestart <-chan struct{}) *dsh.Supervisor {
	t.Helper()
	var mu sync.Mutex
	starts := 0
	return dsh.NewSupervisor(dsh.Config{
		Command: func(context.Context) (*exec.Cmd, error) {
			mu.Lock()
			starts++
			mode := "crash"
			if starts > 1 {
				mode = "restart"
			}
			mu.Unlock()
			return newAgentDSHIntegrationCommand(mode, operationsPath), nil
		},
		Initialize:   dsh.InitializeConfig{CWD: "/authoritative", Provider: "deepseek-official", Model: "deepseek-chat"},
		RestartLimit: 1,
		RestartWait:  func(context.Context, time.Duration) { backoffStarted <- struct{}{}; <-releaseRestart },
	})
}

func newAgentDSHIntegrationCommand(mode, operationsPath string) *exec.Cmd {
	command := exec.Command(os.Args[0], "-test.run=TestAgentDSHIntegrationHelper", "--")
	command.Env = append(os.Environ(), "GO_WANT_AGENT_DSH_INTEGRATION=1", "DSH_INTEGRATION_MODE="+mode, "DSH_INTEGRATION_OPERATIONS="+operationsPath)
	return command
}

func startDSHSupervisor(t *testing.T, supervisor *dsh.Supervisor) {
	t.Helper()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = supervisor.Close() })
}

func assertCrashFlowSpeculativeEvent(t *testing.T, client interface {
	ReadJSON(any) error
	SetReadDeadline(time.Time) error
}) {
	t.Helper()
	for range 3 {
		var notification crashFlowNotification
		readCrashFlowNotification(t, client, &notification)
		if notification.Params.Payload.Update.Event != nil && notification.Params.Payload.Update.Event.Seq == 0 {
			return
		}
	}
	t.Fatal("speculative live event was not forwarded")
}

func crashDSHSession(t *testing.T, service *Service) {
	t.Helper()
	_, err := service.AgentPrompt(context.Background(), rpc.AgentPromptParams{Runtime: rpc.AgentRuntimeDSH, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", Message: json.RawMessage(`"crash"`)})
	if err == nil {
		t.Fatal("prompt succeeded despite helper crash")
	}
}

func assertCrashFlowResetAndUnavailable(t *testing.T, client interface {
	ReadJSON(any) error
	SetReadDeadline(time.Time) error
}, supervisor *dsh.Supervisor, backoffStarted <-chan struct{}) {
	t.Helper()
	assertCrashFlowReset(t, client)
	select {
	case <-backoffStarted:
	case <-time.After(time.Second):
		t.Fatal("restart backoff did not start")
	}
	if supervisor.Health().IsReady {
		t.Fatal("supervisor remained ready while restart is held")
	}
	if _, err := supervisor.SubscribeSession(context.Background(), dsh.SessionSubscribeRequest{CWD: "/authoritative", SessionID: "s", AfterSeq: -1}); err == nil {
		t.Fatal("unavailable supervisor accepted subscription")
	}
}

type crashFlowNotification struct {
	Params struct {
		Payload struct {
			Update dsh.SessionUpdate `json:"update"`
		} `json:"payload"`
	} `json:"params"`
}

func assertCrashFlowReset(t *testing.T, client interface {
	ReadJSON(any) error
	SetReadDeadline(time.Time) error
}) {
	t.Helper()
	for range 3 {
		var notification crashFlowNotification
		readCrashFlowNotification(t, client, &notification)
		if notification.Params.Payload.Update.Reset != nil {
			return
		}
	}
	t.Fatal("crash did not publish transcript reset")
}

func readCrashFlowNotification(t *testing.T, client interface {
	ReadJSON(any) error
	SetReadDeadline(time.Time) error
}, notification any) {
	t.Helper()
	if err := client.SetReadDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatalf("SetReadDeadline: %v", err)
	}
	if err := client.ReadJSON(notification); err != nil {
		t.Fatalf("ReadJSON: %v", err)
	}
}

func waitForCrashFlowRestart(t *testing.T, supervisor *dsh.Supervisor) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if supervisor.Health().IsReady {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("supervisor did not restart")
}

func attachCrashFlowSession(t *testing.T, service *Service, operationsPath string) rpc.AgentDSHAttachResult {
	t.Helper()
	result, err := service.AgentAttach(context.Background(), nil, rpc.AgentAttachParams{Runtime: rpc.AgentRuntimeDSH, TranscriptProtocolVersion: rpc.DSHTranscriptProtocolVersion, SessionID: "s", WorkspaceID: "w", CWD: "/authoritative", AfterSeq: -1})
	if err != nil {
		operations, _ := os.ReadFile(operationsPath)
		t.Fatalf("attach after restart: %v; operations=%q", err, operations)
	}
	return result.(rpc.AgentDSHAttachResult)
}

func assertCrashFlowReplay(t *testing.T, attach rpc.AgentDSHAttachResult, operationsPath string) {
	t.Helper()
	if attach.Incarnation != "runtime-2" || attach.AsOfSeq != 0 || attach.DurableThroughSeq != 0 || attach.HeadSeq != 0 {
		t.Fatalf("attach snapshot = %#v", attach)
	}
	if len(attach.Events) != 1 || string(attach.Events[0]) != `{"seq":0,"type":"turn/start"}` {
		t.Fatalf("replay events = %s", attach.Events)
	}
	operations, err := os.ReadFile(operationsPath)
	if err != nil {
		t.Fatalf("read operations: %v", err)
	}
	if string(operations) != "start\nsubscribe\nprompt\nresume\nsubscribe\n" {
		t.Fatalf("operations = %q; resume must precede replay subscription", operations)
	}
}

func TestAgentDSHIntegrationHelper(t *testing.T) {
	if os.Getenv("GO_WANT_AGENT_DSH_INTEGRATION") != "1" {
		return
	}
	input := bufio.NewScanner(os.Stdin)
	if !input.Scan() || !isAgentIntegrationInitialize(input.Bytes()) {
		os.Exit(2)
	}
	writeAgentIntegrationResponse(1, `{"serverInfo":{"name":"deepseek-harness-sdk-runtime","version":"0.0.1"}}`)
	runAgentIntegrationScenario(input, os.Getenv("DSH_INTEGRATION_MODE"), os.Getenv("DSH_INTEGRATION_OPERATIONS"))
}

func runAgentIntegrationScenario(input *bufio.Scanner, mode, operationsPath string) {
	for input.Scan() {
		request := readAgentIntegrationRequest(input.Bytes())
		recordAgentIntegrationOperation(operationsPath, request.Method)
		if mode == "crash" && request.Method == "yishan.v1.session.subscribe" {
			writeAgentSpeculativeEvent()
		}
		if mode == "crash" && request.Method == "yishan.v1.session.prompt" {
			return
		}
		if mode == "lifecycle" && request.Method == "yishan.v1.session.prompt" {
			writeAgentCommittedLifecycle()
		}
		writeAgentIntegrationMethodResponse(request, mode)
		if request.Method == "shutdown" {
			return
		}
	}
}

func recordAgentIntegrationOperation(path, method string) {
	if path == "" || method == "shutdown" {
		return
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		os.Exit(4)
	}
	defer file.Close()
	if _, err := file.WriteString(methodName(method) + "\n"); err != nil {
		os.Exit(4)
	}
}

func methodName(method string) string {
	switch method {
	case "yishan.v1.session.start":
		return "start"
	case "yishan.v1.session.subscribe":
		return "subscribe"
	case "yishan.v1.session.prompt":
		return "prompt"
	case "yishan.v1.session.resume":
		return "resume"
	}
	return method
}

type agentIntegrationRequest struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
}

func isAgentIntegrationInitialize(raw []byte) bool {
	var request agentIntegrationRequest
	return json.Unmarshal(raw, &request) == nil && request.Method == "initialize"
}
func readAgentIntegrationRequest(raw []byte) agentIntegrationRequest {
	var request agentIntegrationRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		os.Exit(3)
	}
	return request
}
func writeAgentSpeculativeEvent() {
	_, _ = os.Stdout.WriteString(`{"jsonrpc":"2.0","method":"session.event","params":{"sessionId":"s","event":{"seq":0,"type":"turn/end"}}}` + "\n")
}

func writeAgentCommittedLifecycle() {
	_, _ = os.Stdout.WriteString(`{"jsonrpc":"2.0","method":"yishan.v1.subagent.lifecycle","params":{"version":1,"parentSessionId":"s","incarnation":"runtime-1","revision":0,"event":"started","runId":"run-1","childSessionId":"child-1","provider":"spawn","local":true}}` + "\n")
	_, _ = os.Stdout.WriteString(`{"jsonrpc":"2.0","method":"yishan.v1.subagent.lifecycle","params":{"version":1,"parentSessionId":"s","incarnation":"runtime-1","revision":1,"event":"finished","runId":"run-1","childSessionId":"child-1","provider":"spawn","local":true,"stopReason":"completed"}}` + "\n")
}

func writeAgentIntegrationMethodResponse(request agentIntegrationRequest, mode string) {
	result := `{"sessionId":"s"}`
	if request.Method == "yishan.v1.session.start" {
		result = `{"sessionId":"s","incarnation":"runtime-1"}`
	}
	if request.Method == "yishan.v1.session.resume" {
		result = `{"sessionId":"s"}`
	}
	if request.Method == "yishan.v1.session.prompt" {
		result = `{"messageId":"message-1"}`
	}
	if request.Method == "yishan.v1.session.subscribe" {
		result = agentSubscribeResult(mode)
	}
	if request.Method == "yishan.v1.session.dispose" {
		result = `{"sessionId":"s","disposed":true}`
	}
	if request.Method == "shutdown" {
		result = `{}`
	}
	writeAgentIntegrationResponse(request.ID, result)
}

func agentSubscribeResult(mode string) string {
	if mode == "restart" {
		return `{"sessionId":"s","incarnation":"runtime-2","events":[{"seq":0,"type":"turn/start"}],"asOfSeq":0,"durableThroughSeq":0,"headSeq":0}`
	}
	return `{"sessionId":"s","incarnation":"runtime-1","events":[],"asOfSeq":-1,"durableThroughSeq":-1,"headSeq":-1}`
}
func writeAgentIntegrationResponse(id uint64, result string) {
	_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":%s}`+"\n", id, result)
}
