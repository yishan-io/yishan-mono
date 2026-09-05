package setup

import (
	"context"
	"fmt"
	"maps"
	"os"

	"golang.org/x/mod/semver"

	"yishan/apps/cli/internal/agent/dsh/plugins"
)

const officialDSHPluginRegistryURL = "https://registry.npmjs.org"

const (
	officialDSHDevFlowName          = "@yishan-io/dsh-dev-flow"
	officialDSHDevFlowVersion       = "0.1.0"
	officialDSHDevFlowIntegrity     = "sha512-rjdognncvnHAjPrA2pt8Dmj3HAsNNrKlksIUxG7ofU/y7O2fwtPgD8FqFWZ4Pr6SB3cZeouWXAlixZ8MelKfHg=="
	officialDSHDevFlowSeedIntegrity = "sha512-I0BqtuoIm2oGe14RSb8TFNrzbu5Nob3tA6qiIZj7YgcvKlGFBqYpcrRk8kS3qyVqwNqHYMz/+mBDghlqo4rAdA=="
)

type officialDSHPluginBundle struct {
	plugins.ApprovedBundle
	OfflineOnly bool
}

var officialDSHPluginCatalog = []officialDSHPluginBundle{{
	ApprovedBundle: plugins.ApprovedBundle{
		Name: officialDSHDevFlowName, Version: officialDSHDevFlowVersion,
		Integrity: officialDSHDevFlowIntegrity, SeedIntegrity: officialDSHDevFlowSeedIntegrity,
		Entries: []plugins.PluginEntry{{ID: "dev-flow", Entrypoint: "entry.mjs", Config: map[string]any{}, Inject: []string{"skills"}}},
	},
	OfflineOnly: true,
}}

// EnsureOfficialDSHPluginSeed installs the current official bundle from an explicit offline archive.
func EnsureOfficialDSHPluginSeed(ctx context.Context, dshDataDir, seedPath string) (plugins.Inventory, error) {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return plugins.Inventory{}, err
	}
	inventory, err := installer.VerifyInstalledInventory()
	if err != nil {
		return plugins.Inventory{}, fmt.Errorf("verify DSH plugin inventory: %w", err)
	}
	bundle := officialDSHPluginCatalog[0].ApprovedBundle
	installed := installedDSHPlugin(inventory, bundle.Name)
	if installed != nil && installed.Version == bundle.Version {
		return inventory, nil
	}
	if installed != nil && !semver.IsValid("v"+installed.Version) {
		return plugins.Inventory{}, fmt.Errorf("%w: invalid installed official bundle version", plugins.ErrInventoryTampered)
	}
	if installed != nil && semver.Compare("v"+installed.Version, "v"+bundle.Version) > 0 {
		return inventory, nil
	}
	archive, err := os.ReadFile(seedPath)
	if err != nil {
		return plugins.Inventory{}, fmt.Errorf("read DSH plugin seed: %w", err)
	}
	return installer.InstallArchive(ctx, plugins.Request{Name: bundle.Name, Version: bundle.Version}, archive)
}

func installedDSHPlugin(inventory plugins.Inventory, name string) *plugins.Plugin {
	for index := range inventory.Plugins {
		if inventory.Plugins[index].Name == name {
			return &inventory.Plugins[index]
		}
	}
	return nil
}

// ListOfficialDSHPluginBundles returns daemon-owned install candidates. It
// copies the catalog so callers cannot alter future install authorization.
func ListOfficialDSHPluginBundles() []plugins.ApprovedBundle {
	catalog := make([]plugins.ApprovedBundle, 0, len(officialDSHPluginCatalog))
	for _, bundle := range officialDSHPluginCatalog {
		if !bundle.OfflineOnly {
			catalog = append(catalog, cloneApprovedDSHBundle(bundle.ApprovedBundle))
		}
	}
	return catalog
}

func approvedOfficialDSHPluginBundles() []plugins.ApprovedBundle {
	catalog := make([]plugins.ApprovedBundle, len(officialDSHPluginCatalog))
	for index, bundle := range officialDSHPluginCatalog {
		catalog[index] = cloneApprovedDSHBundle(bundle.ApprovedBundle)
	}
	return catalog
}

