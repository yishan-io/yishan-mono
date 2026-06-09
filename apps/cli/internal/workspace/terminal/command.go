package terminal

import (
	"runtime"
	"strings"

	"yishan/apps/cli/internal/runtime/shellenv"
)

func resolveCommand(req StartRequest, goos string, shellEnv string) (string, []string) {
	command := strings.TrimSpace(req.Command)
	if command != "" {
		return command, req.Args
	}

	defaultCommand := resolveDefaultCommand(goos, shellEnv)
	if len(req.Args) > 0 {
		return defaultCommand, req.Args
	}

	return defaultCommand, resolveDefaultArgs(defaultCommand, goos)
}

func resolveDefaultCommand(goos string, shellEnv string) string {
	if goos != "windows" {
		resolvedShell := strings.TrimSpace(shellEnv)
		if resolvedShell != "" {
			return resolvedShell
		}
	}

	if goos == "windows" {
		return "cmd.exe"
	}

	if goos == "darwin" {
		return "/bin/zsh"
	}

	return "/bin/bash"
}

func resolveDefaultArgs(command string, goos string) []string {
	if goos == "windows" {
		return nil
	}

	shellName := strings.ToLower(strings.TrimSpace(command))
	if lastSlash := strings.LastIndexAny(shellName, "/\\"); lastSlash >= 0 {
		shellName = shellName[lastSlash+1:]
	}

	switch shellName {
	case "bash":
		if rcfilePath := resolveManagedBashRcfilePath(); rcfilePath != "" {
			return []string{"--rcfile", rcfilePath, "-i"}
		}
		return []string{"--login"}
	case "zsh", "fish":
		return []string{"-l"}
	default:
		return nil
	}
}

func resolveEnv(baseEnv []string, requestEnv []string) []string {
	env := append([]string{}, baseEnv...)
	env = shellenv.UpsertEnv(env, "TERM", shellenv.EnvValueOrDefault(env, "TERM", "xterm-256color"))
	env = shellenv.UpsertEnv(env, "COLORTERM", shellenv.EnvValueOrDefault(env, "COLORTERM", "truecolor"))
	env = shellenv.UpsertEnv(env, "LANG", shellenv.EnvValueOrDefault(env, "LANG", "en_US.UTF-8"))
	env = mergeEnvOverrides(env, requestEnv)
	env = shellenv.ResolveManagedRuntimeEnv(env, resolveDefaultCommand(runtime.GOOS, shellenv.EnvValueOrDefault(env, "SHELL", "")))
	return env
}

func mergeEnvOverrides(env []string, overrides []string) []string {
	for _, entry := range overrides {
		key, value, ok := strings.Cut(entry, "=")
		if !ok || strings.TrimSpace(key) == "" {
			env = append(env, entry)
			continue
		}
		env = shellenv.UpsertEnv(env, key, value)
	}
	return env
}

