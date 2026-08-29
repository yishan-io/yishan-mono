package plugins

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	inventoryName       = "plugins.lock.json"
	signatureName       = "plugins.lock.sig"
	currentSnapshotName = "plugins.current"
	snapshotsName       = ".plugin-snapshots"
)

// ReadInventory verifies and returns the current daemon-signed lock inventory.
func (i *Installer) ReadInventory() (Inventory, error) {
	inventory, _, err := i.readCurrentSnapshot()
	return inventory, err
}

// CaptureSnapshot returns the active snapshot before a runtime-coupled mutation.
func (i *Installer) CaptureSnapshot(ctx context.Context) (Snapshot, error) {
	lock, err := waitForPluginLock(ctx, i.root)
	if err != nil {
		return Snapshot{}, err
	}
	defer lock.Release()
	_, current, err := i.readCurrentSnapshot()
	if err != nil {
		return Snapshot{}, err
	}
	if current == "" {
		return Snapshot{}, nil
	}
	return Snapshot{name: filepath.Base(current)}, nil
}

// RestoreSnapshot makes a captured signed snapshot active again after a failed runtime restart.
func (i *Installer) RestoreSnapshot(ctx context.Context, snapshot Snapshot) error {
	lock, err := waitForPluginLock(ctx, i.root)
	if err != nil {
		return err
	}
	defer lock.Release()
	if snapshot.name == "." {
		return ErrInventoryTampered
	}
	if snapshot.name == "" {
		if err := os.Remove(filepath.Join(i.root, currentSnapshotName)); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove active plugin snapshot: %w", err)
		}
		return syncDirectory(i.root)
	}
	previous := filepath.Join(i.root, snapshotsName, snapshot.name)
	inventory, err := i.readInventory(previous)
	if err != nil {
		return err
	}
	if err := verifyInventoryTree(previous, inventory); err != nil {
		return err
	}
	if err := writeAtomic(filepath.Join(i.root, currentSnapshotName), []byte(snapshot.name), 0o600); err != nil {
		return fmt.Errorf("restore active plugin snapshot: %w", err)
	}
	return nil
}

func (i *Installer) readCurrentSnapshot() (Inventory, string, error) {
	name, err := i.readCurrentSnapshotName()
	if os.IsNotExist(err) {
		return Inventory{Version: 1}, "", nil
	}
	if err != nil {
		return Inventory{}, "", err
	}
	snapshot := filepath.Join(i.root, snapshotsName, name)
	inventory, err := i.readInventory(snapshot)
	return inventory, snapshot, err
}

func (i *Installer) readCurrentSnapshotName() (string, error) {
	content, err := os.ReadFile(filepath.Join(i.root, currentSnapshotName))
	if err != nil {
		return "", err
	}
	name := strings.TrimSpace(string(content))
	if name == "" || filepath.Base(name) != name {
		return "", ErrInventoryTampered
	}
	return name, nil
}

