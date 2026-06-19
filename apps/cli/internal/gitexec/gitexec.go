package gitexec

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"sync"

	"yishan/apps/cli/internal/runtime/shellenv"
)

type Runner struct {
	path string
	env  []string
}

var (
	defaultRunnerOnce sync.Once
	defaultRunner     Runner
)

func New(baseEnv []string, shell string) Runner {
	env := shellenv.ResolveEnvWithUserPath(baseEnv, shell)
	path := shellenv.ResolveExecutablePathFromEnv("git", env)
	return Runner{path: path, env: env}
}

func (r Runner) Available() bool {
	return strings.TrimSpace(r.path) != ""
}

func (r Runner) Command(args ...string) (*exec.Cmd, bool) {
	if !r.Available() {
		return nil, false
	}
	command := exec.Command(r.path, args...)
	command.Env = r.env
	return command, true
}

func (r Runner) CommandContext(ctx context.Context, args ...string) (*exec.Cmd, bool) {
	if !r.Available() {
		return nil, false
	}
	command := exec.CommandContext(ctx, r.path, args...)
	command.Env = r.env
	return command, true
}

func DefaultRunner() Runner {
	defaultRunnerOnce.Do(func() {
		defaultRunner = New(os.Environ(), os.Getenv("SHELL"))
	})
	return defaultRunner
}

func (r Runner) Run(ctx context.Context, cwd string, args ...string) ([]byte, error, bool) {
	command, ok := r.CommandContext(ctx, append([]string{"-C", cwd}, args...)...)
	if !ok {
		return nil, nil, false
	}
	output, err := command.Output()
	return output, err, true
}

func (r Runner) RunCombined(ctx context.Context, cwd string, args ...string) ([]byte, error, bool) {
	command, ok := r.CommandContext(ctx, append([]string{"-C", cwd}, args...)...)
	if !ok {
		return nil, nil, false
	}
	output, err := command.CombinedOutput()
	return output, err, true
}

func SplitNonEmptyLines(input string) []string {
	out := make([]string, 0)
	for line := range strings.SplitSeq(input, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}

func CoalesceNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}
