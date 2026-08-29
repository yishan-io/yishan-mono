package setup

import (
	"context"
	"fmt"

	"yishan/apps/cli/internal/agent/dsh/plugins"
)

const officialDSHPluginRegistryURL = "https://registry.npmjs.org"

// officialDSHPluginCatalog is intentionally empty until a reviewed, data-only
// Yishan adaptation manifest is bound to an exact upstream release. Do not add
// an upstream package directly: every entry must include its audited manifest.
var officialDSHPluginCatalog = []plugins.ApprovedBundle{}

// ListOfficialDSHPluginBundles returns daemon-owned install candidates. It
// copies the catalog so callers cannot alter future install authorization.
func ListOfficialDSHPluginBundles() []plugins.ApprovedBundle {
	return append([]plugins.ApprovedBundle(nil), officialDSHPluginCatalog...)
}

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
	installer, err := plugins.NewInstaller(dshDataDir, key, ListOfficialDSHPluginBundles(), plugins.HTTPRegistry{BaseURL: officialDSHPluginRegistryURL}, plugins.HTTPDownloader{})
	if err != nil {
		return nil, fmt.Errorf("create DSH plugin installer: %w", err)
	}
	return installer, nil
}
