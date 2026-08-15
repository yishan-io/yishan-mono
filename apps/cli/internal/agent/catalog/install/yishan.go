package install

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// YishanToolID is the tool ID of the yishan CLI (the daemon binary itself).
const YishanToolID = "yishan"

// YishanInstallStatus describes the yishan CLI availability on this node.
type YishanInstallStatus struct {
	IsAvailableInPath bool
	ResolvedPath      string
	IsManagedInstall  bool
}

// YishanInstaller symlinks the running daemon binary into a user bin dir so
// the yishan CLI is usable from terminals, shells, and remote SSH sessions.
type YishanInstaller struct{}

// ToolID returns the stable tool identifier "yishan".
func (YishanInstaller) ToolID() string { return YishanToolID }

// Install symlinks the running daemon binary into the managed install path.
func (YishanInstaller) Install(ctx context.Context) error {
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve current binary: %w", err)
	}
	if runtime.GOOS == "windows" {
		return errors.New("daemon-assisted yishan install is not supported on Windows yet")
	}

	installPath := yishanInstallPath()
	if err := os.MkdirAll(filepath.Dir(installPath), 0o755); err != nil {
		return fmt.Errorf("create bin dir: %w", err)
	}
	if info, err := os.Lstat(installPath); err == nil {
		if info.Mode()&os.ModeSymlink == 0 {
			return fmt.Errorf("refusing to overwrite existing file %s", installPath)
		}
		if err := os.Remove(installPath); err != nil {
			return fmt.Errorf("remove existing install: %w", err)
		}
	}
	if err := os.Symlink(executable, installPath); err != nil {
		return fmt.Errorf("symlink %s: %w", installPath, err)
	}
	return nil
}

// Uninstall removes the managed symlink when it points at the running binary.
// Independent installs are left untouched.
func (YishanInstaller) Uninstall(ctx context.Context) error {
	if runtime.GOOS == "windows" {
		return errors.New("daemon-assisted yishan uninstall is not supported on Windows yet")
	}
	installPath := yishanInstallPath()
	if err := os.Remove(installPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove managed install: %w", err)
	}
	return nil
}

// SupportsUninstall reports that the managed symlink can be removed.
func (YishanInstaller) SupportsUninstall() bool { return true }

// YishanInstallStatus reports whether yishan is on PATH and whether the
// managed install symlink currently points at the running daemon binary.
func CurrentYishanInstallStatus() YishanInstallStatus {
	installPath := yishanInstallPath()
	executable, execErr := os.Executable()

	resolvedPath := yishanResolvedInPath()
	installPathExecutable := isRegularFile(installPath)
	isManaged := false
	if runtime.GOOS != "windows" {
		if linkTarget, err := os.Readlink(installPath); err == nil {
			isManaged = execErr == nil && resolveSymlinkTarget(installPath, linkTarget) == executable
		}
	} else {
		// Install/uninstall are unsupported on Windows, so a managed install
		// can never be reported there.
		isManaged = false
	}

	isAvailableInPath := resolvedPath != "" || installPathExecutable
	effectiveResolvedPath := resolvedPath
	if effectiveResolvedPath == "" && installPathExecutable {
		effectiveResolvedPath = installPath
	}

	return YishanInstallStatus{
		IsAvailableInPath: isAvailableInPath,
		ResolvedPath:      effectiveResolvedPath,
		IsManagedInstall:  isManaged,
	}
}

// yishanInstallPath returns the managed install path for the current platform.
func yishanInstallPath() string {
	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
		}
		return filepath.Join(localAppData, "Yishan", "bin", "yishan.exe")
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	return filepath.Join(homeDir, ".local", "bin", "yishan")
}

// yishanResolvedInPath resolves the first yishan entry on PATH, if any.
func yishanResolvedInPath() string {
	binaryName := "yishan"
	if runtime.GOOS == "windows" {
		binaryName = "yishan.exe"
	}
	pathValue := os.Getenv("PATH")
	for segment := range strings.SplitSeq(pathValue, string(os.PathListSeparator)) {
		if segment == "" {
			continue
		}
		candidate := filepath.Join(segment, binaryName)
		if isRegularFile(candidate) {
			return candidate
		}
	}
	return ""
}

// resolveSymlinkTarget normalizes a symlink target relative to the link dir.
func resolveSymlinkTarget(linkPath string, target string) string {
	if filepath.IsAbs(target) {
		return filepath.Clean(target)
	}
	return filepath.Clean(filepath.Join(filepath.Dir(linkPath), target))
}

// isRegularFile returns true when path exists and is not a directory.
func isRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
