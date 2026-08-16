package setup

import (
	"os"
	"path/filepath"
	"testing"
)

func writeAgentFile(t *testing.T, dir string, fileName string, frontMatterName string, description string, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	content := "---\nname: " + frontMatterName + "\ndescription: " + description + "\nread_only: false\n---\n" + body
	if err := os.WriteFile(filepath.Join(dir, fileName), []byte(content), 0o644); err != nil {
		t.Fatalf("write agent file %s: %v", fileName, err)
	}
}

func withPiAgentsDir(t *testing.T) string {
	withPiHome(t)
	homeDir, _ := os.UserHomeDir()
	agentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	return agentsDir
}
