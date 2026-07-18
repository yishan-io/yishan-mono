package setup

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
)

func TestSyncManagedPiAgentFilesCopiesApprovedAgentsAndRemovesStaleOnes(t *testing.T) {
	sourceDir := t.TempDir()
	targetDir := t.TempDir()

	for fileName, content := range map[string]string{
		"general.md":       "# general\n",
		"explore.md":       "# explore\n",
		"builder.md":       "# builder\n",
		"code-reviewer.md": "# code-reviewer\n",
		"plan-reviewer.md": "# plan-reviewer\n",
		"task-reviewer.md": "# task-reviewer\n",
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
		"general.md":       "# general\n",
		"explore.md":       "# explore\n",
		"builder.md":       "# builder\n",
		"code-reviewer.md": "# code-reviewer\n",
		"plan-reviewer.md": "# plan-reviewer\n",
		"task-reviewer.md": "# task-reviewer\n",
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

func TestEnsureManagedPiAgentsAlsoInstallsManagedPiRootFiles(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	sourceDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-subagents", "agents")
	sourceAgentContents := map[string]string{
		"general.md":       "# general\n",
		"explore.md":       "# explore\n",
		"builder.md":       "# builder\n",
		"code-reviewer.md": "# code-reviewer\n",
		"plan-reviewer.md": "# plan-reviewer\n",
		"task-reviewer.md": "# task-reviewer\n",
	}
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	for fileName, content := range sourceAgentContents {
		if err := os.WriteFile(filepath.Join(sourceDir, fileName), []byte(content), 0o644); err != nil {
			t.Fatalf("write source file %s: %v", fileName, err)
		}
	}

	if err := ensureManagedPiAgents(); err != nil {
		t.Fatalf("ensure managed pi agents: %v", err)
	}

	for fileName, expectedContent := range map[string]string{
		"APPEND_SYSTEM.md": managedPiAppendSystemContent,
		"keybindings.json": managedPiKeybindingsContent,
	} {
		content, err := os.ReadFile(filepath.Join(homeDir, ".yishan", "pi", "agent", fileName))
		if err != nil {
			t.Fatalf("read managed pi root file %s: %v", fileName, err)
		}
		if string(content) != expectedContent {
			t.Fatalf("expected managed pi root file %s content %q, got %q", fileName, expectedContent, string(content))
		}
	}

	targetAgentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	for fileName, expectedContent := range sourceAgentContents {
		content, err := os.ReadFile(filepath.Join(targetAgentsDir, fileName))
		if err != nil {
			t.Fatalf("read synced agent file %s: %v", fileName, err)
		}
		if string(content) != expectedContent {
			t.Fatalf("expected synced agent file %s content %q, got %q", fileName, expectedContent, string(content))
		}
	}
}

func TestEnsureDefaultPiExtensionSetupInstallsExtensionsAndSyncsManagedPiAgents(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	sourceDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "npm", "node_modules", "@yishan-io", "pi-subagents", "agents")
	sourceAgentContents := map[string]string{
		"general.md":       "# general\n",
		"explore.md":       "# explore\n",
		"builder.md":       "# builder\n",
		"code-reviewer.md": "# code-reviewer\n",
		"plan-reviewer.md": "# plan-reviewer\n",
		"task-reviewer.md": "# task-reviewer\n",
	}
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("create source dir: %v", err)
	}
	for fileName, content := range sourceAgentContents {
		if err := os.WriteFile(filepath.Join(sourceDir, fileName), []byte(content), 0o644); err != nil {
			t.Fatalf("write source file %s: %v", fileName, err)
		}
	}

	originalExecCommand := execCommand
	defer func() {
		execCommand = originalExecCommand
	}()

	type recordedCall struct {
		name string
		args []string
		cmd  *exec.Cmd
	}
	calls := make([]recordedCall, 0, 5)
	execCommand = func(name string, args ...string) *exec.Cmd {
		cmd := exec.Command(os.Args[0], "-test.run=^")
		calls = append(calls, recordedCall{name: name, args: append([]string{}, args...), cmd: cmd})
		return cmd
	}

	if err := EnsureDefaultPiExtensionSetup(); err != nil {
		t.Fatalf("ensure default pi extension setup: %v", err)
	}
	if len(calls) != 5 {
		t.Fatalf("expected 5 pi extension install calls, got %d", len(calls))
	}

	expectedAgentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	expectedArgs := [][]string{{"install", piExtensionInstallSource(piNotifyExtensionName)}, {"install", piExtensionInstallSource(piSubagentsExtensionName)}, {"install", piExtensionInstallSource(piMemoryExtensionName)}, {"install", piExtensionInstallSource(piWorkspaceExtensionName)}, {"install", piExtensionInstallSource(piAskExtensionName)}}
	for index, call := range calls {
		if call.name != "pi" {
			t.Fatalf("expected pi command, got %q", call.name)
		}
		if strings.Join(call.args, "|") != strings.Join(expectedArgs[index], "|") {
			t.Fatalf("expected args %v, got %v", expectedArgs[index], call.args)
		}
		if !strings.Contains(strings.Join(call.cmd.Env, "\n"), config.PiAgentDirEnvKey+"="+expectedAgentDir) {
			t.Fatalf("expected managed pi env in %v", call.cmd.Env)
		}
	}

	targetAgentsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "agents")
	for fileName, expectedContent := range sourceAgentContents {
		content, err := os.ReadFile(filepath.Join(targetAgentsDir, fileName))
		if err != nil {
			t.Fatalf("read synced agent file %s: %v", fileName, err)
		}
		if string(content) != expectedContent {
			t.Fatalf("expected synced agent file %s content %q, got %q", fileName, expectedContent, string(content))
		}
	}
}

