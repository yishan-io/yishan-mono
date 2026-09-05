package plugins

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalStore_DeveloperModeGatesExplicitRegistration(t *testing.T) {
	root := t.TempDir()
	store, err := NewLocalStore(root, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Register("local", root); !errors.Is(err, ErrDeveloperModeRequired) {
		t.Fatalf("Register error = %v", err)
	}
}

func TestLocalStore_RegistersCompleteExplicitLocalInventory(t *testing.T) {
	root, bundle := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(bundle, "entry.mjs"), []byte("export default () => undefined\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := `{"version":1,"entries":[{"id":"main","entrypoint":"entry.mjs","config":{},"disabled":false,"inject":[]}]}`
	if err := os.WriteFile(filepath.Join(bundle, localPluginManifestName), []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := NewLocalStore(root, true)
	if err != nil {
		t.Fatal(err)
	}
	bundles, err := store.Register("local", bundle)
	if err != nil {
		t.Fatal(err)
	}
	if len(bundles) != 1 || bundles[0].ID != "local" || len(bundles[0].Entries) != 1 || bundles[0].TreeSHA256 == "" {
		t.Fatalf("bundles = %#v", bundles)
	}
	if _, err := os.Stat(filepath.Join(root, localLockName)); err != nil {
		t.Fatalf("local lock: %v", err)
	}
}
