package dsh

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"testing"
	"time"
)

func TestSupervisor_Start_ReportsReadyAfterCompatibleInitialize(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("ready")})
	defer supervisor.Close()

	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if !supervisor.Health().IsReady {
		t.Fatal("supervisor is not ready after initialize")
	}
}

func TestSupervisor_HealthClearsRuntimeIncarnationAfterExit(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc-exit"), RestartLimit: 1, RestartBackoff: time.Second})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	readyIncarnation := supervisor.Health().Incarnation
	if readyIncarnation == "" {
		t.Fatal("ready runtime incarnation is empty")
	}
	_, _ = supervisor.ListSessions(context.Background(), SessionListRequest{CWD: "/workspace"})
	waitFor(t, func() bool { return !supervisor.Health().IsReady })
	if got := supervisor.Health().Incarnation; got != "" {
		t.Fatalf("unavailable runtime incarnation = %q, want empty", got)
	}
}

func TestSupervisor_Start_AcceptsReportedServerVersion(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("other-version")})
	defer supervisor.Close()

	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if got := supervisor.Health().ServerVersion; got != "9.9.9" {
		t.Fatalf("server version = %q", got)
	}
}

func TestSupervisor_Start_ReportsStderrDiagnostics(t *testing.T) {
	diagnostics := make(chan string, 1)
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("stderr"), Diagnostics: func(message string) { diagnostics <- message },
	})
	defer supervisor.Close()

	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	select {
	case message := <-diagnostics:
		if !strings.Contains(message, "runtime diagnostic") {
			t.Fatalf("diagnostic = %q", message)
		}
	case <-time.After(time.Second):
		t.Fatal("expected stderr diagnostic")
	}
}

func TestSupervisor_RestartsUnexpectedExitWithinBound(t *testing.T) {
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("exit"), RestartLimit: 1, RestartBackoff: time.Millisecond,
	})
	defer supervisor.Close()

	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	waitFor(t, func() bool { return supervisor.Health().RestartCount == 1 })
	waitFor(t, func() bool { return !supervisor.Health().IsReady })
}

func TestSupervisor_RestartInvalidatesAndTerminatesSubscriptions(t *testing.T) {
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("rpc-subscribe-exit"), RestartLimit: 1, RestartBackoff: time.Millisecond,
	})
	defer supervisor.Close()
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	initialIncarnation := supervisor.Health().Incarnation
	if initialIncarnation == "" {
		t.Fatal("initial runtime incarnation is empty")
	}
	subscription, err := supervisor.SubscribeSession(context.Background(), SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("SubscribeSession: %v", err)
	}
	_, _ = supervisor.PromptSession(context.Background(), SessionPromptRequest{
		CWD: "/workspace", SessionID: "session", ContentBlocks: []TextPromptContentBlock{{Type: "text", Text: "exit"}},
	})
	assertSubscriptionResetAndClosed(t, subscription.Updates)
	waitFor(t, func() bool { return supervisor.Health().RestartCount == 1 && supervisor.Health().IsReady })
	if restartedIncarnation := supervisor.Health().Incarnation; restartedIncarnation == "" || restartedIncarnation == initialIncarnation {
		t.Fatalf("restarted runtime incarnation = %q, initial = %q", restartedIncarnation, initialIncarnation)
	}
}

func assertSubscriptionResetAndClosed(t *testing.T, updates <-chan SessionUpdate) {
	t.Helper()
	initial := <-updates
	if initial.Cursor == nil {
		t.Fatalf("initial update = %#v", initial)
	}
	status := <-updates
	if status.Status == nil || status.Status.Status != "idle" {
		t.Fatalf("initial status = %#v", status)
	}
	select {
	case update, ok := <-updates:
		if !ok || update.Reset == nil {
			t.Fatalf("terminal update = %#v, open = %t", update, ok)
		}
	case <-time.After(time.Second):
		t.Fatal("subscription was not terminated")
	}
	if _, ok := <-updates; ok {
		t.Fatal("subscription remained open after process exit")
	}
}

