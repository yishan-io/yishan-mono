package terminal

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestResolveCommand(t *testing.T) {
	tests := []struct {
		name            string
		request         StartRequest
		goos            string
		shellEnv        string
		wantCommand     string
		wantArgsLen     int
		wantFirstArg    string
		wantArgsPresent bool
	}{
		{
			name: "uses explicit command when provided",
			request: StartRequest{
				Command: "python",
				Args:    []string{"-V"},
			},
			goos:            "darwin",
			shellEnv:        "/bin/zsh",
			wantCommand:     "python",
			wantArgsLen:     1,
			wantFirstArg:    "-V",
			wantArgsPresent: true,
		},
		{
			name:            "uses shell env on unix when command missing",
			request:         StartRequest{},
			goos:            "linux",
			shellEnv:        "/bin/zsh",
			wantCommand:     "/bin/zsh",
			wantArgsLen:     1,
			wantFirstArg:    "-l",
			wantArgsPresent: true,
		},
		{
			name: "keeps explicit default shell args",
			request: StartRequest{
				Args: []string{"-f"},
			},
			goos:            "linux",
			shellEnv:        "/bin/zsh",
			wantCommand:     "/bin/zsh",
			wantArgsLen:     1,
			wantFirstArg:    "-f",
			wantArgsPresent: true,
		},
		{
			name:            "falls back to zsh on darwin when shell env missing",
			request:         StartRequest{},
			goos:            "darwin",
			shellEnv:        "",
			wantCommand:     "/bin/zsh",
			wantArgsLen:     1,
			wantFirstArg:    "-l",
			wantArgsPresent: true,
		},
		{
			name:            "falls back to bash on linux when shell env missing",
			request:         StartRequest{},
			goos:            "linux",
			shellEnv:        "",
			wantCommand:     "/bin/bash",
			wantArgsLen:     3,
			wantFirstArg:    "--rcfile",
			wantArgsPresent: true,
		},
		{
			name:            "uses cmd on windows",
			request:         StartRequest{},
			goos:            "windows",
			shellEnv:        "C:/Program Files/Git/bin/bash.exe",
			wantCommand:     "cmd.exe",
			wantArgsLen:     0,
			wantArgsPresent: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gotCommand, gotArgs := resolveCommand(test.request, test.goos, test.shellEnv)
			if gotCommand != test.wantCommand {
				t.Fatalf("expected command %q, got %q", test.wantCommand, gotCommand)
			}
			if len(gotArgs) != test.wantArgsLen {
				t.Fatalf("expected %d args, got %d", test.wantArgsLen, len(gotArgs))
			}
			if test.wantArgsPresent && gotArgs[0] != test.wantFirstArg {
				t.Fatalf("expected first arg %q, got %q", test.wantFirstArg, gotArgs[0])
			}
		})
	}
}

func TestResolveEnvDefaults(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	got := resolveEnv([]string{"PATH=/usr/bin"}, []string{"TERM=screen-256color"})
	joined := strings.Join(got, "\n")

	if !strings.Contains(joined, "TERM=screen-256color") {
		t.Fatalf("expected request env to override TERM, got %v", got)
	}
	if !strings.Contains(joined, "COLORTERM=truecolor") {
		t.Fatalf("expected COLORTERM default, got %v", got)
	}
	if !strings.Contains(joined, "LANG=en_US.UTF-8") {
		t.Fatalf("expected LANG default, got %v", got)
	}
	if !strings.Contains(joined, "PATH="+filepath.Join(os.Getenv("HOME"), ".yishan", "bin")+string(os.PathListSeparator)+"/usr/bin") {
		t.Fatalf("expected managed bin path to be prepended, got %v", got)
	}
}

func TestResolveSessionMetadataEnv(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	got := resolveSessionMetadataEnv([]string{"PATH=/usr/bin"}, StartRequest{
		WorkspaceID: "workspace-1",
		TabID:       "tab-1",
		PaneID:      "pane-1",
	})
	joined := strings.Join(got, "\n")
	for _, expected := range []string{
		"YISHAN_WORKSPACE_ID=workspace-1",
		"YISHAN_TAB_ID=tab-1",
		"YISHAN_PANE_ID=pane-1",
		"YISHAN_NOTIFY_SCRIPT_PATH=" + filepath.Join(homeDir, ".yishan", "notify.sh"),
		"PI_CODING_AGENT_DIR=" + filepath.Join(homeDir, ".yishan", "pi", "agent"),
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected %s in env, got %v", expected, got)
		}
	}
}

