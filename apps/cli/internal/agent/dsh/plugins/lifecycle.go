package plugins

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// List returns the current signature-verified installed bundle lock.
func (i *Installer) List() (Inventory, error) {
	return i.ReadInventory()
}

// SetEnabled atomically updates the signed enabled state of one installed bundle.
func (i *Installer) SetEnabled(ctx context.Context, name string, enabled bool) (Inventory, error) {
	if err := validateBundleName(name); err != nil {
		return Inventory{}, err
	}
	return i.mutate(ctx, name, func(inventory *Inventory) error {
		for index := range inventory.Plugins {
			if inventory.Plugins[index].Name == name {
				inventory.Plugins[index].Enabled = enabled
				return nil
			}
		}
		return fmt.Errorf("%w: %s", ErrBundleNotFound, name)
	})
}

// Remove atomically removes one bundle and its files from the signed snapshot.
func (i *Installer) Remove(ctx context.Context, name string) (Inventory, error) {
	if err := validateBundleName(name); err != nil {
		return Inventory{}, err
	}
	return i.mutate(ctx, name, func(inventory *Inventory) error {
		for index, plugin := range inventory.Plugins {
			if plugin.Name == name {
				inventory.Plugins = append(inventory.Plugins[:index], inventory.Plugins[index+1:]...)
				return nil
			}
		}
		return fmt.Errorf("%w: %s", ErrBundleNotFound, name)
	})
}

func validateBundleName(name string) error {
	return validateRequest(Request{Name: name, Version: "managed"})
}

func (i *Installer) mutate(ctx context.Context, name string, change func(*Inventory) error) (Inventory, error) {
	lock, err := waitForPluginLock(ctx, i.root)
	if err != nil {
		return Inventory{}, err
	}
	defer lock.Release()
	inventory, current, err := i.readCurrentSnapshot()
	if err != nil {
		return Inventory{}, err
	}
	if current == "" || verifyInventoryTree(current, inventory) != nil {
		return Inventory{}, ErrInventoryTampered
	}
	source := copyInventory(inventory)
	if err := change(&inventory); err != nil {
		return Inventory{}, err
	}
	return i.createMutationSnapshot(inventory, source, current, name)
}

func (i *Installer) createMutationSnapshot(inventory, source Inventory, current, name string) (Inventory, error) {
	parent := filepath.Join(i.root, snapshotsName)
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return Inventory{}, fmt.Errorf("create plugin snapshots: %w", err)
	}
	snapshot, err := os.MkdirTemp(parent, ".staging-")
	if err != nil {
		return Inventory{}, fmt.Errorf("create plugin snapshot: %w", err)
	}
	defer os.RemoveAll(snapshot) // best-effort cleanup until snapshot promotion succeeds.
	if err := copyExistingPlugins(current, filepath.Join(snapshot, "plugins"), source); err != nil {
		return Inventory{}, err
	}
	if !containsPlugin(inventory, name) {
		if err := removeStagedPlugin(filepath.Join(snapshot, "plugins"), name); err != nil {
			return Inventory{}, err
		}
	}
	inventory.Version = 1
	if err := i.writeSnapshotLock(snapshot, inventory); err != nil {
		return Inventory{}, err
	}
	return i.promoteSnapshot(snapshot, inventory)
}

func copyInventory(inventory Inventory) Inventory {
	copy := Inventory{Version: inventory.Version, Plugins: make([]Plugin, len(inventory.Plugins))}
	copy.Plugins = append(copy.Plugins[:0], inventory.Plugins...)
	return copy
}

func containsPlugin(inventory Inventory, name string) bool {
	for _, plugin := range inventory.Plugins {
		if plugin.Name == name {
			return true
		}
	}
	return false
}

func removeStagedPlugin(root, name string) error {
	target := filepath.Join(root, filepath.FromSlash(name))
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("remove staged plugin: %w", err)
	}
	parts := strings.Split(name, "/")
	if len(parts) != 2 {
		return nil
	}
	parent := filepath.Join(root, parts[0])
	entries, err := os.ReadDir(parent)
	if err != nil {
		return fmt.Errorf("read staged scoped plugin parent: %w", err)
	}
	if len(entries) != 0 {
		return nil
	}
	if err := os.Remove(parent); err != nil {
		return fmt.Errorf("remove empty staged scoped plugin parent: %w", err)
	}
	return nil
}