func TestSupervisor_CloseTerminatesSubscriptions(t *testing.T) {
	supervisor := newTestSupervisor(Config{Command: helperCommand("rpc")})
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	subscription, err := supervisor.SubscribeSession(context.Background(), SessionSubscribeRequest{CWD: "/workspace", SessionID: "session", AfterSeq: -1})
	if err != nil {
		t.Fatalf("SubscribeSession: %v", err)
	}
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	assertSubscriptionResetAndClosed(t, subscription.Updates)
}

func TestSupervisor_Close_CancelsInitializeInFlight(t *testing.T) {
	started := make(chan string, 1)
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("no-initialize"), StartupTimeout: time.Second, ShutdownTimeout: 20 * time.Millisecond,
		Diagnostics: func(message string) {
			select {
			case started <- message:
			default:
			}
		},
	})
	startErr := make(chan error, 1)
	go func() { startErr <- supervisor.Start(context.Background()) }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("runtime did not begin initialize")
	}
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	select {
	case err := <-startErr:
		if err == nil {
			t.Fatal("Start succeeded after Close")
		}
	case <-time.After(time.Second):
		t.Fatal("Start did not stop after Close")
	}
}

func TestSupervisor_Close_KillsProcessAfterDeadline(t *testing.T) {
	supervisor := newTestSupervisor(Config{
		Command: helperCommand("ignore-interrupt"), ShutdownTimeout: 10 * time.Millisecond,
	})
	if err := supervisor.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := supervisor.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func newTestSupervisor(config Config) *Supervisor {
	config.Initialize = InitializeConfig{CWD: "/workspace", Provider: "deepseek-official", Model: "deepseek-chat"}
	return NewSupervisor(config)
}

func helperCommand(mode string) CommandFactory {
	return func(context.Context) (*exec.Cmd, error) {
		command := exec.Command(os.Args[0], "-test.run=TestDSHHelperProcess", "--", mode)
		command.Env = append(os.Environ(), "GO_WANT_DSH_HELPER=1")
		return command, nil
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("condition was not met")
}

func TestDSHHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_DSH_HELPER") != "1" {
		return
	}
	mode := os.Args[len(os.Args)-1]
	input := bufio.NewReader(os.Stdin)
	request, err := input.ReadBytes('\n')
	if err != nil {
		os.Exit(2)
	}
	var frame struct {
		Method string `json:"method"`
		Params struct {
			CWD      string `json:"cwd"`
			Provider string `json:"provider"`
			Model    string `json:"model"`
		} `json:"params"`
	}
	if json.Unmarshal(request, &frame) != nil || frame.Method != "initialize" || frame.Params.CWD != "/workspace" || frame.Params.Provider == "" || frame.Params.Model == "" {
		os.Exit(3)
	}
	if mode == "no-initialize" {
		_, _ = os.Stderr.WriteString("waiting to initialize\n")
		select {}
	}
	version := "0.0.1"
	if mode == "other-version" {
		version = "9.9.9"
	}
	_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"%s","version":"%s"}}}`+"\n", expectedServerName, version)
	runHelperMode(mode, input)
	os.Exit(0)
}

func runHelperMode(mode string, input *bufio.Reader) {
	switch mode {
	case "ready", "other-version":
		writeShutdownResponse(input)
	case "stderr":
		_, _ = os.Stderr.WriteString("runtime diagnostic\n")
		writeShutdownResponse(input)
	case "rpc", "rpc-notify", "rpc-exit", "rpc-invalid-notify", "rpc-subscribe-exit":
		handleRPCRequests(mode, input)
	case "exit":
		return
	case "ignore-interrupt":
		signal.Ignore(os.Interrupt)
		select {}
	}
}

func writeShutdownResponse(input *bufio.Reader) {
	request, err := input.ReadBytes('\n')
	if err != nil || !strings.Contains(string(request), `"method":"shutdown"`) {
		return
	}
	_, _ = os.Stdout.WriteString(`{"jsonrpc":"2.0","id":2,"result":{}}` + "\n")
}

func handleRPCRequests(mode string, input *bufio.Reader) {
	if mode == "rpc-notify" {
		_, _ = os.Stdout.WriteString(`{"jsonrpc":"2.0","method":"event","params":{}}` + "\n")
	}
	for {
		line, err := input.ReadBytes('\n')
		if err != nil {
			return
		}
		var request struct {
			ID     uint64 `json:"id"`
			Method string `json:"method"`
			Params struct {
				CWD           string `json:"cwd"`
				SessionID     string `json:"sessionId"`
				RootSessionID string `json:"rootSessionId"`
				Mode          string `json:"mode"`
			} `json:"params"`
		}
		if json.Unmarshal(line, &request) != nil {
			return
		}
		if request.Method == "shutdown" {
			_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{}}`+"\n", request.ID)
			return
		}
		if mode == "rpc-exit" {
			return
		}
		if mode == "rpc-invalid-notify" && request.Params.SessionID == "wait" {
			_, _ = os.Stdout.WriteString(`{"jsonrpc":"2.0","method":"session.event","params":{"sessionId":"wait","event":{"seq":-1}}}` + "\n")
			continue
		}
		if mode == "rpc-subscribe-exit" && request.Method == yishanSessionPromptMethod {
			return
		}
		writeRPCResponse(request)
	}
}

