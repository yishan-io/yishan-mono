package system

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestScheduledAgentEnvironmentOverridesDaemonWSURL(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}
	markerPath := installSchedulerPi(t)
	t.Setenv("YISHAN_DAEMON_WS_URL", "stale")

	if _, err := RunAgent(context.Background(), "pi", "prompt", "", t.TempDir(), "ws://127.0.0.1:4312/ws"); err != nil {
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

	if _, err := RunAgent(context.Background(), "pi", "prompt", "", t.TempDir(), ""); err != nil {
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

