package setup

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSyncManagedPiAgentFilesCopiesApprovedAgentsAndRemovesStaleOnes(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()

	for fileName, content := range map[string]string{
		"General.md": "# General\n",
		"Explore.md": "# Explore\n",
	} {
		if err := os.WriteFile(filepath.Join(sourceDir, fileName), []byte(content), 0o644); err != nil {
			t.Fatalf("write source file %s: %v", fileName, err)
		}
	}
	for _, staleFileName := range staleManagedPiAgentFileNames {
		if err := os.WriteFile(filepath.Join(targetDir, staleFileName), []byte("stale\n"), 0o644); err != nil {
			t.Fatalf("write stale file %s: %v", staleFileName, err)
		}
	}

	if err := syncManagedPiAgentFiles(sourceDir, targetDir); err != nil {
		t.Fatalf("sync managed pi agent files: %v", err)
	}

	for fileName, expectedContent := range map[string]string{
		"General.md": "# General\n",
		"Explore.md": "# Explore\n",
	} {
		content, err := os.ReadFile(filepath.Join(targetDir, fileName))
		if err != nil {
			t.Fatalf("read synced file %s: %v", fileName, err)
		}
		if string(content) != expectedContent {
			t.Fatalf("expected %s content %q, got %q", fileName, expectedContent, string(content))
		}
	}
	for _, staleFileName := range staleManagedPiAgentFileNames {
		if _, err := os.Stat(filepath.Join(targetDir, staleFileName)); !os.IsNotExist(err) {
			t.Fatalf("expected stale file %s to be removed, err=%v", staleFileName, err)
		}
	}
}
