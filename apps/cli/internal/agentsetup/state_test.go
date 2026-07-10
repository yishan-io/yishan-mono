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

func TestIsPiNotifyInstalledUsesManagedPiAgentDir(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("GO_WANT_PI_PACKAGE_LIST_HELPER", "1")
	t.Setenv("TEST_PI_PACKAGE_OUTPUT", piNotifyPackageName+"\n"+piSubagentsPackageName)

	originalExecCommand := execCommand
	defer func() {
		execCommand = originalExecCommand
	}()

	var capturedName string
	var capturedArgs []string
	var capturedCmd *exec.Cmd
	execCommand = func(name string, args ...string) *exec.Cmd {
		capturedName = name
		capturedArgs = append([]string{}, args...)
		capturedCmd = exec.Command(os.Args[0], "-test.run=TestPiPackageListHelperProcess")
		return capturedCmd
	}

	if !isPiNotifyInstalled() {
		t.Fatal("expected pi notify package to be detected")
	}
	if capturedName != "pi" {
		t.Fatalf("expected pi command, got %q", capturedName)
	}
	if strings.Join(capturedArgs, "|") != "package|list" {
		t.Fatalf("expected package list args, got %v", capturedArgs)
	}

	expectedAgentDir := filepath.Join(homeDir, ".yishan", "pi", "agent")
	if !strings.Contains(strings.Join(capturedCmd.Env, "\n"), config.PiAgentDirEnvKey+"="+expectedAgentDir) {
		t.Fatalf("expected managed pi env in %v", capturedCmd.Env)
	}
}

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

func TestPiPackageListHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_PI_PACKAGE_LIST_HELPER") != "1" {
		return
	}
	_, _ = fmt.Fprint(os.Stdout, os.Getenv("TEST_PI_PACKAGE_OUTPUT"))
	os.Exit(0)
}