func TestSessionSendReadStop(t *testing.T) {
	m := NewManager()

	start, err := m.Start(context.Background(), t.TempDir(), StartRequest{Command: "cat"})
	if err != nil {
		t.Fatalf("start terminal: %v", err)
	}
	t.Cleanup(func() {
		_, _ = m.Stop(StopRequest{SessionID: start.SessionID})
	})

	input := "hello-from-test\n"
	if _, err := m.Send(SendRequest{SessionID: start.SessionID, Input: input}); err != nil {
		t.Fatalf("send input: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	var output strings.Builder
	for time.Now().Before(deadline) {
		resp, err := m.Read(ReadRequest{SessionID: start.SessionID})
		if err != nil {
			t.Fatalf("read output: %v", err)
		}
		output.WriteString(resp.Output)
		if strings.Contains(output.String(), "hello-from-test") {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	if !strings.Contains(output.String(), "hello-from-test") {
		t.Fatalf("expected output to contain sent input, got %q", output.String())
	}

	stopped, err := m.Stop(StopRequest{SessionID: start.SessionID})
	if err != nil {
		t.Fatalf("stop terminal: %v", err)
	}
	if !stopped.Stopped {
		t.Fatal("expected stop to report stopped=true")
	}
}

func TestListSessions(t *testing.T) {
	m := NewManager()

	running, err := m.Start(context.Background(), t.TempDir(), StartRequest{WorkspaceID: "workspace-1", Command: "cat"})
	if err != nil {
		t.Fatalf("start running terminal: %v", err)
	}
	t.Cleanup(func() {
		_, _ = m.Stop(StopRequest{SessionID: running.SessionID})
	})

	exited, err := m.Start(context.Background(), t.TempDir(), StartRequest{WorkspaceID: "workspace-2", Command: "sh", Args: []string{"-c", "exit 0"}})
	if err != nil {
		t.Fatalf("start exiting terminal: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	var sawExited bool
	for time.Now().Before(deadline) {
		sessions := m.ListSessions(ListSessionsRequest{IncludeExited: true})
		for _, session := range sessions {
			if session.SessionID == exited.SessionID && session.Status == "exited" {
				sawExited = true
				break
			}
		}
		if sawExited {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !sawExited {
		t.Fatal("timed out waiting for terminal session to exit")
	}

	runningOnly := m.ListSessions(ListSessionsRequest{})
	if len(runningOnly) != 1 {
		t.Fatalf("expected one running session, got %d", len(runningOnly))
	}
	if runningOnly[0].SessionID != running.SessionID {
		t.Fatalf("expected running session %q, got %q", running.SessionID, runningOnly[0].SessionID)
	}
	if runningOnly[0].WorkspaceID != "workspace-1" {
		t.Fatalf("expected workspace id workspace-1, got %q", runningOnly[0].WorkspaceID)
	}
	if runningOnly[0].PID <= 0 {
		t.Fatalf("expected pid to be set, got %d", runningOnly[0].PID)
	}
	if runningOnly[0].Status != "running" {
		t.Fatalf("expected running status, got %q", runningOnly[0].Status)
	}
	if runningOnly[0].StartedAt == "" {
		t.Fatal("expected startedAt to be set")
	}

	all := m.ListSessions(ListSessionsRequest{IncludeExited: true})
	if len(all) != 2 {
		t.Fatalf("expected running and exited sessions, got %d", len(all))
	}
	var foundExited bool
	for _, session := range all {
		if session.SessionID == exited.SessionID {
			foundExited = true
			if session.Status != "exited" {
				t.Fatalf("expected exited status, got %q", session.Status)
			}
			if session.ExitedAt == "" {
				t.Fatal("expected exitedAt to be set")
			}
		}
	}
	if !foundExited {
		t.Fatal("expected exited session in includeExited list")
	}
}

func TestSubscriptionStreamsOutputAndExit(t *testing.T) {
	m := NewManager()

	start, err := m.Start(context.Background(), t.TempDir(), StartRequest{
		Command: "sh",
		Args:    []string{"-c", `read line; printf "echo:%s\n" "$line"`},
	})
	if err != nil {
		t.Fatalf("start terminal: %v", err)
	}
	t.Cleanup(func() {
		_, _ = m.Stop(StopRequest{SessionID: start.SessionID})
	})

	sub, err := m.Subscribe(SubscribeRequest{SessionID: start.SessionID})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	if _, err := m.Send(SendRequest{SessionID: start.SessionID, Input: "ping\n"}); err != nil {
		t.Fatalf("send input: %v", err)
	}

	deadline := time.After(3 * time.Second)
	var seenOutput bool
	var seenExit bool

	for !seenOutput || !seenExit {
		select {
		case event, ok := <-sub.Events:
			if !ok {
				if !seenExit {
					t.Fatal("subscription closed before exit event")
				}
				return
			}
			switch event.Type {
			case "output":
				if strings.Contains(event.Chunk, "echo:ping") {
					seenOutput = true
				}
			case "exit":
				if event.ExitCode == nil {
					t.Fatal("expected exit code in exit event")
				}
				if *event.ExitCode != 0 {
					t.Fatalf("expected exit code 0, got %d", *event.ExitCode)
				}
				seenExit = true
			}
		case <-deadline:
			t.Fatalf("timed out waiting for output+exit events (seenOutput=%t, seenExit=%t)", seenOutput, seenExit)
		}
	}
}

func TestSessionOutputBufferIsBounded(t *testing.T) {
	s := &session{}
	s.outputMu.Lock()
	s.appendOutput(strings.Repeat("a", maxSessionOutputBytes+128))
	if got := s.output.Len(); got != maxSessionOutputBytes {
		t.Fatalf("expected output buffer to be capped at %d bytes, got %d", maxSessionOutputBytes, got)
	}
	if !strings.HasPrefix(s.output.String(), "a") {
		t.Fatal("expected capped buffer to retain chunk suffix")
	}

	s.appendOutput(strings.Repeat("b", 256))
	if got := s.output.Len(); got > maxSessionOutputBytes {
		t.Fatalf("expected output buffer to remain capped at %d bytes, got %d", maxSessionOutputBytes, got)
	}
	if !strings.HasSuffix(s.output.String(), strings.Repeat("b", 256)) {
		t.Fatal("expected capped buffer to retain newest output")
	}
	s.outputMu.Unlock()
}

func TestResolveManagedRuntimeEnvResolvesOrigZdotdirWhenAlreadyManaged(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	managedZshDir := filepath.Join(homeDir, ".yishan", "shell", "zsh")

	// Simulate dev mode: ZDOTDIR already points to the managed wrapper dir
	// because the daemon inherited its parent shell's environment.
	baseEnv := []string{
		"HOME=" + homeDir,
		"PATH=/usr/bin",
		"ZDOTDIR=" + managedZshDir,
	}

	got := resolveManagedRuntimeEnv(baseEnv, "/bin/zsh")
	joined := strings.Join(got, "\n")

	// YISHAN_ORIG_ZDOTDIR should resolve to HOME, not the managed dir.
	expectedOrig := managedRuntimeOrigZdotdirEnvKey + "=" + homeDir
	if !strings.Contains(joined, expectedOrig) {
		t.Fatalf("expected %s when ZDOTDIR already points to managed dir, got %v", expectedOrig, got)
	}
}

func TestResolveManagedRuntimeEnvPreservesCustomZdotdir(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	customZdotdir := filepath.Join(homeDir, ".config", "zsh")

	baseEnv := []string{
		"HOME=" + homeDir,
		"PATH=/usr/bin",
		"ZDOTDIR=" + customZdotdir,
	}

	got := resolveManagedRuntimeEnv(baseEnv, "/bin/zsh")
	joined := strings.Join(got, "\n")

	// YISHAN_ORIG_ZDOTDIR should preserve the user's custom ZDOTDIR.
	expectedOrig := managedRuntimeOrigZdotdirEnvKey + "=" + customZdotdir
	if !strings.Contains(joined, expectedOrig) {
		t.Fatalf("expected %s, got %v", expectedOrig, got)
	}
}

func TestResizeAndUnsubscribe(t *testing.T) {
	m := NewManager()

	start, err := m.Start(context.Background(), t.TempDir(), StartRequest{Command: "cat"})
	if err != nil {
		t.Fatalf("start terminal: %v", err)
	}
	t.Cleanup(func() {
		_, _ = m.Stop(StopRequest{SessionID: start.SessionID})
	})

	if _, err := m.Resize(ResizeRequest{SessionID: start.SessionID, Cols: 120, Rows: 40}); err != nil {
		t.Fatalf("resize terminal: %v", err)
	}

	if _, err := m.Resize(ResizeRequest{SessionID: start.SessionID, Cols: 0, Rows: 40}); err == nil {
		t.Fatal("expected resize error when cols is zero")
	}

	sub, err := m.Subscribe(SubscribeRequest{SessionID: start.SessionID})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	resp, err := m.Unsubscribe(UnsubscribeRequest{SessionID: start.SessionID, SubscriptionID: sub.ID})
	if err != nil {
		t.Fatalf("unsubscribe: %v", err)
	}
	if !resp.Unsubscribed {
		t.Fatal("expected unsubscribed=true")
	}

	select {
	case _, ok := <-sub.Events:
		if ok {
			t.Fatal("expected subscription channel to be closed")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for subscription channel close")
	}
}

func TestBuildPIDToRootMap(t *testing.T) {
	pidToRoot := buildPIDToRootMap(
		[]int{100, 200},
		[]processInfo{
			{PID: 101, PPID: 100},
			{PID: 102, PPID: 101},
			{PID: 201, PPID: 200},
			{PID: 301, PPID: 999},
		},
	)

	if pidToRoot[100] != 100 || pidToRoot[101] != 100 || pidToRoot[102] != 100 {
		t.Fatalf("expected process tree rooted at 100, got %+v", pidToRoot)
	}
	if pidToRoot[200] != 200 || pidToRoot[201] != 200 {
		t.Fatalf("expected process tree rooted at 200, got %+v", pidToRoot)
	}
	if _, ok := pidToRoot[301]; ok {
		t.Fatalf("expected unrelated process to be excluded, got %+v", pidToRoot)
	}
}

func TestSessionLifecycleEventsOnStartAndStop(t *testing.T) {
	m := NewManager()

	var events []SessionLifecycleEvent
	m.SetSessionsChangedListener(func(e SessionLifecycleEvent) {
		events = append(events, e)
	})

	start, err := m.Start(context.Background(), t.TempDir(), StartRequest{
		Command:     "sleep",
		Args:        []string{"10"},
		WorkspaceID: "ws-1",
		TabID:       "tab-1",
		PaneID:      "pane-1",
	})
	if err != nil {
		t.Fatalf("start terminal: %v", err)
	}

	if len(events) < 1 {
		t.Fatal("expected at least one lifecycle event after start")
	}
	created := events[0]
	if created.Action != "created" {
		t.Fatalf("expected created action, got %q", created.Action)
	}
	if created.SessionID != start.SessionID {
		t.Fatalf("expected sessionId %q, got %q", start.SessionID, created.SessionID)
	}
	if created.WorkspaceID != "ws-1" {
		t.Fatalf("expected workspaceId ws-1, got %q", created.WorkspaceID)
	}
	if created.TabID != "tab-1" {
		t.Fatalf("expected tabId tab-1, got %q", created.TabID)
	}
	if created.PaneID != "pane-1" {
		t.Fatalf("expected paneId pane-1, got %q", created.PaneID)
	}
	if created.Status != "running" {
		t.Fatalf("expected status running, got %q", created.Status)
	}

	_, err = m.Stop(StopRequest{SessionID: start.SessionID})
	if err != nil {
		t.Fatalf("stop terminal: %v", err)
	}

	if len(events) < 2 {
		t.Fatalf("expected at least two lifecycle events, got %d", len(events))
	}
	destroyed := events[1]
	if destroyed.Action != "destroyed" {
		t.Fatalf("expected destroyed action, got %q", destroyed.Action)
	}
	if destroyed.SessionID != start.SessionID {
		t.Fatalf("expected sessionId %q, got %q", start.SessionID, destroyed.SessionID)
	}
	if destroyed.TabID != "tab-1" {
		t.Fatalf("expected destroyed tabId tab-1, got %q", destroyed.TabID)
	}
	if destroyed.PaneID != "pane-1" {
		t.Fatalf("expected destroyed paneId pane-1, got %q", destroyed.PaneID)
	}
}

func TestSessionLifecycleEventOnNaturalExit(t *testing.T) {
	m := NewManager()

	var events []SessionLifecycleEvent
	m.SetSessionsChangedListener(func(e SessionLifecycleEvent) {
		events = append(events, e)
	})

	start, err := m.Start(context.Background(), t.TempDir(), StartRequest{
		Command:     "true",
		WorkspaceID: "ws-2",
	})
	if err != nil {
		t.Fatalf("start terminal: %v", err)
	}

	// Wait for the process to exit naturally.
	requireEvent := func() {
		deadline := time.After(3 * time.Second)
		for {
			for _, e := range events {
				if e.Action == "destroyed" && e.SessionID == start.SessionID {
					return
				}
			}
			select {
			case <-deadline:
				t.Fatal("timed out waiting for destroyed lifecycle event")
			case <-time.After(10 * time.Millisecond):
			}
		}
	}
	requireEvent()

	// Session should be in the map until Stop() is called.
	summary := m.ListSessions(ListSessionsRequest{IncludeExited: true})
	found := false
	for _, s := range summary {
		if s.SessionID == start.SessionID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected session to still be listed after natural exit")
	}

	// Stop should not fire a second destroyed event.
	beforeCount := len(events)
	_, err = m.Stop(StopRequest{SessionID: start.SessionID})
	if err != nil {
		t.Fatalf("stop after natural exit: %v", err)
	}
	destroyedCount := 0
	for _, e := range events {
		if e.Action == "destroyed" && e.SessionID == start.SessionID {
			destroyedCount++
		}
	}
	if destroyedCount != 1 {
		t.Fatalf("expected exactly one destroyed lifecycle event, got %d", destroyedCount)
	}
	_ = beforeCount
}
