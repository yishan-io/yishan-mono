package daemon

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
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
