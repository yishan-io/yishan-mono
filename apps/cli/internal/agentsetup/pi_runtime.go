package setup

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"yishan/apps/cli/internal/config"
)

const (
	piNotifyPackageName      = "@yishan-io/pi-notify"
	piNotifyInstallSource    = "npm:@yishan-io/pi-notify"
	piSubagentsPackageName   = "@yishan-io/pi-subagents"
	piSubagentsInstallSource = "npm:@yishan-io/pi-subagents"
)

var execCommand = exec.Command

func ensureManagedPiPackages() error {
	for _, pkg := range []string{piNotifyInstallSource, piSubagentsInstallSource} {
		if err := installPiPackage(pkg); err != nil {
			return err
		}
	}
	return nil
}

func removeManagedPiPackages() error {
	for _, pkg := range []string{piNotifyPackageName, piSubagentsPackageName} {
		if err := removePiPackage(pkg); err != nil {
			return err
		}
	}
	return nil
}

func installPiPackage(source string) error {
	return runPiCommand("install", source)
}

func removePiPackage(name string) error {
	return runPiCommand("uninstall", name)
}

func runPiCommand(args ...string) error {
	cmd, err := newPiCommand(args...)
	if err != nil {
		return err
	}
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Run()
}

func isManagedPiPackageInstalled(name string) bool {
	cmd, err := newPiCommand("package", "list")
	if err != nil {
		return false
	}
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), name)
}

func newPiCommand(args ...string) (*exec.Cmd, error) {
	env, err := managedPiEnv()
	if err != nil {
		return nil, err
	}
	cmd := execCommand("pi", args...)
	cmd.Env = env
	return cmd, nil
}

func managedPiEnv() ([]string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	return append(os.Environ(), config.PiAgentDirEnvKey+"="+piAgentDir), nil
}
