package plugins

import (
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Install resolves registry metadata, downloads an archive, then uses the offline-safe installer.
func (i *Installer) Install(ctx context.Context, request Request) (Inventory, error) {
	if err := validateRequest(request); err != nil {
		return Inventory{}, err
	}
	if i.registry == nil || i.downloader == nil {
		return Inventory{}, errors.New("DSH plugin network installer is unavailable")
	}
	approved, ok := i.approved[bundleKey(request.Name, request.Version)]
	if !ok {
		return Inventory{}, fmt.Errorf("%w: %s@%s", ErrBundleNotAllowed, request.Name, request.Version)
	}
	bundle, err := i.registry.ResolveBundle(ctx, request)
	if err != nil {
		return Inventory{}, fmt.Errorf("resolve DSH plugin: %w", err)
	}
	if err := validateBundle(request, approved, bundle); err != nil {
		return Inventory{}, err
	}
	archive, err := i.downloader.Download(ctx, bundle.TarballURL)
	if err != nil {
		return Inventory{}, fmt.Errorf("download DSH plugin bundle: %w", err)
	}
	return i.InstallArchive(ctx, request, archive)
}

// InstallArchive verifies and atomically installs a daemon-approved offline archive.
func (i *Installer) InstallArchive(ctx context.Context, request Request, archive []byte) (Inventory, error) {
	if err := validateRequest(request); err != nil {
		return Inventory{}, err
	}
	approved, ok := i.approved[bundleKey(request.Name, request.Version)]
	if !ok {
		return Inventory{}, fmt.Errorf("%w: %s@%s", ErrBundleNotAllowed, request.Name, request.Version)
	}
	if err := validateArchiveIntegrity(archive, approved.Integrity); err != nil {
		return Inventory{}, err
	}
	bundle := Bundle{Name: request.Name, Version: request.Version}
	plugin, stage, err := i.stageBundle(bundle, approved, archive)
	if err != nil {
		return Inventory{}, err
	}
	defer os.RemoveAll(stage) // best-effort cleanup of extraction staging.
	return i.commit(ctx, plugin, stage)
}

func validateBundle(request Request, approved ApprovedBundle, bundle Bundle) error {
	if bundle.Name != request.Name || bundle.Version != request.Version {
		return fmt.Errorf("%w: registry package identity mismatch", ErrInvalidArchive)
	}
	if bundle.Integrity != approved.Integrity {
		return fmt.Errorf("%w: registry integrity differs from daemon allowlist", ErrBundleNotAllowed)
	}
	if bundle.TarballURL == "" {
		return fmt.Errorf("%w: incomplete registry metadata", ErrInvalidArchive)
	}
	return nil
}

func validateArchiveIntegrity(archive []byte, integrity string) error {
	if len(archive) > maxArchiveBytes {
		return fmt.Errorf("%w: compressed size exceeds limit", ErrInvalidArchive)
	}
	const prefix = "sha512-"
	if len(integrity) <= len(prefix) || integrity[:len(prefix)] != prefix {
		return fmt.Errorf("%w: unsupported tarball integrity", ErrInvalidArchive)
	}
	expected, err := base64.StdEncoding.DecodeString(integrity[len(prefix):])
	if err != nil {
		return fmt.Errorf("%w: decode tarball integrity: %w", ErrInvalidArchive, err)
	}
	sum := sha512.Sum512(archive)
	if subtle.ConstantTimeCompare(sum[:], expected) != 1 {
		return fmt.Errorf("%w: tarball integrity mismatch", ErrInvalidArchive)
	}
	return nil
}

func (i *Installer) stageBundle(bundle Bundle, approved ApprovedBundle, archive []byte) (Plugin, string, error) {
	parent := filepath.Join(i.root, ".plugin-staging")
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return Plugin{}, "", fmt.Errorf("create plugin staging root: %w", err)
	}
	stage, err := os.MkdirTemp(parent, "bundle-")
	if err != nil {
		return Plugin{}, "", fmt.Errorf("create plugin staging directory: %w", err)
	}
	plugin, err := extractBundle(stage, bundle, archive)
	if err != nil {
		_ = os.RemoveAll(stage)
		return Plugin{}, "", err
	}
	if err := validatePluginEntrypoints(stage, approved.Entries); err != nil {
		_ = os.RemoveAll(stage)
		return Plugin{}, "", err
	}
	plugin.Entries = make([]PluginEntry, len(approved.Entries))
	copy(plugin.Entries, approved.Entries)
	return plugin, stage, nil
}

func (i *Installer) commit(ctx context.Context, plugin Plugin, stage string) (Inventory, error) {
	lock, err := waitForPluginLock(ctx, i.root)
	if err != nil {
		return Inventory{}, err
	}
	defer lock.Release()
	inventory, snapshot, err := i.readCurrentSnapshot()
	if err != nil {
		return Inventory{}, err
	}
	if snapshot != "" && verifyInventoryTree(snapshot, inventory) != nil {
		return Inventory{}, ErrInventoryTampered
	}
	return i.createSnapshot(inventory, snapshot, plugin, stage)
}