func writeRPCResponse(request struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
	Params struct {
		CWD           string `json:"cwd"`
		SessionID     string `json:"sessionId"`
		RootSessionID string `json:"rootSessionId"`
		Mode          string `json:"mode"`
	} `json:"params"`
}) {
	if writeExceptionalRPCResponse(request) {
		return
	}
	writeSessionRPCResponse(request)
}

func writeExceptionalRPCResponse(request struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
	Params struct {
		CWD           string `json:"cwd"`
		SessionID     string `json:"sessionId"`
		RootSessionID string `json:"rootSessionId"`
		Mode          string `json:"mode"`
	} `json:"params"`
}) bool {
	if request.Params.SessionID == "wait" {
		_, _ = os.Stderr.WriteString("waiting request\n")
		return true
	}
	if request.Params.SessionID == "server-error" {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"error":{"code":9,"message":"denied"}}`+"\n", request.ID)
		return true
	}
	if request.Method == yishanSessionLineageMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"rootSessionId":"%s","mode":"%s","children":[{"sessionId":"child","parentSessionId":"%s","origin":"subagent","delegationDepth":1,"relativeDepth":1,"live":false,"persisted":true,"activity":"inactive","mode":"one-shot"}]}}`+"\n", request.ID, request.Params.RootSessionID, request.Params.Mode, request.Params.RootSessionID)
		return true
	}
	if request.Method != yishanSessionListMethod {
		return false
	}
	_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessions":[{"sessionId":"%s","createdAt":1,"live":false,"persisted":true}]}}`+"\n", request.ID, request.Params.CWD)
	return true
}

func writeSessionRPCResponse(request struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
	Params struct {
		CWD           string `json:"cwd"`
		SessionID     string `json:"sessionId"`
		RootSessionID string `json:"rootSessionId"`
		Mode          string `json:"mode"`
	} `json:"params"`
}) {
	if request.Method == yishanSessionStartMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessionId":"%s","incarnation":"run"}}`+"\n", request.ID, request.Params.SessionID)
		return
	}
	if request.Method == yishanSessionPromptMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"messageId":"message"}}`+"\n", request.ID)
		return
	}
	writeSessionControlResponse(request)
}

func writeSessionControlResponse(request struct {
	ID     uint64 `json:"id"`
	Method string `json:"method"`
	Params struct {
		CWD           string `json:"cwd"`
		SessionID     string `json:"sessionId"`
		RootSessionID string `json:"rootSessionId"`
		Mode          string `json:"mode"`
	} `json:"params"`
}) {
	if request.Method == yishanSessionCancelMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessionId":"%s","cancelled":true}}`+"\n", request.ID, request.Params.SessionID)
		return
	}
	if request.Method == yishanSessionFlushMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessionId":"%s","durableThroughSeq":-1,"incarnation":"run"}}`+"\n", request.ID, request.Params.SessionID)
		return
	}
	if request.Method == yishanSessionSubscribeMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessionId":"%s","incarnation":"run","events":[],"asOfSeq":-1,"durableThroughSeq":-1,"headSeq":-1}}`+"\n", request.ID, request.Params.SessionID)
		return
	}
	if request.Method == yishanSessionDisposeMethod {
		_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessionId":"%s","disposed":true}}`+"\n", request.ID, request.Params.SessionID)
		return
	}
	_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{"sessionId":"%s"}}`+"\n", request.ID, request.Params.SessionID)
}
