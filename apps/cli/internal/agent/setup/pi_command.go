package setup

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"yishan/apps/cli/internal/platform/config"
	"yishan/apps/cli/internal/platform/shellenv"
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
// stats only the literal name and misses shim variants (pi.exe, npx.cmd), so
// the fallback probes the supplied managed environment rather than daemon PATH.
func resolveManagedBinary(binary string, env []string) string {
	path := shellenv.ResolveExecutablePathFromEnv(binary, env)
	if path != "" || runtime.GOOS != "windows" {
		return path
	}
	return resolveManagedWindowsBinary(binary, env)
}

func resolveManagedWindowsBinary(binary string, env []string) string {
	pathValue := shellenv.EnvValueOrDefault(env, "PATH", "")
	pathExtensions := shellenv.EnvValueOrDefault(env, "PATHEXT", ".COM;.EXE;.BAT;.CMD")
	return resolveManagedWindowsBinaryInPath(binary, pathValue, pathExtensions, string(os.PathListSeparator), isManagedBinaryFile)
}

func isManagedBinaryFile(candidate string) bool {
	info, err := os.Stat(candidate)
	return err == nil && !info.IsDir()
}

func resolveManagedWindowsBinaryInPath(binary, pathValue, pathExtensions, pathSeparator string, isFile func(string) bool) string {
	for _, candidate := range managedWindowsBinaryCandidates(binary, pathValue, pathExtensions, pathSeparator) {
		if isFile(candidate) {
			return candidate
		}
	}
	return ""
}

func managedWindowsBinaryCandidates(binary, pathValue, pathExtensions, pathSeparator string) []string {
	candidates := make([]string, 0)
	for directory := range strings.SplitSeq(pathValue, pathSeparator) {
		directory = strings.TrimSpace(directory)
		if directory == "" {
			continue
		}
		for extension := range strings.SplitSeq(pathExtensions, ";") {
			extension = strings.TrimSpace(extension)
			if extension != "" {
				candidates = append(candidates, filepath.Join(directory, binary+extension))
			}
		}
	}
	return candidates
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
