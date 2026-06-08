package shellenv

import (
	"context"
	"os"
	"os/exec"
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

func EnvValueOrDefault(env []string, key string, fallback string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) && strings.TrimSpace(strings.TrimPrefix(entry, prefix)) != "" {
			return strings.TrimPrefix(entry, prefix)
		}
	}
	return fallback
}

func UpsertEnv(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func PrependPathValue(pathValue string, directory string) string {
	if strings.TrimSpace(directory) == "" {
		return pathValue
	}
	if strings.TrimSpace(pathValue) == "" {
		return directory
	}
	return directory + string(os.PathListSeparator) + pathValue
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

func EnsurePathHasExistingDirectories(env []string, directories []string) []string {
	currentPath := EnvValueOrDefault(env, "PATH", "")
	pathDirs := strings.Split(currentPath, string(os.PathListSeparator))
	pathSet := make(map[string]bool, len(pathDirs))
	for _, d := range pathDirs {
		pathSet[d] = true
	}

	var toAppend []string
	for _, dir := range directories {
		if strings.TrimSpace(dir) == "" || pathSet[dir] {
			continue
		}
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			toAppend = append(toAppend, dir)
			pathSet[dir] = true
		}
	}

	if len(toAppend) == 0 {
		return env
	}

	newPath := strings.Join(append(pathDirs, toAppend...), string(os.PathListSeparator))
	if strings.TrimSpace(currentPath) == "" {
		newPath = strings.Join(toAppend, string(os.PathListSeparator))
	}
	return UpsertEnv(env, "PATH", newPath)
}

func resolveLoginShellPath(shellCommand string) string {
	if sh, err := GetLoginShell(); err == nil {
		if loginPath := sh.Path(); strings.TrimSpace(loginPath) != "" {
			return loginPath
		}
	}
	return readLoginShellPath(shellCommand, loginShellPathTimeout)
}

func ResolveEnvWithUserPath(env []string, shellCommand string) []string {
	pathValues := []string{EnvValueOrDefault(env, "PATH", os.Getenv("PATH"))}

	if runtime.GOOS != "windows" {
		if loginPath := resolveLoginShellPath(shellCommand); strings.TrimSpace(loginPath) != "" {
			pathValues = append(pathValues, loginPath)
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

	pathValue := EnvValueOrDefault(env, "PATH", "")
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

func CommonUserBinDirectories() []string {
	directories := []string{"/opt/homebrew/bin", "/usr/local/bin"}
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return directories
	}

	return append(directories,
		filepath.Join(homeDir, ManagedRuntimeRootDirName, "bin"),
		filepath.Join(homeDir, ".opencode", "bin"),
		filepath.Join(homeDir, ".local", "bin"),
		filepath.Join(homeDir, ".bun", "bin"),
		filepath.Join(homeDir, ".npm-global", "bin"),
		filepath.Join(homeDir, "go", "bin"),
		filepath.Join(homeDir, ".cargo", "bin"),
	)
}

func readLoginShellPath(shellCommand string, timeout time.Duration) string {
	shellPath := ResolveUserShell(shellCommand)
	if strings.TrimSpace(shellPath) == "" {
		return ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	command := exec.CommandContext(ctx, shellPath, "-lic", `printf %s "$PATH"`)
	command.Stdin = nil
	output, err := command.Output()
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(output))
}

func resolveOrigZdotdir(env []string, managedZshDir string, homeDir string) string {
	zdotdir := EnvValueOrDefault(env, "ZDOTDIR", "")
	if zdotdir == "" || zdotdir == managedZshDir {
		return EnvValueOrDefault(env, "HOME", homeDir)
	}
	return zdotdir
}
