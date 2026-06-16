package agentcmd

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/agentkind"
	"yishan/apps/cli/internal/runtime/shellenv"
)

// ErrBinaryNotFound is returned by ResolveCommand/ResolveCommandWithEnv when
// the agent binary cannot be located on the system. Callers should treat this
// as a configuration issue (agent not installed) and skip gracefully.
var ErrBinaryNotFound = errors.New("agent binary not found in PATH")

// Command holds a bare agent CLI invocation: the binary name and its arguments.
// Binary is the unresolved name (e.g. "opencode"). Use ResolveCommand for execution.
type Command struct {
	Binary string
	Args   []string
}

// ResolvedCommand extends Command with a fully resolved binary path and the
// augmented environment required for exec. Always use ResolveCommand when
// executing agent CLIs — never call exec.Command/exec.CommandContext with the
// bare Binary field directly.
type ResolvedCommand struct {
	Command
	// ResolvedBinary is the absolute path to the executable on disk.
	ResolvedBinary string
	// Env is the augmented environment (daemon env + login-shell PATH additions)
	// that must be set on exec.Cmd.Env so the subprocess inherits the full PATH.
	Env []string
}

type runCommandBuilder interface {
	Binary() string
	Args(prompt, model string, interactive bool) []string
}

var commandBuilders = map[string]runCommandBuilder{
	"":               opencodeBuilder{},
	agentkind.OpenCode: opencodeBuilder{},
	agentkind.Claude:   claudeBuilder{},
	agentkind.Codex:    codexBuilder{},
	agentkind.Pi:       piBuilder{},
	agentkind.Gemini:   geminiBuilder{},
	agentkind.Copilot:  copilotBuilder{},
	agentkind.Cursor:   cursorBuilder{},
	"cursor-agent":     cursorBuilder{},
}

// BuildRunCommand builds a Command for the given agent. The Binary field is the
// bare executable name — it is NOT resolved against PATH. Intended for unit tests
// and builder-level checks only. Use ResolveCommand for all execution paths.
func BuildRunCommand(agentKind, prompt, model string, interactive bool) (Command, error) {
	builder, ok := commandBuilders[agentKind]
	if !ok {
		return Command{}, fmt.Errorf("unsupported agent kind: %s", agentKind)
	}

	binary := builder.Binary()
	if binary == "" {
		return Command{}, fmt.Errorf("unsupported agent kind: %s", agentKind)
	}

	return Command{Binary: binary, Args: builder.Args(prompt, model, interactive)}, nil
}

// ResolveCommand builds a Command and resolves the binary to an absolute path
// using the user's full login-shell PATH. The returned ResolvedCommand.Env must
// be set on exec.Cmd.Env so the subprocess inherits the augmented environment.
//
// This is the single gated entry point for all agent CLI execution. If the binary
// cannot be located an error is returned — callers should treat this as a
// configuration issue (agent not installed) and skip gracefully.
func ResolveCommand(agentKind, prompt, model string, interactive bool) (ResolvedCommand, error) {
	resolvedEnv := shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
	return ResolveCommandWithEnv(agentKind, prompt, model, interactive, resolvedEnv)
}

// ResolveCommandWithEnv is the testable variant of ResolveCommand. Callers
// provide the environment slice directly instead of reading os.Environ(); this
// lets tests set a controlled PATH without spawning a login shell.
func ResolveCommandWithEnv(agentKind, prompt, model string, interactive bool, env []string) (ResolvedCommand, error) {
	cmd, err := BuildRunCommand(agentKind, prompt, model, interactive)
	if err != nil {
		return ResolvedCommand{}, err
	}

	binaryPath := cmd.Binary
	if !filepath.IsAbs(binaryPath) {
		if resolved := strings.TrimSpace(shellenv.ResolveExecutablePathFromEnv(binaryPath, env)); resolved != "" {
			binaryPath = resolved
		}
	}

	if !filepath.IsAbs(binaryPath) {
		return ResolvedCommand{}, fmt.Errorf("%w: %s", ErrBinaryNotFound, cmd.Binary)
	}

	return ResolvedCommand{Command: cmd, ResolvedBinary: binaryPath, Env: env}, nil
}
