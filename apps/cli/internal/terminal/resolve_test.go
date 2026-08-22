package terminal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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

func TestResolveSessionMetadataEnv_ClearsInheritedIdentityWithoutWorkspaceValues(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	got := resolveSessionMetadataEnv([]string{
		"PATH=/usr/bin",
		"YISHAN_PROJECT_ID=stale-project",
		"YISHAN_ORG_ID=stale-org",
	}, StartRequest{
		WorkspaceID: "workspace-1",
		TabID:       "tab-1",
		PaneID:      "pane-1",
	})
	joined := strings.Join(got, "\n")
	for _, expected := range []string{"YISHAN_PROJECT_ID=", "YISHAN_ORG_ID="} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("expected %s in env, got %v", expected, got)
		}
	}
	for _, unexpected := range []string{"YISHAN_PROJECT_ID=stale-project", "YISHAN_ORG_ID=stale-org"} {
		if strings.Contains(joined, unexpected) {
			t.Fatalf("unexpected inherited identity %s in env, got %v", unexpected, got)
		}
	}
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

func TestManagerResolveSessionEnv_OverridesAndClearsDaemonEndpoint(t *testing.T) {
	manager := NewManager()
	manager.SetDaemonWSEndpoint("ws://127.0.0.1:4312/ws")
	env := manager.resolveSessionEnv([]string{"YISHAN_DAEMON_WS_URL=stale", "YISHAN_DAEMON_WS_URL=request"}, StartRequest{})
	assertSingleEnvEntry(t, env, "YISHAN_DAEMON_WS_URL=ws://127.0.0.1:4312/ws")

	manager.SetDaemonWSEndpoint("")
	env = manager.resolveSessionEnv([]string{"YISHAN_DAEMON_WS_URL=stale"}, StartRequest{})
	assertSingleEnvEntry(t, env, "YISHAN_DAEMON_WS_URL=")
}

func assertSingleEnvEntry(t *testing.T, env []string, want string) {
	t.Helper()
	count := 0
	for _, entry := range env {
		if strings.HasPrefix(entry, "YISHAN_DAEMON_WS_URL=") {
			count++
			if entry != want {
				t.Fatalf("daemon endpoint = %q, want %q", entry, want)
			}
		}
	}
	if count != 1 {
		t.Fatalf("daemon endpoint entries = %d, want 1: %v", count, env)
	}
}
