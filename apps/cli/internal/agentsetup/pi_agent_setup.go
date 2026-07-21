package setup

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/config"
)

//go:embed assets/pi-agent/APPEND_SYSTEM.md
var managedPiAppendSystemContent string

//go:embed assets/pi-agent/keybindings.json
var managedPiKeybindingsContent string

var managedPiAgentFileNames = []string{"general.md", "explore.md", "builder.md", "code-reviewer.md", "plan-reviewer.md", "task-reviewer.md"}
var staleManagedPiAgentFileNames = []string{"Planner.md", "Reviewer.md"}
var managedPiRootFiles = []managedPiRootFile{
	{name: "APPEND_SYSTEM.md", content: managedPiAppendSystemContent, mode: 0o644},
	{name: "keybindings.json", content: managedPiKeybindingsContent, mode: 0o644},
}

type managedPiRootFile struct {
	name    string
	content string
	mode    os.FileMode
}

func EnsureDefaultPiExtensionSetup() error {
	if err := EnsureDefaultPiExtensions(); err != nil {
		return err
	}
	return ensureManagedPiAgents()
}

func RemoveDefaultPiExtensionSetup() error {
	var removeErr error
	if err := RemoveDefaultPiExtensions(); err != nil {
		removeErr = err
	}
	if err := removeManagedPiSetupFiles(); err != nil {
		if removeErr != nil {
			removeErr = fmt.Errorf("%v; %w", removeErr, err)
		} else {
			removeErr = err
		}
	}
	return removeErr
}

func ensureManagedPiAgents() error {
	targetRootDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	if err := syncManagedPiRootFiles(targetRootDir); err != nil {
		return err
	}

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

func syncManagedPiRootFiles(targetDir string) error {
	for _, file := range managedPiRootFiles {
		if err := writeTextFileIfChanged(filepath.Join(targetDir, file.name), file.content, file.mode); err != nil {
			return fmt.Errorf("write managed pi root file %s: %w", file.name, err)
		}
	}
	return nil
}

func removeManagedPiSetupFiles() error {
	targetRootDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	if err := removeManagedPiRootFiles(targetRootDir); err != nil {
		return err
	}
	targetDir, err := config.ManagedPiAgentsDir()
	if err != nil {
		return fmt.Errorf("resolve managed pi agents dir: %w", err)
	}
	return removeManagedPiAgentFiles(targetDir)
}

func removeManagedPiRootFiles(targetDir string) error {
	for _, file := range managedPiRootFiles {
		if err := os.Remove(filepath.Join(targetDir, file.name)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove managed pi root file %s: %w", file.name, err)
		}
	}
	return nil
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
	return removeStaleManagedPiAgentFiles(targetDir)
}

func removeManagedPiAgentFiles(targetDir string) error {
	for _, fileName := range managedPiAgentFileNames {
		if err := os.Remove(filepath.Join(targetDir, fileName)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove managed pi agent %s: %w", fileName, err)
		}
	}
	return removeStaleManagedPiAgentFiles(targetDir)
}

func removeStaleManagedPiAgentFiles(targetDir string) error {
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
