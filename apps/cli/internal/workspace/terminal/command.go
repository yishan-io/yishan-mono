package terminal

import "strings"

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
	env = append(env, requestEnv...)
	return env
}

func envValueOrDefault(env []string, key string, fallback string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) && strings.TrimSpace(strings.TrimPrefix(entry, prefix)) != "" {
			return strings.TrimPrefix(entry, prefix)
		}
	}
	return fallback
}

func upsertEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}
