package plugins

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const pluginLockHelperEnv = "YISHAN_PLUGIN_LOCK_HELPER"

func TestPluginLock_CanonicalRootExcludesOtherProcesses(t *testing.T) {
	physicalRoot := t.TempDir()
	root := filepath.Join(filepath.Dir(physicalRoot), "plugin-root-link")
	if err := os.Symlink(physicalRoot, root); err != nil {
		t.Skipf("create root symlink: %v", err)
	}
	release := startPluginLockHolder(t, physicalRoot)
	lockContext, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := LoadOrCreateSigningKey(lockContext, root); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("load signing key error = %v, want context deadline", err)
	}
	release()
	key, err := LoadOrCreateSigningKey(context.Background(), root)
	if err != nil {
		t.Fatalf("load signing key after release: %v", err)
	}
	assertSnapshotPromotionWaitsForPluginLock(t, root, key, startPluginLockHolder(t, physicalRoot))
}

func TestPluginLockProcessHelper(t *testing.T) {
	if os.Getenv(pluginLockHelperEnv) != "1" {
		return
	}
	root := os.Getenv("YISHAN_PLUGIN_LOCK_ROOT")
	lock, err := waitForPluginLock(context.Background(), root)
	if err != nil {
		os.Exit(1)
	}
	defer lock.Release()
	ready := os.Getenv("YISHAN_PLUGIN_LOCK_READY")
	if err := os.WriteFile(ready, nil, 0o600); err != nil {
		os.Exit(1)
	}
	waitForPluginLockRelease(os.Getenv("YISHAN_PLUGIN_LOCK_RELEASE"))
}

func startPluginLockHolder(t *testing.T, root string) func() {
	t.Helper()
	release := filepath.Join(t.TempDir(), "release")
	ready := filepath.Join(filepath.Dir(release), "ready")
	command := exec.Command(os.Args[0], "-test.run=^TestPluginLockProcessHelper$")
	command.Env = append(os.Environ(), pluginLockHelperEnv+"=1", "YISHAN_PLUGIN_LOCK_ROOT="+root,
		"YISHAN_PLUGIN_LOCK_READY="+ready, "YISHAN_PLUGIN_LOCK_RELEASE="+release)
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = command.Process.Kill() }) // Best-effort cleanup releases the process lock.
	waitForPluginLockReady(t, ready)
	return func() {
		if err := os.WriteFile(release, nil, 0o600); err != nil {
			t.Error(err)
			return
		}
		if err := command.Wait(); err != nil {
			t.Error(err)
		}
	}
}

func waitForPluginLockReady(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("plugin lock holder did not become ready")
}

func waitForPluginLockRelease(path string) {
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(time.Millisecond)
	}
}

func assertSnapshotPromotionWaitsForPluginLock(t *testing.T, root string, key []byte, release func()) {
	t.Helper()
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	bundle := approvedBundle(archive)
	installer, err := NewInstaller(root, key, []ApprovedBundle{{Name: bundle.Name, Version: bundle.Version, Integrity: bundle.Integrity, Adaptation: testAdaptation()}}, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	lockContext, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err = installer.Install(lockContext, Request{Name: "safe-plugin", Version: "1.0.0"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("install while locked = %v, want context deadline", err)
	}
	if _, statErr := os.Stat(filepath.Join(root, currentSnapshotName)); !os.IsNotExist(statErr) {
		t.Fatalf("snapshot promoted while lock was held: %v", statErr)
	}
	release()
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatalf("install after lock release: %v", err)
	}
}
