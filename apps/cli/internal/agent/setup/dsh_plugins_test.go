package setup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha512"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/agent/dsh/plugins"
)

func TestListOfficialDSHPluginBundles_ReturnsReviewedDevFlowBundle(t *testing.T) {
	catalog := ListOfficialDSHPluginBundles()
	if len(catalog) != 1 || catalog[0].Name != officialDSHDevFlowName || catalog[0].Version != officialDSHDevFlowVersion {
		t.Fatalf("catalog = %#v", catalog)
	}
	entry := catalog[0].Entries[0]
	config, hasConfig := entry.Config.(map[string]any)
	inject, hasInject := entry.Inject.([]string)
	if entry.ID != "dev-flow" || entry.Entrypoint != "entry.mjs" || !hasConfig || len(config) != 0 || !hasInject || len(inject) != 1 || inject[0] != "skills" {
		t.Fatalf("entry = %#v", entry)
	}
}

func TestInstallDSHPluginBundle_RejectsNonBundleAdapter(t *testing.T) {
	_, err := InstallDSHPluginBundle(context.Background(), t.TempDir(), "@deepseek-ai/dsh-llm-deepseek")
	if !errors.Is(err, plugins.ErrBundleNotAllowed) {
		t.Fatalf("install error = %v, want daemon catalog rejection", err)
	}
}

func TestEnsureOfficialDSHPluginSeed_PreservesDisabledInstalledVersion(t *testing.T) {
	root, seed := prepareSeedCatalog(t, "0.1.0", "entry.mjs")
	if _, err := EnsureOfficialDSHPluginSeed(context.Background(), root, seed); err != nil {
		t.Fatal(err)
	}
	if _, err := SetDSHPluginBundleEnabled(context.Background(), root, "safe-plugin", false); err != nil {
		t.Fatal(err)
	}
	inventory, err := EnsureOfficialDSHPluginSeed(context.Background(), root, filepath.Join(root, "missing.tgz"))
	if err != nil || inventory.Plugins[0].Enabled {
		t.Fatalf("ensure = %#v, %v", inventory, err)
	}
}

func TestEnsureOfficialDSHPluginSeed_UpgradesAndLeavesPriorSnapshotOnFailure(t *testing.T) {
	root, oldSeed := prepareSeedCatalog(t, "0.0.1", "entry.mjs")
	if _, err := EnsureOfficialDSHPluginSeed(context.Background(), root, oldSeed); err != nil {
		t.Fatal(err)
	}
	if _, err := SetDSHPluginBundleEnabled(context.Background(), root, "safe-plugin", false); err != nil {
		t.Fatal(err)
	}
	newSeed := writeSeed(t, root, seedArchive(t, "entry.mjs", "new"))
	setSeedCatalog(t, "0.1.0", newSeed)
	inventory, err := EnsureOfficialDSHPluginSeed(context.Background(), root, newSeed)
	if err != nil || inventory.Plugins[0].Version != "0.1.0" || inventory.Plugins[0].Enabled {
		t.Fatalf("upgrade = %#v, %v", inventory, err)
	}
	badSeed := writeSeed(t, root, seedArchive(t, "other.mjs", "bad"))
	setSeedCatalog(t, "0.2.0", badSeed)
	if _, err := EnsureOfficialDSHPluginSeed(context.Background(), root, badSeed); !errors.Is(err, plugins.ErrBundleNotLoadable) {
		t.Fatalf("ensure error = %v, want entrypoint rejection", err)
	}
	inventory, err = ListDSHPluginBundles(context.Background(), root)
	if err != nil || inventory.Plugins[0].Version != "0.1.0" {
		t.Fatalf("inventory after failed seed = %#v, %v", inventory, err)
	}
}

func TestEnsureOfficialDSHPluginSeed_RejectsTamperedInventory(t *testing.T) {
	root, seed := prepareSeedCatalog(t, "0.1.0", "entry.mjs")
	if _, err := EnsureOfficialDSHPluginSeed(context.Background(), root, seed); err != nil {
		t.Fatal(err)
	}
	inventory, err := ListDSHPluginBundles(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	_ = inventory
	current, err := os.ReadFile(filepath.Join(root, "plugins.current"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".plugin-snapshots", string(current), "plugins", "safe-plugin", "entry.mjs"), []byte("tampered"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := EnsureOfficialDSHPluginSeed(context.Background(), root, seed); !errors.Is(err, plugins.ErrInventoryTampered) {
		t.Fatalf("ensure error = %v", err)
	}
}

func prepareSeedCatalog(t *testing.T, version, entrypoint string) (string, string) {
	t.Helper()
	root := t.TempDir()
	seed := writeSeed(t, root, seedArchive(t, entrypoint, "original"))
	setSeedCatalog(t, version, seed)
	return root, seed
}
func setSeedCatalog(t *testing.T, version, seed string) {
	t.Helper()
	previous := officialDSHPluginCatalog
	t.Cleanup(func() { officialDSHPluginCatalog = previous })
	content, err := os.ReadFile(seed)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha512.Sum512(content)
	officialDSHPluginCatalog = []plugins.ApprovedBundle{{Name: "safe-plugin", Version: version, Integrity: "sha512-" + base64.StdEncoding.EncodeToString(sum[:]), Entries: []plugins.PluginEntry{{ID: "main", Entrypoint: "entry.mjs"}}}}
}
func writeSeed(t *testing.T, root string, content []byte) string {
	t.Helper()
	file, err := os.CreateTemp(root, "seed-*.tgz")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return file.Name()
}
func seedArchive(t *testing.T, entrypoint, body string) []byte {
	t.Helper()
	var out bytes.Buffer
	gzipWriter := gzip.NewWriter(&out)
	tarWriter := tar.NewWriter(gzipWriter)
	if err := tarWriter.WriteHeader(&tar.Header{Name: "package/", Typeflag: tar.TypeDir, Mode: 0o755}); err != nil {
		t.Fatal(err)
	}
	if err := tarWriter.WriteHeader(&tar.Header{Name: "package/" + entrypoint, Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(body))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tarWriter.Write([]byte(body)); err != nil {
		t.Fatal(err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}
