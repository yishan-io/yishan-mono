package detect

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestDetectGhCLIVersion(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	ghPath := filepath.Join(binDir, "gh")
	script := "#!/bin/sh\necho 'gh version 2.45.0 (2024-06-19)'\n"
	if err := os.WriteFile(ghPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write gh script: %v", err)
	}

	version := detectGhCLIVersion(ghPath)
	if version != "2.45.0" {
		t.Fatalf("expected 2.45.0, got %q", version)
	}
}

func TestDetectGhCLIVersionEmptyWhenOutputMissing(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	ghPath := filepath.Join(binDir, "gh")
	script := "#!/bin/sh\necho 'unexpected output'\n"
	if err := os.WriteFile(ghPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write gh script: %v", err)
	}

	version := detectGhCLIVersion(ghPath)
	if version != "" {
		t.Fatalf("expected empty version, got %q", version)
	}
}

func TestDetectGhCLIVersionFallsBackToBareOutput(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test currently targets unix-style executable permissions")
	}

	binDir := t.TempDir()
	ghPath := filepath.Join(binDir, "gh")
	script := "#!/bin/sh\necho '1.2.3'\n"
	if err := os.WriteFile(ghPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write gh script: %v", err)
	}

	if got := detectGhCLIVersion(ghPath); got != "1.2.3" {
		t.Fatalf("expected 1.2.3, got %q", got)
	}
}
