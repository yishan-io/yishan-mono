package setup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"yishan/apps/cli/internal/config"
)

func TestGetInstalledStateIncludesManagedPiSkillDir(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	if _, err := AddSkill(StartingTaskSkillName); err != nil {
		t.Fatalf("add skill: %v", err)
	}
	state, err := GetInstalledState()
	if err != nil {
		t.Fatalf("get installed state: %v", err)
	}

	expectedPiSkillPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", StartingTaskSkillName, "SKILL.md")
	if !strings.Contains(state.Skill.SkillPath, expectedPiSkillPath) {
		t.Fatalf("expected managed pi skill path to contain %s, got %s", expectedPiSkillPath, state.Skill.SkillPath)
	}
}

func TestGetInstalledStateIncludesDefaultPiExtensions(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("GO_WANT_PI_EXTENSION_LIST_HELPER", "1")
	t.Setenv("TEST_PI_EXTENSION_OUTPUT", strings.Join(DefaultPiExtensionNames(), "\n"))

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
	for _, fileName := range managedPiAgentFileNames {
		if err := os.WriteFile(filepath.Join(managedPiAgentsDir, fileName), []byte("managed\n"), 0o644); err != nil {
			t.Fatalf("write managed pi agent file %s: %v", fileName, err)
		}
	}

	originalExecCommand := execCommand
	defer func() {
		execCommand = originalExecCommand
	}()
	var capturedCmd *exec.Cmd
	execCommand = func(name string, args ...string) *exec.Cmd {
		capturedCmd = exec.Command(os.Args[0], "-test.run=TestPiExtensionListHelperProcess")
		return capturedCmd
	}

	state, err := GetInstalledState()
	if err != nil {
		t.Fatalf("get installed state: %v", err)
	}
	if !state.Extension.Installed {
		t.Fatal("expected default pi extensions to be installed")
	}
	if strings.Join(state.Extension.Extensions, "|") != strings.Join(DefaultPiExtensionNames(), "|") {
		t.Fatalf("expected default pi extensions %v, got %v", DefaultPiExtensionNames(), state.Extension.Extensions)
	}

	expectedAgentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	if !strings.Contains(strings.Join(capturedCmd.Env, "\n"), config.PiAgentDirEnvKey+"="+expectedAgentDir) {
		t.Fatalf("expected managed pi env in %v", capturedCmd.Env)
	}
}

func TestPiExtensionListHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_PI_EXTENSION_LIST_HELPER") != "1" {
		return
	}
	_, _ = fmt.Fprint(os.Stdout, os.Getenv("TEST_PI_EXTENSION_OUTPUT"))
	os.Exit(0)
}
