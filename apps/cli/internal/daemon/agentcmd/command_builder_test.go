package agentcmd_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/daemon/agentcmd"
)

// ── BuildRunCommand ───────────────────────────────────────────────────────────

func TestBuildRunCommand_OpenCode_NonInteractive(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("opencode", "summarize this", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd.Binary != "opencode" {
		t.Errorf("expected binary opencode, got %q", cmd.Binary)
	}
	if len(cmd.Args) == 0 || cmd.Args[0] != "run" {
		t.Errorf("expected first arg to be 'run', got %v", cmd.Args)
	}
}

func TestBuildRunCommand_Claude_NonInteractive(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("claude", "hello", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd.Binary != "claude" {
		t.Errorf("expected binary claude, got %q", cmd.Binary)
	}
	// claude non-interactive uses -p flag
	if len(cmd.Args) == 0 || cmd.Args[0] != "-p" {
		t.Errorf("expected first arg -p, got %v", cmd.Args)
	}
}

func TestBuildRunCommand_UnsupportedAgent(t *testing.T) {
	_, err := agentcmd.BuildRunCommand("unknown-agent-xyz", "prompt", "", false)
	if err == nil {
		t.Fatal("expected error for unsupported agent kind")
	}
	if !strings.Contains(err.Error(), "unsupported agent kind") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestBuildRunCommand_EmptyAgentKind_DefaultsToOpenCode(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("", "prompt", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd.Binary != "opencode" {
		t.Errorf("empty agent kind should default to opencode, got %q", cmd.Binary)
	}
}

// ── Session isolation: ExtraEnv and persistence flags ────────────────────────

func TestBuildRunCommand_OpenCode_NonInteractive_HasOPENCODE_DB(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("opencode", "summarize", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, e := range cmd.ExtraEnv {
		if strings.HasPrefix(e, "OPENCODE_DB=") {
			found = true
			// Verify the path was actually created.
			path := strings.TrimPrefix(e, "OPENCODE_DB=")
			if _, statErr := os.Stat(path); statErr != nil {
				t.Errorf("OPENCODE_DB temp file does not exist: %v", statErr)
			}
			break
		}
	}
	if !found {
		t.Errorf("expected OPENCODE_DB in ExtraEnv, got %v", cmd.ExtraEnv)
	}
}

func TestBuildRunCommand_OpenCode_Interactive_NoExtraEnv(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("opencode", "hello", "", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cmd.ExtraEnv) != 0 {
		t.Errorf("expected no ExtraEnv for interactive run, got %v", cmd.ExtraEnv)
	}
}

func TestBuildRunCommand_Claude_NonInteractive_HasNoSessionFlag(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("claude", "hello", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, a := range cmd.Args {
		if a == "--no-session-persistence" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected --no-session-persistence in args, got %v", cmd.Args)
	}
	// No extra env needed for claude.
	if len(cmd.ExtraEnv) != 0 {
		t.Errorf("expected no ExtraEnv for claude, got %v", cmd.ExtraEnv)
	}
}

func TestBuildRunCommand_Codex_NonInteractive_HasEphemeralFlag(t *testing.T) {
	cmd, err := agentcmd.BuildRunCommand("codex", "hello", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	found := false
	for _, a := range cmd.Args {
		if a == "--ephemeral" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected --ephemeral in args, got %v", cmd.Args)
	}
	if len(cmd.ExtraEnv) != 0 {
		t.Errorf("expected no ExtraEnv for codex, got %v", cmd.ExtraEnv)
	}
}

// ── ResolveCommandWithEnv ─────────────────────────────────────────────────────

func TestResolveCommandWithEnv_BinaryNotFound_ReturnsError(t *testing.T) {
	// Provide an env with PATH pointing only to an empty directory so the
	// binary cannot be found regardless of host configuration.
	emptyDir := t.TempDir()
	env := []string{"PATH=" + emptyDir}

	_, err := agentcmd.ResolveCommandWithEnv("opencode", "prompt", "", false, env)
	if err == nil {
		t.Fatal("expected error when binary not found in PATH")
	}
	if !strings.Contains(err.Error(), "agent binary not found in PATH") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestResolveCommandWithEnv_BinaryFound_ReturnsAbsolutePath(t *testing.T) {
	// Place a fake executable in a temp dir and expose it via the env PATH.
	binDir := t.TempDir()
	fakeExe := filepath.Join(binDir, "opencode")
	if err := os.WriteFile(fakeExe, []byte("#!/bin/sh\necho ok"), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}

	env := []string{"PATH=" + binDir}
	cmd, err := agentcmd.ResolveCommandWithEnv("opencode", "prompt", "", false, env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !filepath.IsAbs(cmd.ResolvedBinary) {
		t.Errorf("ResolvedBinary must be absolute, got %q", cmd.ResolvedBinary)
	}
	if cmd.ResolvedBinary != fakeExe {
		t.Errorf("expected ResolvedBinary=%q, got %q", fakeExe, cmd.ResolvedBinary)
	}
}

func TestResolveCommandWithEnv_EnvPassedThrough(t *testing.T) {
	binDir := t.TempDir()
	fakeExe := filepath.Join(binDir, "opencode")
	if err := os.WriteFile(fakeExe, []byte("#!/bin/sh\necho ok"), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}

	env := []string{"PATH=" + binDir, "MY_VAR=hello"}
	cmd, err := agentcmd.ResolveCommandWithEnv("opencode", "prompt", "", false, env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The same env slice should be returned unchanged.
	if len(cmd.Env) != len(env) {
		t.Errorf("expected Env len %d, got %d", len(env), len(cmd.Env))
	}
	found := false
	for _, e := range cmd.Env {
		if e == "MY_VAR=hello" {
			found = true
		}
	}
	if !found {
		t.Error("env entry MY_VAR=hello should be present in ResolvedCommand.Env")
	}
}

func TestResolveCommandWithEnv_UnsupportedAgent_ReturnsError(t *testing.T) {
	env := []string{"PATH=/usr/bin"}
	_, err := agentcmd.ResolveCommandWithEnv("unknown-xyz", "prompt", "", false, env)
	if err == nil {
		t.Fatal("expected error for unsupported agent kind")
	}
	if !strings.Contains(err.Error(), "unsupported agent kind") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestResolveCommandWithEnv_ArgsPreserved(t *testing.T) {
	binDir := t.TempDir()
	fakeExe := filepath.Join(binDir, "opencode")
	if err := os.WriteFile(fakeExe, []byte("#!/bin/sh\necho ok"), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}

	env := []string{"PATH=" + binDir}
	cmd, err := agentcmd.ResolveCommandWithEnv("opencode", "my prompt", "gpt-4o", false, env)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Non-interactive opencode: ["run", "my prompt", "-m", "gpt-4o"] or similar.
	if len(cmd.Args) == 0 {
		t.Error("expected non-empty args")
	}
	argsStr := strings.Join(cmd.Args, " ")
	if !strings.Contains(argsStr, "my prompt") {
		t.Errorf("expected prompt in args, got %v", cmd.Args)
	}
}

