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
	env = upsertEnv(env, "TERM", envValueOrDefault(env, "TERM", "xterm-256color"))
	env = upsertEnv(env, "COLORTERM", envValueOrDefault(env, "COLORTERM", "truecolor"))
	env = upsertEnv(env, "LANG", envValueOrDefault(env, "LANG", "en_US.UTF-8"))
	env = mergeEnvOverrides(env, requestEnv)
	env = resolveManagedRuntimeEnv(env, resolveDefaultCommand(runtime.GOOS, envValueOrDefault(env, "SHELL", "")))
	return env
}

func mergeEnvOverrides(env []string, overrides []string) []string {
	for _, entry := range overrides {
		key, value, ok := strings.Cut(entry, "=")
		if !ok || strings.TrimSpace(key) == "" {
			env = append(env, entry)
			continue
		}
		env = upsertEnv(env, key, value)
	}
	return env
}

func envValueOrDefault(env []string, key string, fallback string) string {
	return shellenv.EnvValueOrDefault(env, key, fallback)
}

func upsertEnv(env []string, key string, value string) []string {
	return shellenv.UpsertEnv(env, key, value)
}
