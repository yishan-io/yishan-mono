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
