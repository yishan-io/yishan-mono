package system

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	relayprotocol "yishan/packages/relay-protocol-go"

	"yishan/apps/cli/internal/adapter/cloud/session"
	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/rpc"
)

func TestScheduledAgentEnvironmentOverridesDaemonWSURL(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	markerPath := installSchedulerPi(t)
	t.Setenv("YISHAN_DAEMON_WS_URL", "stale")

	if _, err := runAgent("pi", "prompt", "", t.TempDir(), "ws://127.0.0.1:4312/ws"); err != nil {
		t.Fatalf("runAgent: %v", err)
	}
	if got := waitForFileContent(t, markerPath); got != "ws://127.0.0.1:4312/ws" {
		t.Fatalf("YISHAN_DAEMON_WS_URL = %q, want authoritative endpoint", got)
	}
}

func TestScheduledAgentEnvironmentClearsUnavailableDaemonWSURL(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	markerPath := installSchedulerPi(t)
	t.Setenv("YISHAN_DAEMON_WS_URL", "stale")

	if _, err := runAgent("pi", "prompt", "", t.TempDir(), ""); err != nil {
		t.Fatalf("runAgent: %v", err)
	}
	if got := waitForFileContent(t, markerPath); got != "" {
		t.Fatalf("YISHAN_DAEMON_WS_URL = %q, want empty neutralized value", got)
	}
}

func installSchedulerPi(t *testing.T) string {
	t.Helper()
	markerPath := filepath.Join(t.TempDir(), "daemon-endpoint.txt")
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nprintf '%s' \"$YISHAN_DAEMON_WS_URL\" > " + markerPath + ".tmp && mv " + markerPath + ".tmp " + markerPath + "\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")
	return markerPath
}

func TestRunAgent_StopsWhenContextIsCanceled(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	markerPath := installCancelableSchedulerPi(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	errorsCh := make(chan error, 1)
	go func() {
		_, err := RunAgent(ctx, "pi", "prompt", "", t.TempDir(), "")
		errorsCh <- err
	}()
	_ = waitForFileContent(t, markerPath)
	cancel()

	select {
	case err := <-errorsCh:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("RunAgent error = %v, want context canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("RunAgent did not stop after context cancellation")
	}
}

func installCancelableSchedulerPi(t *testing.T) string {
	t.Helper()
	markerPath := filepath.Join(t.TempDir(), "started")
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\ntouch " + markerPath + "\nexec sleep 30\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")
	return markerPath
}

type relayStartTestCase struct {
	name                string
	startResponse       string
	startStatus         int
	wantProcessRuns     string
	wantCompleteCalls   int32
	wantResultStatus    string
	wantDuplicate       bool
	wantResultErrorCode string
}

func TestProcessRelayJob_FailsClosedWhenStartDoesNotWin(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	testCases := []relayStartTestCase{
		{name: "start winner runs agent", startResponse: `{"ok":true,"started":true}`, startStatus: http.StatusOK, wantProcessRuns: "1", wantCompleteCalls: 1, wantResultStatus: "completed"},
		{name: "replay is a duplicate no-op", startResponse: `{"ok":true,"started":false}`, startStatus: http.StatusOK, wantCompleteCalls: 0, wantResultStatus: "completed", wantDuplicate: true},
		{name: "start conflict fails without running", startResponse: `{"code":"SCHEDULED_JOB_RUN_TRANSITION_UNAVAILABLE"}`, startStatus: http.StatusConflict, wantCompleteCalls: 0, wantResultStatus: "failed", wantResultErrorCode: scheduledJobRunStartErrorCode},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) { runRelayStartTestCase(t, testCase) })
	}
}

func runRelayStartTestCase(t *testing.T, testCase relayStartTestCase) {
	markerPath := installRelayProcessPi(t)
	apiServer, completeCalls := newRelayStartAPIServer(t, testCase)
	connState, results := newRelayResultConnection(t)
	processRelayJob(session.New(&config.Config{API: config.APIConfig{BaseURL: apiServer.URL, Token: "yst_token"}}), connState, "node-1", relayprotocol.JobRunParams{
		RunID: "run-1", JobID: "job-1", Payload: map[string]any{"agentKind": "pi", "prompt": "prompt", "projectPath": t.TempDir()},
	}, "")
	assertRelayStartTestCase(t, testCase, <-results, markerPath, completeCalls.Load())
}

