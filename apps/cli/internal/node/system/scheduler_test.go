package system

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
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
	script := "#!/bin/sh\nprintf '%s' \"$YISHAN_DAEMON_WS_URL\" > " + markerPath + "\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake pi binary: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")
	return markerPath
}
