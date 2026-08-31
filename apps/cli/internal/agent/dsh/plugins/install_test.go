package plugins

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

type stubRegistry struct{ bundle Bundle }

func (s stubRegistry) ResolveBundle(context.Context, Request) (Bundle, error) { return s.bundle, nil }

type stubDownloader struct{ archive []byte }

func (s stubDownloader) Download(context.Context, string) ([]byte, error) { return s.archive, nil }

func TestInstallerInstall_IgnoresPublisherMetadata(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	installer := newTestInstaller(t, t.TempDir(), approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatalf("install = %v, want publisher metadata ignored", err)
	}
}

func TestInstallerInstall_SignsDaemonApprovedEntries(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "export default () => undefined\n"}})
	bundle := approvedBundle(archive)
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	entries := []PluginEntry{{ID: "main", Entrypoint: "index.js"}}
	installer, err := NewInstaller(t.TempDir(), key, []ApprovedBundle{{Name: bundle.Name, Version: bundle.Version, Integrity: bundle.Integrity, Entries: entries}}, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	inventory, err := installer.Install(context.Background(), Request{Name: bundle.Name, Version: bundle.Version})
	if err != nil || len(inventory.Plugins) != 1 || len(inventory.Plugins[0].Entries) != 1 {
		t.Fatalf("Install = %#v, %v", inventory, err)
	}
}

func TestInstallerInstall_DoesNotRequirePackageOwnedRuntimeMetadata(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "export default () => undefined\n"}})
	installer := newTestInstaller(t, t.TempDir(), approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatalf("install = %v, want daemon-approved entry install", err)
	}
}

func TestInstallerInstall_IgnoresUpstreamPluginMetadata(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/yishan.plugin.json", body: `{"version":"upstream"}`}})
	installer := newTestInstaller(t, t.TempDir(), approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatalf("install = %v, want daemon-approved entries only", err)
	}
}

func TestInstallerInstall_RejectsTamperedArchive(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	installer := newTestInstaller(t, t.TempDir(), approvedBundle(archive), append(archive, 'x'))
	_, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"})
	if !errors.Is(err, ErrInvalidArchive) {
		t.Fatalf("error = %v, want integrity rejection", err)
	}
}

func TestInstallerInstall_RejectsTraversalArchive(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/../../escaped", body: "bad"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	_, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"})
	if !errors.Is(err, ErrInvalidArchive) {
		t.Fatalf("error = %v, want archive rejection", err)
	}
	if _, statErr := os.Stat(filepath.Join(root, "escaped")); !os.IsNotExist(statErr) {
		t.Fatal("traversal wrote outside staging directory")
	}
}

func TestInstallerInstall_PreservesExistingPluginWhenStagingFails(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "plugins", "safe-plugin")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "index.js"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", typeflag: tar.TypeSymlink}})
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	_, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"})
	if !errors.Is(err, ErrInvalidArchive) {
		t.Fatalf("error = %v, want archive rejection", err)
	}
	content, readErr := os.ReadFile(filepath.Join(target, "index.js"))
	if readErr != nil || string(content) != "old" {
		t.Fatalf("existing plugin changed: %q, %v", content, readErr)
	}
}

