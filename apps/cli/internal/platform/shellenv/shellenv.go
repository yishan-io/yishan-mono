package shellenv

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const ManagedRuntimeRootDirName = ".yishan"
const ManagedRuntimeOrigZdotdirEnvKey = "YISHAN_ORIG_ZDOTDIR"
const loginShellPathTimeout = 10 * time.Second

func ResolveUserShell(shellEnv string) string {
	if resolved := strings.TrimSpace(shellEnv); resolved != "" {
		return resolved
	}

	if runtime.GOOS == "windows" {
		return "cmd.exe"
	}

	if runtime.GOOS == "darwin" {
		return "/bin/zsh"
	}

	for _, candidate := range []string{"/bin/bash", "/bin/sh"} {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}

	return "/bin/sh"
}

func ResolveManagedRuntimeEnv(baseEnv []string, command string) []string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return baseEnv
	}
	managedRootDir := filepath.Join(homeDir, ManagedRuntimeRootDirName)
	managedBinDir := filepath.Join(managedRootDir, "bin")
	env := UpsertEnv(baseEnv, "PATH", PrependPathValue(EnvValueOrDefault(baseEnv, "PATH", os.Getenv("PATH")), managedBinDir))

	if filepath.Base(strings.TrimSpace(command)) == "zsh" {
		managedZshDir := filepath.Join(managedRootDir, "shell", "zsh")
		origZdotdir := resolveOrigZdotdir(env, managedZshDir, homeDir)
		env = UpsertEnv(env, ManagedRuntimeOrigZdotdirEnvKey, origZdotdir)
		env = UpsertEnv(env, "ZDOTDIR", managedZshDir)
	}
	return env
}

func ResolveEnvWithUserPath(env []string, shellCommand string) []string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = ""
	}

	pathValues := []string{normalizePathValue(EnvValueOrDefault(env, "PATH", os.Getenv("PATH")), homeDir)}

	if runtime.GOOS != "windows" {
		if loginPath := resolveLoginShellPath(shellCommand); strings.TrimSpace(loginPath) != "" {
			pathValues = append(pathValues, normalizePathValue(loginPath, homeDir))
		}
	}

	mergedPath := strings.Join(pathValues, string(os.PathListSeparator))
	withMergedPath := UpsertEnv(env, "PATH", mergedPath)
	return EnsurePathHasExistingDirectories(withMergedPath, CommonUserBinDirectories())
}

func ResolveExecutablePathFromEnv(command string, env []string) string {
	commandName := strings.TrimSpace(command)
	if commandName == "" {
		return ""
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = ""
	}

	pathValue := normalizePathValue(EnvValueOrDefault(env, "PATH", ""), homeDir)
	if strings.TrimSpace(pathValue) == "" {
		return ""
	}

	for segment := range strings.SplitSeq(pathValue, string(os.PathListSeparator)) {
		dir := strings.TrimSpace(segment)
		if dir == "" {
			continue
		}

		candidate := filepath.Join(dir, commandName)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			if runtime.GOOS == "windows" || info.Mode().Perm()&0o111 != 0 {
				return candidate
			}
		}
	}

	return ""
}

func resolveLoginShellPath(shellCommand string) string {
	if sh, err := GetLoginShell(); err == nil {
		if loginPath := sh.Path(); strings.TrimSpace(loginPath) != "" {
			return loginPath
		}
	}
	return readLoginShellPath(shellCommand, loginShellPathTimeout)
}

func resolveOrigZdotdir(env []string, managedZshDir string, homeDir string) string {
	zdotdir := EnvValueOrDefault(env, "ZDOTDIR", "")
	if zdotdir == "" || zdotdir == managedZshDir {
		return EnvValueOrDefault(env, "HOME", homeDir)
	}
	return zdotdir
}

// mergeEnvs returns a new env slice starting from base with override entries
// upserted on top. Values in override take precedence over base on conflict.
// Entries in override that contain no '=' are silently skipped.
func mergeEnvs(base, override []string) []string {
	merged := make([]string, len(base))
	copy(merged, base)
	for _, kv := range override {
		k, v, found := strings.Cut(kv, "=")
		if !found {
			continue
		}
		merged = UpsertEnv(merged, k, v)
	}
	return merged
}

// MergeLoginShellEnv merges the login shell's full environment with daemonEnv,
// returning a combined slice where daemonEnv values take precedence. This
// ensures provider credentials exported in shell profiles (e.g. AWS_* for
// Amazon Bedrock) are available to subprocesses even when the daemon was
// launched from a GUI context with a minimal environment.
// On error or when the login shell env is empty, daemonEnv is returned as a
// fresh copy so the caller can safely mutate the result.
func MergeLoginShellEnv(daemonEnv []string) []string {
	sh, err := GetLoginShell()
	if err != nil {
		return append([]string(nil), daemonEnv...)
	}
	shellEnv := sh.FullEnv()
	if len(shellEnv) == 0 {
		return append([]string(nil), daemonEnv...)
	}
	return mergeEnvs(shellEnv, daemonEnv)
}