func (i *Installer) readInventory(snapshot string) (Inventory, error) {
	content, err := os.ReadFile(filepath.Join(snapshot, inventoryName))
	if err != nil {
		return Inventory{}, fmt.Errorf("read plugin inventory: %w", err)
	}
	signature, err := os.ReadFile(filepath.Join(snapshot, signatureName))
	if err != nil {
		return Inventory{}, fmt.Errorf("read plugin inventory signature: %w", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(string(signature))
	if err != nil || !ed25519.Verify(i.key.Public().(ed25519.PublicKey), content, decoded) {
		return Inventory{}, ErrInventoryTampered
	}
	var inventory Inventory
	if err := json.Unmarshal(content, &inventory); err != nil {
		return Inventory{}, fmt.Errorf("decode plugin inventory: %w", err)
	}
	canonical, err := canonicalInventory(inventory)
	if err != nil || string(canonical) != string(content) {
		return Inventory{}, ErrInventoryTampered
	}
	return inventory, nil
}

func (i *Installer) createSnapshot(inventory Inventory, current string, plugin Plugin, stage string) (Inventory, error) {
	parent := filepath.Join(i.root, snapshotsName)
	if err := os.MkdirAll(parent, 0o700); err != nil {
		return Inventory{}, fmt.Errorf("create plugin snapshots: %w", err)
	}
	snapshot, err := os.MkdirTemp(parent, ".staging-")
	if err != nil {
		return Inventory{}, fmt.Errorf("create plugin snapshot: %w", err)
	}
	defer os.RemoveAll(snapshot) // best-effort cleanup until snapshot promotion succeeds.
	if err := copyExistingPlugins(current, filepath.Join(snapshot, "plugins"), inventory); err != nil {
		return Inventory{}, err
	}
	if err := replaceStagedPlugin(filepath.Join(snapshot, "plugins"), plugin.Name, stage); err != nil {
		return Inventory{}, err
	}
	inventory.Version = 1
	inventory.Plugins = replacePlugin(inventory.Plugins, plugin)
	if err := i.writeSnapshotLock(snapshot, inventory); err != nil {
		return Inventory{}, err
	}
	return i.promoteSnapshot(snapshot, inventory)
}

func copyExistingPlugins(current, destination string, inventory Inventory) error {
	if current == "" {
		return os.MkdirAll(destination, 0o755)
	}
	if err := verifyInventoryTree(current, inventory); err != nil {
		return err
	}
	return copyTree(filepath.Join(current, "plugins"), destination)
}

func copyTree(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.Type()&os.ModeSymlink != 0 || (!entry.IsDir() && !entry.Type().IsRegular()) {
			return ErrInventoryTampered
		}
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(path, target)
	})
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open installed plugin file: %w", err)
	}
	defer input.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return fmt.Errorf("create plugin snapshot directory: %w", err)
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("create plugin snapshot file: %w", err)
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return fmt.Errorf("copy installed plugin file: %w", copyErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close plugin snapshot file: %w", closeErr)
	}
	return nil
}

func replaceStagedPlugin(root, name, stage string) error {
	target := filepath.Join(root, filepath.FromSlash(name))
	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("remove staged plugin replacement: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create plugin target parent: %w", err)
	}
	if err := os.Rename(stage, target); err != nil {
		return fmt.Errorf("promote staged plugin: %w", err)
	}
	return nil
}

func (i *Installer) writeSnapshotLock(snapshot string, inventory Inventory) error {
	canonical, err := canonicalInventory(inventory)
	if err != nil {
		return err
	}
	signature := ed25519.Sign(i.key, canonical)
	if err := writeAtomic(filepath.Join(snapshot, inventoryName), canonical, 0o600); err != nil {
		return err
	}
	return writeAtomic(filepath.Join(snapshot, signatureName), []byte(base64.StdEncoding.EncodeToString(signature)), 0o600)
}

func (i *Installer) promoteSnapshot(snapshot string, inventory Inventory) (Inventory, error) {
	name := filepath.Base(snapshot)
	final := filepath.Join(i.root, snapshotsName, strings.TrimPrefix(name, ".staging-"))
	if err := os.Rename(snapshot, final); err != nil {
		return Inventory{}, fmt.Errorf("promote plugin snapshot: %w", err)
	}
	if err := syncDirectory(filepath.Dir(final)); err != nil {
		return Inventory{}, err
	}
	if err := writeAtomic(filepath.Join(i.root, currentSnapshotName), []byte(filepath.Base(final)), 0o600); err != nil {
		return Inventory{}, err
	}
	return inventory, nil
}

func replacePlugin(plugins []Plugin, installed Plugin) []Plugin {
	updated := make([]Plugin, 0, len(plugins)+1)
	for _, plugin := range plugins {
		if plugin.Name != installed.Name {
			updated = append(updated, plugin)
		}
	}
	updated = append(updated, installed)
	sort.Slice(updated, func(a, b int) bool { return updated[a].Name < updated[b].Name })
	return updated
}
func canonicalInventory(inventory Inventory) ([]byte, error) {
	for index := range inventory.Plugins {
		sort.Slice(inventory.Plugins[index].Files, func(a, b int) bool {
			return inventory.Plugins[index].Files[a].Path < inventory.Plugins[index].Files[b].Path
		})
	}
	sort.Slice(inventory.Plugins, func(a, b int) bool { return inventory.Plugins[a].Name < inventory.Plugins[b].Name })
	return json.Marshal(inventory)
}

func writeAtomic(path string, content []byte, mode os.FileMode) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".plugin-lock-")
	if err != nil {
		return fmt.Errorf("create inventory staging file: %w", err)
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(content); err == nil {
		err = file.Chmod(mode)
	}
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write plugin inventory: %w", err)
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return fmt.Errorf("promote plugin inventory: %w", err)
	}
	return syncDirectory(filepath.Dir(path))
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open plugin inventory directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("sync plugin inventory directory: %w", err)
	}
	return nil
}