func TestInstallerReadInventory_RejectsTampering(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(currentSnapshotPath(t, root, inventoryName), []byte(`{"Version":1,"Plugins":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := installer.ReadInventory(); !errors.Is(err, ErrInventoryTampered) {
		t.Fatalf("error = %v, want tamper rejection", err)
	}
}

type tarEntry struct {
	name, body string
	typeflag   byte
}

func makeArchive(t *testing.T, entries []tarEntry) []byte {
	t.Helper()
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	archive := tar.NewWriter(writer)
	if err := archive.WriteHeader(&tar.Header{Name: "package/", Mode: 0o755, Typeflag: tar.TypeDir}); err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		kind := entry.typeflag
		if kind == 0 {
			kind = tar.TypeReg
		}
		if err := archive.WriteHeader(&tar.Header{Name: entry.name, Mode: 0o644, Size: int64(len(entry.body)), Typeflag: kind}); err != nil {
			t.Fatal(err)
		}
		if kind == tar.TypeReg {
			if _, err := archive.Write([]byte(entry.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return compressed.Bytes()
}

func newTestInstaller(t *testing.T, root string, bundle Bundle, archive []byte) *Installer {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	installer, err := NewInstaller(root, key, []ApprovedBundle{{Name: "safe-plugin", Version: "1.0.0", Integrity: bundle.Integrity, Entries: testEntries()}}, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	return installer
}
func approvedBundle(archive []byte) Bundle {
	return Bundle{Name: "safe-plugin", Version: "1.0.0", TarballURL: "https://example.test/a", Integrity: integrity(archive)}
}
func integrity(archive []byte) string {
	sum := sha512.Sum512(archive)
	return "sha512-" + base64.StdEncoding.EncodeToString(sum[:])
}
func testEntries() []PluginEntry { return []PluginEntry{} }

func TestInstallerVerifyInstalledInventory_RejectsChangedFile(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(currentPluginPath(t, root, "safe-plugin", "index.js"), []byte("changed"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := installer.VerifyInstalledInventory(); !errors.Is(err, ErrInventoryTampered) {
		t.Fatalf("error = %v, want tamper rejection", err)
	}
}

func TestInstallerInstall_RejectsBundleOutsideDaemonAllowlist(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	bundle := approvedBundle(archive)
	bundle.Name = "other-plugin"
	installer := newTestInstaller(t, t.TempDir(), bundle, archive)
	_, err := installer.Install(context.Background(), Request{Name: "other-plugin", Version: "1.0.0"})
	if !errors.Is(err, ErrBundleNotAllowed) {
		t.Fatalf("error = %v, want daemon allowlist rejection", err)
	}
}

func TestInstallerVerifyInstalledInventory_IgnoresEmptyDirectory(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(currentPluginPath(t, root, "safe-plugin", "extra"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify inventory = %v, want file-tree integrity only", err)
	}
}

func currentPluginPath(t *testing.T, root string, elements ...string) string {
	parts := append([]string{currentSnapshotPath(t, root), "plugins"}, elements...)
	return filepath.Join(parts...)
}

func currentSnapshotPath(t *testing.T, root string, elements ...string) string {
	t.Helper()
	current, err := os.ReadFile(filepath.Join(root, currentSnapshotName))
	if err != nil {
		t.Fatal(err)
	}
	parts := append([]string{root, snapshotsName, string(current)}, elements...)
	return filepath.Join(parts...)
}

func TestInstallerInstall_SerializesConcurrentCommits(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	bundle := approvedBundle(archive)
	approved := []ApprovedBundle{{Name: bundle.Name, Version: bundle.Version, Integrity: bundle.Integrity, Entries: testEntries()}}
	first, err := NewInstaller(root, key, approved, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewInstaller(root, key, approved, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	errors := make(chan error, 2)
	for _, installer := range []*Installer{first, second} {
		go func(installer *Installer) {
			_, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"})
			errors <- err
		}(installer)
	}
	for range 2 {
		if err := <-errors; err != nil {
			t.Fatalf("concurrent install: %v", err)
		}
	}
	if _, err := first.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify committed snapshot: %v", err)
	}
}

func TestInstallerVerifyInstalledInventory_RejectsExtraFileAndSymlink(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	pluginRoot := currentPluginPath(t, root, "safe-plugin")
	if err := os.WriteFile(filepath.Join(pluginRoot, "extra.js"), []byte("bad"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := installer.VerifyInstalledInventory(); !errors.Is(err, ErrInventoryTampered) {
		t.Fatalf("extra file error = %v", err)
	}
	if err := os.Remove(filepath.Join(pluginRoot, "extra.js")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("index.js", filepath.Join(pluginRoot, "link.js")); err != nil {
		t.Skipf("create symlink: %v", err)
	}
	if _, err := installer.VerifyInstalledInventory(); !errors.Is(err, ErrInventoryTampered) {
		t.Fatalf("symlink error = %v", err)
	}
}

func TestExtractBundle_RequiresPackageRootDirectory(t *testing.T) {
	var compressed bytes.Buffer
	gzipWriter := gzip.NewWriter(&compressed)
	tarWriter := tar.NewWriter(gzipWriter)
	if err := tarWriter.WriteHeader(&tar.Header{Name: "package/index.js", Mode: 0o644, Size: 2, Typeflag: tar.TypeReg}); err != nil {
		t.Fatal(err)
	}
	if _, err := tarWriter.Write([]byte("ok")); err != nil {
		t.Fatal(err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	_, err := extractBundle(t.TempDir(), Bundle{Name: "safe-plugin", Version: "1.0.0"}, compressed.Bytes())
	if !errors.Is(err, ErrInvalidArchive) {
		t.Fatalf("error = %v, want package-root rejection", err)
	}
}

func TestSecureClient_RejectsHTTPRedirect(t *testing.T) {
	redirect := secureClient(&http.Client{}).CheckRedirect
	err := redirect(&http.Request{URL: &url.URL{Scheme: "http", Host: "example.test"}}, nil)
	if err == nil {
		t.Fatal("HTTP redirect was accepted")
	}
}

func TestLoadOrCreateSigningKey_ConcurrentFreshRootInstallationsVerify(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	bundle := approvedBundle(archive)
	approved := []ApprovedBundle{{Name: bundle.Name, Version: bundle.Version, Integrity: bundle.Integrity, Entries: testEntries()}}
	root := t.TempDir()
	start := make(chan struct{})
	errors := make(chan error, 8)
	for range cap(errors) {
		go func() {
			<-start
			key, err := LoadOrCreateSigningKey(context.Background(), root)
			if err != nil {
				errors <- err
				return
			}
			installer, err := NewInstaller(root, key, approved, stubRegistry{bundle}, stubDownloader{archive})
			if err == nil {
				_, err = installer.Install(context.Background(), Request{Name: bundle.Name, Version: bundle.Version})
			}
			errors <- err
		}()
	}
	close(start)
	for range cap(errors) {
		if err := <-errors; err != nil {
			t.Fatalf("concurrent fresh-root installation: %v", err)
		}
	}
	key, err := LoadOrCreateSigningKey(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	installer, err := NewInstaller(root, key, approved, stubRegistry{bundle}, stubDownloader{archive})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := installer.VerifyInstalledInventory(); err != nil {
		t.Fatalf("verify concurrent installation: %v", err)
	}
}

func TestInstallerRestoreSnapshot_ReactivatesCapturedInventory(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	installer := newTestInstaller(t, t.TempDir(), approvedBundle(archive), archive)
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatalf("install: %v", err)
	}
	previous, err := installer.CaptureSnapshot(context.Background())
	if err != nil {
		t.Fatalf("capture snapshot: %v", err)
	}
	if _, err := installer.SetEnabled(context.Background(), "safe-plugin", false); err != nil {
		t.Fatalf("disable plugin: %v", err)
	}
	if err := installer.RestoreSnapshot(context.Background(), previous); err != nil {
		t.Fatalf("restore snapshot: %v", err)
	}
	inventory, err := installer.ReadInventory()
	if err != nil {
		t.Fatalf("read restored inventory: %v", err)
	}
	if !inventory.Plugins[0].Enabled {
		t.Fatalf("restored plugin enabled = false, want true")
	}
}

func TestInstallerRestoreSnapshot_RemovesInitialFailedMutation(t *testing.T) {
	archive := makeArchive(t, []tarEntry{{name: "package/index.js", body: "ok"}})
	root := t.TempDir()
	installer := newTestInstaller(t, root, approvedBundle(archive), archive)
	previous, err := installer.CaptureSnapshot(context.Background())
	if err != nil {
		t.Fatalf("capture empty snapshot: %v", err)
	}
	if _, err := installer.Install(context.Background(), Request{Name: "safe-plugin", Version: "1.0.0"}); err != nil {
		t.Fatalf("install: %v", err)
	}
	if err := installer.RestoreSnapshot(context.Background(), previous); err != nil {
		t.Fatalf("restore empty snapshot: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, currentSnapshotName)); !os.IsNotExist(err) {
		t.Fatalf("active snapshot stat error = %v, want not exist", err)
	}
}
