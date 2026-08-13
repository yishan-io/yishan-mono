package daemon

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/runtime/shellenv"
)

func TestBuildAgentFailureDetail(t *testing.T) {
	cases := []struct {
		name   string
		stdout string
		stderr string
		want   string
	}{
		{name: "stderr only", stderr: "boom", want: "stderr: boom"},
		{name: "stdout only", stdout: "partial output", want: "stdout: partial output"},
		{name: "stdout and stderr", stdout: "partial output", stderr: "boom", want: "stderr: boom; stdout: partial output"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := buildAgentFailureDetail(tc.stdout, tc.stderr)
			if got != tc.want {
				t.Fatalf("buildAgentFailureDetail() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestBuildAgentFailureDetail_TruncatesLongOutput(t *testing.T) {
	got := buildAgentFailureDetail("", strings.Repeat("x", maxAgentFailureDetailChars+100))
	if len(got) != maxAgentFailureDetailChars {
		t.Fatalf("expected truncated detail length %d, got %d", maxAgentFailureDetailChars, len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("expected truncated detail to end with ellipsis, got %q", got)
	}
}

func TestBuildAgentSubprocessEnv_SetsPiAgentDirAndPreservesEntries(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	wantAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		t.Fatalf("ManagedPiAgentDir() error = %v", err)
	}

	// base represents the login-shell merged + PATH enriched env produced by
	// agentcmd.ResolveCommand. The AWS_* entry stands in for provider creds
	// that MergeLoginShellEnv pulls from the user's shell profile; the env
	// construction must not drop them. Two stale PI_CODING_AGENT_DIR entries
	// model a shell profile exporting the var more than once.
	base := []string{
		"AWS_ACCESS_KEY_ID=test-key",
		"PATH=/usr/bin",
		config.PiAgentDirEnvKey + "=/stale/one",
		config.PiAgentDirEnvKey + "=/stale/two",
	}
	got, err := buildAgentSubprocessEnv(base)
	if err != nil {
		t.Fatalf("buildAgentSubprocessEnv() error = %v", err)
	}

	piDirCount := 0
	for _, entry := range got {
		if strings.HasPrefix(entry, config.PiAgentDirEnvKey+"=") {
			piDirCount++
			if entry != config.PiAgentDirEnvKey+"="+wantAgentDir {
				t.Fatalf("PI_CODING_AGENT_DIR entry = %q, want %q", entry, config.PiAgentDirEnvKey+"="+wantAgentDir)
			}
		}
	}
	if piDirCount != 1 {
		t.Fatalf("expected exactly 1 PI_CODING_AGENT_DIR entry, got %d (%v)", piDirCount, got)
	}

	if v := shellenv.EnvValueOrDefault(got, config.PiAgentDirEnvKey, ""); v != wantAgentDir {
		t.Fatalf("PI_CODING_AGENT_DIR = %q, want %q", v, wantAgentDir)
	}
	if v := shellenv.EnvValueOrDefault(got, "AWS_ACCESS_KEY_ID", ""); v != "test-key" {
		t.Fatalf("AWS_ACCESS_KEY_ID = %q, want preserved cred %q", v, "test-key")
	}
	if v := shellenv.EnvValueOrDefault(got, "PATH", ""); v != "/usr/bin" {
		t.Fatalf("PATH = %q, want %q", v, "/usr/bin")
	}
}

func TestBuildRunAgentFunc_SetsPiAgentDirOnSubprocess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}

	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	markerPath := filepath.Join(homeDir, "pi-agent-dir.txt")
	installFakePiBinary(t, markerPath)
	t.Setenv("SHELL", "/bin/sh")

	out, err := BuildRunAgentFunc()(context.Background(), "pi", "", "summarize", "")
	if err != nil {
		t.Fatalf("BuildRunAgentFunc() error = %v (output %q)", err, out)
	}

	wantAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		t.Fatalf("ManagedPiAgentDir() error = %v", err)
	}
	if got := waitForFileContent(t, markerPath); got != wantAgentDir {
		t.Fatalf("PI_CODING_AGENT_DIR = %q, want %q", got, wantAgentDir)
	}
}

func TestRunAgent_SetsPiAgentDirOnSubprocess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}

	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	markerPath := filepath.Join(homeDir, "pi-agent-dir.txt")
	installFakePiBinary(t, markerPath)
	t.Setenv("SHELL", "/bin/sh")

	out, err := runAgent("pi", "summarize", "", "")
	if err != nil {
		t.Fatalf("runAgent() error = %v (output %q)", err, out)
	}

	wantAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		t.Fatalf("ManagedPiAgentDir() error = %v", err)
	}
	if got := waitForFileContent(t, markerPath); got != wantAgentDir {
		t.Fatalf("PI_CODING_AGENT_DIR = %q, want %q", got, wantAgentDir)
	}
}

func TestBuildRunAgentFunc_FailedCommandIncludesStderr(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script test is unix-only")
	}

	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "opencode")
	script := "#!/bin/sh\necho 'simulated stderr failure' 1>&2\nexit 1\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("SHELL", "/bin/sh")

	_, err := BuildRunAgentFunc()(context.Background(), "opencode", "", "prompt", "")
	if err == nil {
		t.Fatal("expected command failure")
	}
	if !strings.Contains(err.Error(), "simulated stderr failure") {
		t.Fatalf("expected stderr in error, got %q", err)
	}
	if !strings.Contains(err.Error(), "exit status 1") {
		t.Fatalf("expected exit status in error, got %q", err)
	}
}