func cloneApprovedDSHBundle(bundle plugins.ApprovedBundle) plugins.ApprovedBundle {
	bundle.Entries = append([]plugins.PluginEntry(nil), bundle.Entries...)
	for index := range bundle.Entries {
		if config, ok := bundle.Entries[index].Config.(map[string]any); ok {
			bundle.Entries[index].Config = cloneDSHPluginConfig(config)
		}
		if inject, ok := bundle.Entries[index].Inject.([]string); ok {
			bundle.Entries[index].Inject = append([]string(nil), inject...)
		}
	}
	return bundle
}

func cloneDSHPluginConfig(config map[string]any) map[string]any { return maps.Clone(config) }

// InstallDSHPluginBundle installs a catalog-selected bundle by name. Version
// and package source remain daemon-owned; callers never provide an npm specifier.
func InstallDSHPluginBundle(ctx context.Context, dshDataDir, name string) (plugins.Inventory, error) {
	for _, bundle := range ListOfficialDSHPluginBundles() {
		if bundle.Name == name {
			installer, err := newDSHPluginInstaller(ctx, dshDataDir)
			if err != nil {
				return plugins.Inventory{}, err
			}
			return installer.Install(ctx, plugins.Request{Name: bundle.Name, Version: bundle.Version})
		}
	}
	return plugins.Inventory{}, fmt.Errorf("%w: %s", plugins.ErrBundleNotAllowed, name)
}

// ListDSHPluginBundles returns the current signature-verified DSH bundle lock.
func ListDSHPluginBundles(ctx context.Context, dshDataDir string) (plugins.Inventory, error) {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return plugins.Inventory{}, err
	}
	return installer.List()
}

// CaptureDSHPluginSnapshot captures the active signed bundle snapshot before mutation.
func CaptureDSHPluginSnapshot(ctx context.Context, dshDataDir string) (plugins.Snapshot, error) {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return plugins.Snapshot{}, err
	}
	return installer.CaptureSnapshot(ctx)
}

// RestoreDSHPluginSnapshot makes a previously captured bundle snapshot active again.
func RestoreDSHPluginSnapshot(ctx context.Context, dshDataDir string, snapshot plugins.Snapshot) error {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return err
	}
	return installer.RestoreSnapshot(ctx, snapshot)
}

// SetDSHPluginBundleEnabled updates one installed bundle's signed enabled state.
func SetDSHPluginBundleEnabled(ctx context.Context, dshDataDir, name string, enabled bool) (plugins.Inventory, error) {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return plugins.Inventory{}, err
	}
	return installer.SetEnabled(ctx, name, enabled)
}

// RemoveDSHPluginBundle removes one installed bundle from the signed snapshot.
func RemoveDSHPluginBundle(ctx context.Context, dshDataDir, name string) (plugins.Inventory, error) {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return plugins.Inventory{}, err
	}
	return installer.Remove(ctx, name)
}

// UpdateDSHPluginBundle reinstalls an installed bundle from the daemon allowlist.
func UpdateDSHPluginBundle(ctx context.Context, dshDataDir, name string) (plugins.Inventory, error) {
	installer, err := newDSHPluginInstaller(ctx, dshDataDir)
	if err != nil {
		return plugins.Inventory{}, err
	}
	inventory, err := installer.List()
	if err != nil {
		return plugins.Inventory{}, err
	}
	if !hasInstalledDSHPlugin(inventory, name) {
		return plugins.Inventory{}, fmt.Errorf("%w: %s", plugins.ErrBundleNotFound, name)
	}
	for _, bundle := range ListOfficialDSHPluginBundles() {
		if bundle.Name == name {
			return installer.Install(ctx, plugins.Request{Name: bundle.Name, Version: bundle.Version})
		}
	}
	return plugins.Inventory{}, fmt.Errorf("%w: %s", plugins.ErrBundleNotAllowed, name)
}

func hasInstalledDSHPlugin(inventory plugins.Inventory, name string) bool {
	for _, plugin := range inventory.Plugins {
		if plugin.Name == name {
			return true
		}
	}
	return false
}

func newDSHPluginInstaller(ctx context.Context, dshDataDir string) (*plugins.Installer, error) {
	key, err := plugins.LoadOrCreateSigningKey(ctx, dshDataDir)
	if err != nil {
		return nil, fmt.Errorf("load DSH plugin signing key: %w", err)
	}
	installer, err := plugins.NewInstaller(dshDataDir, key, approvedOfficialDSHPluginBundles(), plugins.HTTPRegistry{BaseURL: officialDSHPluginRegistryURL}, plugins.HTTPDownloader{})
	if err != nil {
		return nil, fmt.Errorf("create DSH plugin installer: %w", err)
	}
	return installer, nil
}
