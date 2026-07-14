package setup

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"yishan/apps/cli/internal/config"
)

const (
	piNotifyExtensionName    = "@yishan-io/pi-notify"
	piSubagentsExtensionName = "@yishan-io/pi-subagents"
	piMemoryExtensionName    = "@yishan-io/pi-memory"
	piWorkspaceExtensionName = "@yishan-io/pi-workspace"
)

var (
	execCommand = exec.Command

	defaultPiExtensionNames = []string{
		piNotifyExtensionName,
		piSubagentsExtensionName,
		piMemoryExtensionName,
		piWorkspaceExtensionName,
	}
)

func EnsureDefaultPiExtensions() error {
	return installPiExtensions(defaultPiExtensionNames)
}

func RemoveDefaultPiExtensions() error {
	return removePiExtensions(defaultPiExtensionNames)
}

func DefaultPiExtensionNames() []string {
	return append([]string(nil), defaultPiExtensionNames...)
}

func installPiExtensions(names []string) error {
	for _, name := range names {
		if err := installPiExtension(name); err != nil {
			return err
		}
	}
	return nil
}

func removePiExtensions(names []string) error {
	for _, name := range names {
		if err := removePiExtension(name); err != nil {
			return err
		}
	}
	return nil
}

func installPiExtension(name string) error {
	return runPiCommand("install", piExtensionInstallSource(name))
}

func piExtensionInstallSource(name string) string {
	return "npm:" + name
}

func removePiExtension(name string) error {
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

func isManagedPiExtensionInstalled(name string) bool {
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
