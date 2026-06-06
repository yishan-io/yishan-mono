package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureManagedHookAssetsWritesNotifyScripts(t *testing.T) {
	managedRootDir := t.TempDir()
	assets, err := ensureManagedHookAssets(managedRootDir)
	if err != nil {
		t.Fatalf("ensure assets: %v", err)
	}

	for _, path := range []string{
		assets.notifyScriptPath,
		assets.notifyPowerShellScriptPath,
		filepath.Join(managedRootDir, "bin", "claude"),
		filepath.Join(managedRootDir, "bin", "codex"),
		filepath.Join(managedRootDir, "bin", "opencode"),
		filepath.Join(managedRootDir, "bin", "gemini"),
		filepath.Join(managedRootDir, "bin", "pi"),
		filepath.Join(managedRootDir, "bin", "copilot"),
		filepath.Join(managedRootDir, "bin", "cursor"),
		filepath.Join(managedRootDir, "lib", "common.sh"),
		filepath.Join(managedRootDir, "lib", "hook_ingress.sh"),
	} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat %s: %v", path, err)
		}
		if info.Mode().Perm()&0o111 == 0 {
			t.Fatalf("expected %s to be executable, mode %s", path, info.Mode().Perm())
		}
	}

	if assets.managedBinDir != filepath.Join(managedRootDir, "bin") {
		t.Fatalf("expected managed bin dir under managed root, got %s", assets.managedBinDir)
	}
}

func TestManagedHookAssetsCoverSupportedAgents(t *testing.T) {
	managedRootDir := t.TempDir()
	if _, err := ensureManagedHookAssets(managedRootDir); err != nil {
		t.Fatalf("ensure assets: %v", err)
	}

	for _, commandName := range []string{"opencode", "codex", "claude", "gemini", "pi", "copilot", "cursor"} {
		if _, err := os.Stat(filepath.Join(managedRootDir, "bin", commandName)); err != nil {
			t.Fatalf("expected wrapper for supported agent %s: %v", commandName, err)
		}
	}
}

func TestEnsureManagedShellSetupWritesShellWrappers(t *testing.T) {
	managedRootDir := t.TempDir()
	if err := ensureManagedShellSetup(managedRootDir); err != nil {
		t.Fatalf("ensure shell setup: %v", err)
	}

	for _, path := range []string{
		filepath.Join(managedRootDir, "shell", "zsh", ".zshenv"),
		filepath.Join(managedRootDir, "shell", "zsh", ".zprofile"),
		filepath.Join(managedRootDir, "shell", "zsh", ".zshrc"),
		filepath.Join(managedRootDir, "shell", "zsh", ".zlogin"),
		filepath.Join(managedRootDir, "shell", "bash", "rcfile"),
	} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read shell wrapper %s: %v", path, err)
		}
		content := string(raw)
		if !strings.Contains(content, managedRootDir) {
			t.Fatalf("expected %s to reference managed root dir", path)
		}
	}
}

func TestManagedShellEnvResolvesOrigZdotdirWhenAlreadyManaged(t *testing.T) {
	managedRootDir := t.TempDir()
	managedZshDir := filepath.Join(managedRootDir, "shell", "zsh")

	// Simulate dev mode: ZDOTDIR already points to the managed wrapper dir
	// because the daemon inherited its parent shell's environment.
	baseEnv := []string{
		"HOME=/Users/test",
		"PATH=/usr/bin",
		"ZDOTDIR=" + managedZshDir,
	}

	got := managedShellEnv(baseEnv, managedRootDir, "/bin/zsh")
	joined := strings.Join(got, "\n")

	// YISHAN_ORIG_ZDOTDIR should resolve to HOME, not the managed dir.
	expectedOrig := origZdotdirEnvKey + "=/Users/test"
	if !strings.Contains(joined, expectedOrig) {
		t.Fatalf("expected %s when ZDOTDIR already points to managed dir, got %v", expectedOrig, got)
	}

	// ZDOTDIR should still be set to managed wrapper dir.
	if !strings.Contains(joined, "ZDOTDIR="+managedZshDir) {
		t.Fatalf("expected ZDOTDIR to be set to managed wrapper dir, got %v", got)
	}
}

func TestManagedShellEnvPreservesCustomZdotdir(t *testing.T) {
	managedRootDir := t.TempDir()

	// User has a custom ZDOTDIR (not the managed one).
	baseEnv := []string{
		"HOME=/Users/test",
		"PATH=/usr/bin",
		"ZDOTDIR=/Users/test/.config/zsh",
	}

	got := managedShellEnv(baseEnv, managedRootDir, "/bin/zsh")
	joined := strings.Join(got, "\n")

	// YISHAN_ORIG_ZDOTDIR should preserve the user's custom ZDOTDIR.
	expectedOrig := origZdotdirEnvKey + "=/Users/test/.config/zsh"
	if !strings.Contains(joined, expectedOrig) {
		t.Fatalf("expected %s, got %v", expectedOrig, got)
	}
}
