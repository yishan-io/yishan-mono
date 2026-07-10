package setup

import (
	"fmt"
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/config"
)

var managedPiAgentFileNames = []string{"general.md", "explore.md", "builder.md", "code-reviewer.md", "plan-reviewer.md", "task-reviewer.md"}
var staleManagedPiAgentFileNames = []string{"Planner.md", "Reviewer.md"}

func ensureManagedPiAgents() error {
	sourceDir, err := managedPiSubagentsAgentsDir()
	if err != nil {
		return err
	}
	targetDir, err := config.ManagedPiAgentsDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agents dir: %w", err)
	}
	return syncManagedPiAgentFiles(sourceDir, targetDir)
}

func syncManagedPiAgentFiles(sourceDir string, targetDir string) error {
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return fmt.Errorf("create managed pi agents dir: %w", err)
	}
	for _, fileName := range managedPiAgentFileNames {
		if err := syncManagedPiAgentFile(sourceDir, targetDir, fileName); err != nil {
			return err
		}
	}
	for _, fileName := range staleManagedPiAgentFileNames {
		if err := os.Remove(filepath.Join(targetDir, fileName)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove stale managed pi agent %s: %w", fileName, err)
		}
	}
	return nil
}

func syncManagedPiAgentFile(sourceDir string, targetDir string, fileName string) error {
	sourcePath := filepath.Join(sourceDir, fileName)
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		return fmt.Errorf("read managed pi agent source %s: %w", sourcePath, err)
	}
	targetPath := filepath.Join(targetDir, fileName)
	if err := os.WriteFile(targetPath, content, 0o644); err != nil {
		return fmt.Errorf("write managed pi agent file %s: %w", targetPath, err)
	}
	return nil
}

func managedPiSubagentsAgentsDir() (string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return "", fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	return filepath.Join(piAgentDir, "npm", "node_modules", "@yishan-io", "pi-subagents", "agents"), nil
}
