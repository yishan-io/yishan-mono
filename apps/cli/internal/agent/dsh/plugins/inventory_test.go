package plugins

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallerVerifyInstalledInventory_RejectsUnexpectedTopLevelDirectory(t *testing.T) {
	installer, root, inventory := installInventoryFixture(t, "safe-plugin")
	if err := os.Mkdir(filepath.Join(currentPluginPath(t, root), "unexpected"), 0o755); err != nil {
		t.Fatal(err)
	}
	assertInventoryIsNotCopied(t, installer, root, inventory)
}

func TestInstallerVerifyInstalledInventory_RejectsUnexpectedTopLevelSymlink(t *testing.T) {
	installer, root, inventory := installInventoryFixture(t, "safe-plugin")
	if err := os.Symlink("safe-plugin", filepath.Join(currentPluginPath(t, root), "unexpected")); err != nil {
		t.Skipf("create symlink: %v", err)
	}
	assertInventoryIsNotCopied(t, installer, root, inventory)
}

func TestInstallerVerifyInstalledInventory_AllowsExpectedScopedPackageParent(t *testing.T) {
	installer, root, inventory := installInventoryFixture(t, "@scope/safe-plugin")
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify scoped package: %v", err)
	}
	if err := os.Mkdir(filepath.Join(currentPluginPath(t, root), "@scope", "unexpected"), 0o755); err != nil {
		t.Fatal(err)
	}
	assertInventoryIsNotCopied(t, installer, root, inventory)
}

func installInventoryFixture(t *testing.T, name string) (*Installer, string, Inventory) {
	t.Helper()
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	bundle := approvedBundle(archive)
	bundle.Name = name
	root := t.TempDir()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	installer, err := NewInstaller(root, key, []ApprovedBundle{{Name: name, Version: bundle.Version, Integrity: bundle.Integrity, Entries: testEntries()}}, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	inventory, err := installer.Install(context.Background(), Request{Name: name, Version: bundle.Version})
	if err != nil {
		t.Fatal(err)
	}
	return installer, root, inventory
}

func assertInventoryIsNotCopied(t *testing.T, installer *Installer, root string, inventory Inventory) {
	t.Helper()
	if _, err := installer.VerifyInstalledInventory(); !errors.Is(err, ErrInventoryTampered) {
		t.Fatalf("verify error = %v, want tamper rejection", err)
	}
	destination := filepath.Join(t.TempDir(), "plugins")
	if err := copyExistingPlugins(currentSnapshotPath(t, root), destination, inventory); !errors.Is(err, ErrInventoryTampered) {
		t.Fatalf("copy error = %v, want tamper rejection", err)
	}
	if _, err := os.Lstat(destination); !os.IsNotExist(err) {
		t.Fatalf("unexpected plugins were copied: %v", err)
	}
}

func TestInstallerSetEnabled_UpdatesSignedInventoryWithoutChangingPluginTree(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	installer := newTestInstaller(t, t.TempDir(), approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	inventory, err := installer.SetEnabled(context.Background(), "safe-plugin", false)
	if err != nil {
		t.Fatalf("disable: %v", err)
	}
	if len(inventory.Plugins) != 1 || inventory.Plugins[0].Enabled {
		t.Fatalf("inventory = %#v, want disabled plugin", inventory)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify disabled inventory: %v", err)
	}
}

func TestInstallerRemove_AtomicallyRemovesBundleFromSignedInventory(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	inventory, err := installer.Remove(context.Background(), "safe-plugin")
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if len(inventory.Plugins) != 0 {
		t.Fatalf("inventory = %#v, want no plugins", inventory)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify removed inventory: %v", err)
	}
}

func TestInstallerRemove_PrunesEmptyScopedParentAndPreservesScopedSibling(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	const version = "1.0.0"
	first := Bundle{Name: "@scope/first", Version: version, TarballURL: "https://example.test/first", Integrity: integrity(archive)}
	second := Bundle{Name: "@scope/second", Version: version, TarballURL: "https://example.test/second", Integrity: integrity(archive)}
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	installer, err := NewInstaller(root, key, []ApprovedBundle{
		{Name: first.Name, Version: first.Version, Integrity: first.Integrity, Entries: testEntries()},
		{Name: second.Name, Version: second.Version, Integrity: second.Integrity, Entries: testEntries()},
	}, bundleRegistry{bundles: map[string]Bundle{first.Name: first, second.Name: second}}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	for _, bundle := range []Bundle{first, second} {
		if _, err := installer.Install(context.Background(), Request{Name: bundle.Name, Version: bundle.Version}); err != nil {
			t.Fatalf("install %s: %v", bundle.Name, err)
		}
	}
	if _, err := installer.Remove(context.Background(), first.Name); err != nil {
		t.Fatalf("remove first scoped bundle: %v", err)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify remaining scoped bundle: %v", err)
	}
	if _, err := installer.Remove(context.Background(), second.Name); err != nil {
		t.Fatalf("remove second scoped bundle: %v", err)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify empty scoped inventory: %v", err)
	}
	if _, err := os.Lstat(currentPluginPath(t, root, "@scope")); !os.IsNotExist(err) {
		t.Fatalf("empty scoped parent remains after removal: %v", err)
	}
	if _, err := installer.Install(context.Background(), Request{Name: first.Name, Version: first.Version}); err != nil {
		t.Fatalf("reinstall scoped bundle: %v", err)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify reinstalled scoped bundle: %v", err)
	}
}

type bundleRegistry struct{ bundles map[string]Bundle }

func (s bundleRegistry) ResolveBundle(_ context.Context, request Request) (Bundle, error) {
	return s.bundles[request.Name], nil
}