func TestRemoveDefaultPiExtensionSetupRemovesExtensionsAndManagedPiFiles(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	managedPiAgentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	managedPiAgentsDir := filepath.Join(managedPiAgentDir, "agents")
	if err := os.MkdirAll(managedPiAgentsDir, 0o755); err != nil {
		t.Fatalf("create managed pi agents dir: %v", err)
	}
	for _, file := range managedPiRootFiles {
		if err := os.WriteFile(filepath.Join(managedPiAgentDir, file.name), []byte(file.content), file.mode); err != nil {
			t.Fatalf("write managed pi root file %s: %v", file.name, err)
		}
	}
	for _, fileName := range append(append([]string{}, managedPiAgentFileNames...), staleManagedPiAgentFileNames...) {
		if err := os.WriteFile(filepath.Join(managedPiAgentsDir, fileName), []byte("managed\n"), 0o644); err != nil {
			t.Fatalf("write managed pi agent file %s: %v", fileName, err)
		}
	}

	originalExecCommand := execCommand
	defer func() {
		execCommand = originalExecCommand
	}()

	type recordedCall struct {
		name string
		args []string
		cmd  *exec.Cmd
	}
	calls := make([]recordedCall, 0, 5)
	execCommand = func(name string, args ...string) *exec.Cmd {
		cmd := exec.Command(os.Args[0], "-test.run=^")
		calls = append(calls, recordedCall{name: name, args: append([]string{}, args...), cmd: cmd})
		return cmd
	}

	if err := RemoveDefaultPiExtensionSetup(); err != nil {
		t.Fatalf("remove default pi extension setup: %v", err)
	}
	if len(calls) != 5 {
		t.Fatalf("expected 5 pi extension uninstall calls, got %d", len(calls))
	}

	expectedArgs := [][]string{{"uninstall", piNotifyExtensionName}, {"uninstall", piSubagentsExtensionName}, {"uninstall", piMemoryExtensionName}, {"uninstall", piWorkspaceExtensionName}, {"uninstall", piAskExtensionName}}
	for index, call := range calls {
		if call.name != "pi" {
			t.Fatalf("expected pi command, got %q", call.name)
		}
		if strings.Join(call.args, "|") != strings.Join(expectedArgs[index], "|") {
			t.Fatalf("expected args %v, got %v", expectedArgs[index], call.args)
		}
	}

	for _, file := range managedPiRootFiles {
		if _, err := os.Stat(filepath.Join(managedPiAgentDir, file.name)); !os.IsNotExist(err) {
			t.Fatalf("expected managed pi root file %s removed, err=%v", file.name, err)
		}
	}
	for _, fileName := range append(append([]string{}, managedPiAgentFileNames...), staleManagedPiAgentFileNames...) {
		if _, err := os.Stat(filepath.Join(managedPiAgentsDir, fileName)); !os.IsNotExist(err) {
			t.Fatalf("expected managed pi agent file %s removed, err=%v", fileName, err)
		}
	}
}