// VerifyInstalledInventory verifies the signature and every installed file-tree hash.
func (i *Installer) VerifyInstalledInventory() (Inventory, error) {
	inventory, snapshot, err := i.readCurrentSnapshot()
	if err != nil {
		return Inventory{}, err
	}
	if err := verifyInventoryTree(snapshot, inventory); err != nil {
		return Inventory{}, err
	}
	return inventory, nil
}
func verifyInventoryTree(snapshot string, inventory Inventory) error {
	pluginsRoot := filepath.Join(snapshot, "plugins")
	if err := verifyPluginRoots(pluginsRoot, inventory); err != nil {
		return err
	}
	for _, plugin := range inventory.Plugins {
		if err := verifyPluginTree(filepath.Join(pluginsRoot, filepath.FromSlash(plugin.Name)), plugin); err != nil {
			return err
		}
	}
	return nil
}

func verifyPluginRoots(root string, inventory Inventory) error {
	unscoped, scoped := expectedPluginRoots(inventory)
	entries, err := os.ReadDir(root)
	if err != nil {
		return fmt.Errorf("read installed plugin roots: %w", err)
	}
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return ErrInventoryTampered
		}
		if packages, isScoped := scoped[entry.Name()]; isScoped {
			if err := verifyScopedPackageParent(filepath.Join(root, entry.Name()), packages); err != nil {
				return err
			}
			continue
		}
		if !unscoped[entry.Name()] {
			return ErrInventoryTampered
		}
	}
	return nil
}

func expectedPluginRoots(inventory Inventory) (map[string]bool, map[string]map[string]bool) {
	unscoped := make(map[string]bool)
	scoped := make(map[string]map[string]bool)
	for _, plugin := range inventory.Plugins {
		parts := strings.Split(plugin.Name, "/")
		if len(parts) == 1 {
			unscoped[parts[0]] = true
			continue
		}
		if scoped[parts[0]] == nil {
			scoped[parts[0]] = make(map[string]bool)
		}
		scoped[parts[0]][parts[1]] = true
	}
	return unscoped, scoped
}

func verifyScopedPackageParent(root string, expected map[string]bool) error {
	entries, err := os.ReadDir(root)
	if err != nil {
		return fmt.Errorf("read scoped plugin parent: %w", err)
	}
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() || !expected[entry.Name()] {
			return ErrInventoryTampered
		}
	}
	return nil
}
func verifyPluginTree(root string, plugin Plugin) error {
	files, directories, err := hashInstalledTree(root)
	if err != nil {
		return err
	}
	if hashTree(files) != plugin.TreeSHA256 || !sameFileHashes(files, plugin.Files) || !sameDirectories(directories, plugin.Files) {
		return ErrInventoryTampered
	}
	return nil
}

func hashInstalledTree(root string) ([]FileHash, map[string]bool, error) {
	files := make([]FileHash, 0)
	directories := make(map[string]bool)
	err := filepath.WalkDir(root, func(fullPath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 || (!entry.IsDir() && !entry.Type().IsRegular()) {
			return ErrInventoryTampered
		}
		relative, err := filepath.Rel(root, fullPath)
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if relative != "." {
				directories[filepath.ToSlash(relative)] = true
			}
			return nil
		}
		content, err := os.ReadFile(fullPath)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(content)
		files = append(files, FileHash{Path: filepath.ToSlash(relative), SHA256: hex.EncodeToString(sum[:])})
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("hash installed plugin tree: %w", err)
	}
	return files, directories, nil
}

func sameDirectories(actual map[string]bool, files []FileHash) bool {
	expected := make(map[string]bool)
	for _, file := range files {
		directory := filepath.ToSlash(filepath.Dir(file.Path))
		for directory != "." {
			expected[directory] = true
			directory = filepath.ToSlash(filepath.Dir(directory))
		}
	}
	if len(actual) != len(expected) {
		return false
	}
	for directory := range expected {
		if !actual[directory] {
			return false
		}
	}
	return true
}
func sameFileHashes(left, right []FileHash) bool {
	if len(left) != len(right) {
		return false
	}
	sort.Slice(left, func(a, b int) bool { return left[a].Path < left[b].Path })
	sort.Slice(right, func(a, b int) bool { return right[a].Path < right[b].Path })
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
