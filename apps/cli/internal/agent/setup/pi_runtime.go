package setup

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"yishan/apps/cli/internal/config"
	"yishan/apps/cli/internal/runtime/shellenv"
)

var (
	// execCommandContext is injectable so tests can stub the pi/skills CLI
	// invocations and assert args + env without running real commands.
	execCommandContext = exec.CommandContext

	// managedPiEnvBase returns the daemon environment the managed pi env is
	// derived from: the login-shell env merged with the daemon's own env, then
	// PATH-enriched (same as agentmanager when launching pi sessions) so pi and
	// npm are findable even when the daemon was launched from a GUI context
	// with a minimal PATH. It is a var so tests can substitute a controlled
	// environment without spawning a login shell.
	managedPiEnvBase = func() []string {
		base := shellenv.MergeLoginShellEnv(os.Environ())
		return shellenv.ResolveEnvWithUserPath(base, os.Getenv("SHELL"))
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

// isManagedPiExtensionInstalled reports whether a default extension is
// installed, using the same rule as the catalog (the package.json presence in
// the managed install dirs). The reconcile state reuses this single
// installed-state rule instead of owning a second discovery check.
func isManagedPiExtensionInstalled(name string) bool {
	return isExtensionPackageInstalled(name, piExtensionInstallSource(name))
}

func newPiCommand(ctx context.Context, args ...string) (*exec.Cmd, error) {
	env, err := managedPiEnv()
	if err != nil {
		return nil, err
	}
	// Resolve pi against the env's PATH before exec. exec.Command resolves a
	// bare name against the current process's own PATH (Go 1.19+ caches the
	// LookPath result in Cmd.Err at construction time), and GUI-launched
	// daemons run with a minimal PATH — without the explicit resolution the
	// extension install/update/remove commands fail with "executable file not
	// found in $PATH".
	piPath := resolveManagedBinary("pi", env)
	if piPath == "" {
		return nil, fmt.Errorf("pi executable not found in resolved PATH")
	}
	cmd := execCommandContext(ctx, piPath, args...)
	cmd.Env = env
	return cmd, nil
}

// resolveManagedBinary resolves one executable (pi, npx, ...) against the
// env's PATH, with a Windows PATHEXT fallback: ResolveExecutablePathFromEnv
// stats only the literal name and misses shim variants (pi.exe, npx.cmd),
// while exec.LookPath probes PATHEXT against the process PATH.
func resolveManagedBinary(binary string, env []string) string {
	path := shellenv.ResolveExecutablePathFromEnv(binary, env)
	if path == "" && runtime.GOOS == "windows" {
		if resolved, err := exec.LookPath(binary); err == nil {
			path = resolved
		}
	}
	return path
}

func managedPiEnv() ([]string, error) {
	piAgentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi agent dir: %w", err)
	}
	base := managedPiEnvBase()
	// Drop any inherited PI_CODING_AGENT_DIR so the managed value wins
	// regardless of how the platform resolves duplicate env keys.
	filtered := base[:0:0]
	for _, entry := range base {
		if strings.HasPrefix(entry, config.PiAgentDirEnvKey+"=") {
			continue
		}
		filtered = append(filtered, entry)
	}
	return append(filtered, config.PiAgentDirEnvKey+"="+piAgentDir), nil
}
