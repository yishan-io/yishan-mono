package setup

import (
	"context"
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
	piTaskExtensionName      = "@yishan-io/pi-task"
	piDevFlowExtensionName   = "@yishan-io/pi-dev-flow"
	piWorkspaceExtensionName = "@yishan-io/pi-workspace"
	piAskExtensionName       = "@yishan-io/pi-ask"
	piLspExtensionName       = "@yishan-io/pi-lsp"
)

var (
	// execCommandContext is injectable so tests can stub the pi/skills CLI
	// invocations and assert args + env without running real commands.
	execCommandContext = exec.CommandContext

	defaultPiExtensionNames = []string{
		piNotifyExtensionName,
		piSubagentsExtensionName,
		piMemoryExtensionName,
		piTaskExtensionName,
		piDevFlowExtensionName,
		piWorkspaceExtensionName,
		piAskExtensionName,
		piLspExtensionName,
	}
)

// EnsureDefaultPiExtensions installs every official extension. Setup runs
// outside the RPC request lifecycle, so it uses a background context; the
// RPC-facing mutations receive the caller's context.
func EnsureDefaultPiExtensions() error {
	return installPiExtensions(context.Background(), defaultPiExtensionNames)
}

func RemoveDefaultPiExtensions() error {
	return removePiExtensions(context.Background(), defaultPiExtensionNames)
}

func DefaultPiExtensionNames() []string {
	return append([]string(nil), defaultPiExtensionNames...)
}

func installPiExtensions(ctx context.Context, names []string) error {
	for _, name := range names {
		if err := InstallPiExtension(ctx, piExtensionInstallSource(name)); err != nil {
			return err
		}
	}
	return nil
}

func removePiExtensions(ctx context.Context, names []string) error {
	for _, name := range names {
		// pi uninstall matches by source identity, so the npm: prefix is
		// required — a bare package name never matches (pi reports "No
		// matching package found").
		if err := RemovePiExtension(ctx, piExtensionInstallSource(name)); err != nil {
			return err
		}
	}
	return nil
}

func piExtensionInstallSource(name string) string {
	return "npm:" + name
}

func runPiCommand(ctx context.Context, args ...string) error {
	cmd, err := newPiCommand(ctx, args...)
	if err != nil {
		return err
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pi %s failed: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}

func isManagedPiExtensionInstalled(name string) bool {
	cmd, err := newPiCommand(context.Background(), "package", "list")
	if err != nil {
		return false
	}
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), name)
}

func newPiCommand(ctx context.Context, args ...string) (*exec.Cmd, error) {
	env, err := managedPiEnv()
	if err != nil {
		return nil, err
	}
	cmd := execCommandContext(ctx, "pi", args...)
	cmd.Env = env
	return cmd, nil
}

func managedPiEnv() ([]string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	// Drop any inherited PI_CODING_AGENT_DIR so the managed value wins
	// regardless of how the platform resolves duplicate env keys.
	filtered := os.Environ()[:0:0]
	for _, entry := range os.Environ() {
		if strings.HasPrefix(entry, config.PiAgentDirEnvKey+"=") {
			continue
		}
		filtered = append(filtered, entry)
	}
	return append(filtered, config.PiAgentDirEnvKey+"="+piAgentDir), nil
}
