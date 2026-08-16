package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"yishan/apps/cli/internal/rpc"
)

func assertPiStartObserverEnv(t *testing.T, env []string, workspaceID string, tabID string, paneID string, homeDir string) {
	t.Helper()
	assertEnvValue(t, env, "YISHAN_WORKSPACE_ID", workspaceID)
	assertEnvValue(t, env, "YISHAN_TAB_ID", tabID)
	assertEnvValue(t, env, "YISHAN_PANE_ID", paneID)
	assertEnvValue(t, env, "YISHAN_NOTIFY_SCRIPT_PATH", filepath.Join(homeDir, ".yishan", "notify.sh"))
}

func assertEnvValue(t *testing.T, env []string, key string, want string) {
	t.Helper()
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			got := strings.TrimPrefix(entry, prefix)
			if got != want {
				t.Fatalf("%s = %q, want %q", key, got, want)
			}
			return
		}
	}
	t.Fatalf("%s missing from env", key)
}

func mustMarshalJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal JSON: %v", err)
	}
	return data
}

// testEncodeSessionCWD mirrors agentmanager.encodeSessionCWD (which matches pi's
// getDefaultSessionDirPath encoding) so tests can construct session dirs the
// daemon handlers will resolve. Keep in sync when the encoding changes.
func testEncodeSessionCWD(cwd string) string {
	cleanCWD := strings.TrimSpace(cwd)
	absoluteCWD, err := filepath.Abs(cleanCWD)
	if err != nil {
		absoluteCWD = filepath.Clean(cleanCWD)
	}
	normalized := filepath.ToSlash(absoluteCWD)
	normalized = strings.TrimPrefix(normalized, "/")
	normalized = strings.ReplaceAll(normalized, ":", "-")
	return "--" + strings.ReplaceAll(normalized, "/", "-") + "--"
}

func installBlockingFakePiBinary(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nIFS= read -r _ || exit 0\nexit 0\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

// installSlowExitFakePiBinary installs a pi binary that stays alive after its
// stdin closes, so a pi.stop teardown has to wait out abortGracePeriod before
// force-killing — giving tests a deterministic "session is stopping" window.
func installSlowExitFakePiBinary(t *testing.T) {
	t.Helper()
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "pi")
	script := "#!/bin/sh\nIFS= read -r _ || true\nsleep 5\nexit 0\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

func waitForStoppingMarker(t *testing.T, services *Service, sessionID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if services.piSessions.IsStopping(sessionID) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for stopping marker for %q", sessionID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func waitForStartingReservation(t *testing.T, services *Service, sessionID string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if services.deps.AgentMgr.Starting(sessionID) {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for start reservation for %q", sessionID)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func newTestWSConnState(t *testing.T) (*rpc.Connection, *websocket.Conn) {
	t.Helper()
	upgrader := websocket.Upgrader{}
	serverConns := make(chan *websocket.Conn, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("websocket upgrade failed: %v", err)
			return
		}
		serverConns <- conn
	}))
	t.Cleanup(server.Close)

	clientConn, _, err := websocket.DefaultDialer.Dial(strings.Replace(server.URL, "http://", "ws://", 1), nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	t.Cleanup(func() { _ = clientConn.Close() })

	var serverConn *websocket.Conn
	select {
	case serverConn = <-serverConns:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for server websocket upgrade")
	}
	t.Cleanup(func() { _ = serverConn.Close() })

	return rpc.NewConnection(serverConn), clientConn
}
