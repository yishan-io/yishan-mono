package shellenv

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestNormalizePathValueExpandsTildeEntries(t *testing.T) {
	homeDir := filepath.Join(string(os.PathSeparator), "Users", "testuser")
	got := normalizePathValue("~/bin:/usr/local/bin:~:relative", homeDir)
	want := filepath.Join(homeDir, "bin") + string(os.PathListSeparator) + "/usr/local/bin" + string(os.PathListSeparator) + homeDir + string(os.PathListSeparator) + "relative"
	if got != want {
		t.Fatalf("normalizePathValue() = %q, want %q", got, want)
	}
}

func TestResolveExecutablePathFromEnvExpandsTildePathEntries(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("executable bit semantics differ on windows")
	}

	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	binDir := filepath.Join(homeDir, ".opencode", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() = %v", err)
	}

	exePath := filepath.Join(binDir, "opencode")
	if err := os.WriteFile(exePath, []byte("#!/bin/sh\necho ok\n"), 0o755); err != nil {
		t.Fatalf("WriteFile() = %v", err)
	}

	got := ResolveExecutablePathFromEnv("opencode", []string{"PATH=~/.opencode/bin"})
	if got != exePath {
		t.Fatalf("ResolveExecutablePathFromEnv() = %q, want %q", got, exePath)
	}
}
