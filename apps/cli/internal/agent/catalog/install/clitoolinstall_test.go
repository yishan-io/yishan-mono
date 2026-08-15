package install

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRegistryGet(t *testing.T) {
	t.Parallel()

	registry := NewRegistry(PiInstaller{}, YishanInstaller{})
	if installer, ok := registry.Get(PiToolID); !ok || installer.ToolID() != PiToolID {
		t.Fatalf("expected pi installer to be registered")
	}
	if installer, ok := registry.Get(YishanToolID); !ok || installer.ToolID() != YishanToolID {
		t.Fatalf("expected yishan installer to be registered")
	}
	if _, ok := registry.Get("unknown-tool"); ok {
		t.Fatalf("expected unknown tool to be missing")
	}
}

func TestRegistryToolIDsSorted(t *testing.T) {
	t.Parallel()

	registry := NewRegistry(YishanInstaller{}, PiInstaller{})
	got := registry.ToolIDs()
	want := []string{PiToolID, YishanToolID}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("expected %v, got %v", want, got)
		}
	}
}

func TestPiInstallerUninstallUnsupported(t *testing.T) {
	t.Parallel()

	installer := PiInstaller{}
	if installer.SupportsUninstall() {
		t.Fatalf("expected pi uninstall to be unsupported")
	}
	if err := installer.Uninstall(context.Background()); !errors.Is(err, ErrUnsupportedUninstall) {
		t.Fatalf("expected ErrUnsupportedUninstall, got %v", err)
	}
}

func TestYishanInstallCreatesManagedSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test targets unix-style symlinks and HOME-based install paths")
	}

	home := t.TempDir()
	t.Setenv("HOME", home)

	installer := YishanInstaller{}
	installPath := yishanInstallPath()

	if err := installer.Install(context.Background()); err != nil {
		t.Fatalf("install yishan: %v", err)
	}

	linkTarget, err := os.Readlink(installPath)
	if err != nil {
		t.Fatalf("readlink install path: %v", err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve executable: %v", err)
	}
	if resolveSymlinkTarget(installPath, linkTarget) != executable {
		t.Fatalf("expected symlink target %s, got %s", executable, resolveSymlinkTarget(installPath, linkTarget))
	}

	status := CurrentYishanInstallStatus()
	if !status.IsManagedInstall {
		t.Fatalf("expected managed install to be reported after install")
	}

	if err := installer.Uninstall(context.Background()); err != nil {
		t.Fatalf("uninstall yishan: %v", err)
	}
	if _, err := os.Lstat(installPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected install path removed, lstat error: %v", err)
	}
}

func TestYishanInstallRefusesToOverwriteRegularFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test targets unix-style symlinks and HOME-based install paths")
	}

	home := t.TempDir()
	t.Setenv("HOME", home)

	installPath := yishanInstallPath()
	if err := os.MkdirAll(filepath.Dir(installPath), 0o755); err != nil {
		t.Fatalf("mkdir bin dir: %v", err)
	}
	if err := os.WriteFile(installPath, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write existing binary: %v", err)
	}

	err := (YishanInstaller{}).Install(context.Background())
	if err == nil || !strings.Contains(err.Error(), "refusing to overwrite") {
		t.Fatalf("expected refuse-to-overwrite error, got %v", err)
	}
}

func TestYishanInstallStatusNotManagedForForeignSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test targets unix-style symlinks and HOME-based install paths")
	}

	home := t.TempDir()
	t.Setenv("HOME", home)

	installPath := yishanInstallPath()
	if err := os.MkdirAll(filepath.Dir(installPath), 0o755); err != nil {
		t.Fatalf("mkdir bin dir: %v", err)
	}
	foreign := filepath.Join(t.TempDir(), "other-binary")
	if err := os.WriteFile(foreign, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write foreign binary: %v", err)
	}
	if err := os.Symlink(foreign, installPath); err != nil {
		t.Fatalf("symlink foreign binary: %v", err)
	}

	status := CurrentYishanInstallStatus()
	if status.IsManagedInstall {
		t.Fatalf("expected foreign symlink to not be managed")
	}
	if !status.IsAvailableInPath {
		t.Fatalf("expected foreign symlink to count as available")
	}
}
