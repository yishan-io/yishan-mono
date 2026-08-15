package node

import (
	"context"
	"strings"
	"testing"
)

func TestInstallCLIToolRejectsUnknownTool(t *testing.T) {
	t.Parallel()

	_, err := installCLITool(context.Background(), "unknown-tool")
	if err == nil || !strings.Contains(err.Error(), "unknown CLI tool") {
		t.Fatalf("expected unknown CLI tool error, got %v", err)
	}
}

func TestUninstallCLIToolRejectsUnknownTool(t *testing.T) {
	t.Parallel()

	_, err := uninstallCLITool(context.Background(), "unknown-tool")
	if err == nil || !strings.Contains(err.Error(), "unknown CLI tool") {
		t.Fatalf("expected unknown CLI tool error, got %v", err)
	}
}

func TestUninstallCLIToolRejectsUnsupportedUninstall(t *testing.T) {
	t.Parallel()

	// pi has no uninstall path; this must not touch the filesystem.
	_, err := uninstallCLITool(context.Background(), "pi")
	if err == nil || !strings.Contains(err.Error(), "uninstall is not supported") {
		t.Fatalf("expected unsupported uninstall error, got %v", err)
	}
}