func newRelayStartAPIServer(t *testing.T, testCase relayStartTestCase) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var completeCalls atomic.Int32
	apiServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/nodes/node-1/scheduled-jobs/runs/start":
			writer.WriteHeader(testCase.startStatus)
			_, _ = writer.Write([]byte(testCase.startResponse))
		case "/nodes/node-1/scheduled-jobs/runs/complete":
			completeCalls.Add(1)
			_, _ = writer.Write([]byte(`{"ok":true}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	t.Cleanup(apiServer.Close)
	return apiServer, &completeCalls
}

func assertRelayStartTestCase(t *testing.T, testCase relayStartTestCase, result relayprotocol.JobResultParams, markerPath string, completeCalls int32) {
	t.Helper()
	if result.Status != testCase.wantResultStatus {
		t.Fatalf("job.result status = %q, want %q", result.Status, testCase.wantResultStatus)
	}
	if got := result.Output["duplicate"] == true; got != testCase.wantDuplicate {
		t.Fatalf("job.result duplicate = %t, want %t", got, testCase.wantDuplicate)
	}
	if testCase.wantResultErrorCode != "" && (result.Error == nil || result.Error.Code != testCase.wantResultErrorCode) {
		t.Fatalf("job.result error = %+v, want code %q", result.Error, testCase.wantResultErrorCode)
	}
	assertRelayProcessRuns(t, markerPath, testCase.wantProcessRuns)
	if completeCalls != testCase.wantCompleteCalls {
		t.Fatalf("complete calls = %d, want %d", completeCalls, testCase.wantCompleteCalls)
	}
}

func assertRelayProcessRuns(t *testing.T, markerPath, wantProcessRuns string) {
	t.Helper()
	if wantProcessRuns != "" {
		if got := waitForFileContent(t, markerPath); got != wantProcessRuns {
			t.Fatalf("agent process runs = %q, want %q", got, wantProcessRuns)
		}
		return
	}
	if _, err := os.Stat(markerPath); !os.IsNotExist(err) {
		t.Fatalf("agent process marker exists or could not be checked: %v", err)
	}
}

func installRelayProcessPi(t *testing.T) string {
	t.Helper()
	markerPath := filepath.Join(t.TempDir(), "agent-runs")
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nprintf 1 >> " + markerPath + "\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")
	return markerPath
}

func newRelayResultConnection(t *testing.T) (*rpc.Connection, <-chan relayprotocol.JobResultParams) {
	t.Helper()
	results := make(chan relayprotocol.JobResultParams, 1)
	upgrader := websocket.Upgrader{}
	relayServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		websocketConn, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			t.Errorf("upgrade relay websocket: %v", err)
			return
		}
		defer websocketConn.Close()
		handleRelayResultConnection(t, websocketConn, results)
	}))
	t.Cleanup(relayServer.Close)
	wsURL := "ws" + strings.TrimPrefix(relayServer.URL, "http")
	websocketConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial relay websocket: %v", err)
	}
	connState := rpc.NewConnection(websocketConn)
	t.Cleanup(connState.Close)
	return connState, results
}

func handleRelayResultConnection(t *testing.T, websocketConn *websocket.Conn, results chan<- relayprotocol.JobResultParams) {
	var notification struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}
	if err := websocketConn.ReadJSON(&notification); err != nil {
		t.Errorf("read relay notification: %v", err)
		return
	}
	if notification.Method != relayprotocol.MethodJobResult {
		t.Errorf("relay method = %q, want %q", notification.Method, relayprotocol.MethodJobResult)
		return
	}
	var result relayprotocol.JobResultParams
	if err := json.Unmarshal(notification.Params, &result); err != nil {
		t.Errorf("decode job.result: %v", err)
		return
	}
	results <- result
}
