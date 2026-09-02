package plugins

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	localLockName           = "local-bundles.lock.json"
	localPluginManifestName = "yishan.plugin.json"
)

var ErrDeveloperModeRequired = errors.New("DSH Developer Mode is required for local bundles")

type LocalBundle struct {
	ID         string        `json:"id"`
	Root       string        `json:"root"`
	TreeSHA256 string        `json:"treeSha256"`
	Entries    []PluginEntry `json:"entries"`
}

// LocalSnapshot preserves the complete local lock state for a failed runtime reload.
type LocalSnapshot struct {
	content []byte
	exists  bool
}
type localLock struct {
	Version int           `json:"version"`
	Bundles []LocalBundle `json:"bundles"`
}
type LocalStore struct {
	root            string
	isDeveloperMode bool
}

// NewLocalStore creates the separate, unsigned store for explicit developer registrations.
func NewLocalStore(root string, isDeveloperMode bool) (*LocalStore, error) {
	if strings.TrimSpace(root) == "" || !filepath.IsAbs(root) {
		return nil, errors.New("DSH local bundle root must be absolute")
	}
	return &LocalStore{root: root, isDeveloperMode: isDeveloperMode}, nil
}

// List returns explicit registrations only while Developer Mode is enabled.
func (s *LocalStore) List() ([]LocalBundle, error) {
	if !s.isDeveloperMode {
		return nil, ErrDeveloperModeRequired
	}
	lock, err := s.read()
	if os.IsNotExist(err) {
		return []LocalBundle{}, nil
	}
	if err != nil {
		return nil, err
	}
	return lock.Bundles, nil
}

// CaptureSnapshot saves the current local lock before a mutation.
func (s *LocalStore) CaptureSnapshot() (LocalSnapshot, error) {
	if !s.isDeveloperMode {
		return LocalSnapshot{}, ErrDeveloperModeRequired
	}
	content, err := os.ReadFile(filepath.Join(s.root, localLockName))
	if os.IsNotExist(err) {
		return LocalSnapshot{}, nil
	}
	if err != nil {
		return LocalSnapshot{}, err
	}
	return LocalSnapshot{content: content, exists: true}, nil
}

// RestoreSnapshot restores the local lock state after a failed runtime reload.
func (s *LocalStore) RestoreSnapshot(snapshot LocalSnapshot) error {
	if !s.isDeveloperMode {
		return ErrDeveloperModeRequired
	}
	path := filepath.Join(s.root, localLockName)
	if !snapshot.exists {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove local bundle lock: %w", err)
		}
		return nil
	}
	if err := os.MkdirAll(s.root, 0o700); err != nil {
		return fmt.Errorf("create local bundle store: %w", err)
	}
	return writeAtomic(path, snapshot.content, 0o600)
}

// Register verifies a local directory and records its complete immutable inventory.
func (s *LocalStore) Register(id, root string) ([]LocalBundle, error) {
	if !s.isDeveloperMode {
		return nil, ErrDeveloperModeRequired
	}
	if err := os.MkdirAll(s.root, 0o700); err != nil {
		return nil, fmt.Errorf("create local bundle store: %w", err)
	}
	if !isLocalID(id) {
		return nil, errors.New("invalid local bundle id")
	}
	bundle, err := buildLocalBundle(id, root)
	if err != nil {
		return nil, err
	}
	lock, err := s.read()
	if os.IsNotExist(err) {
		lock = localLock{Version: 1}
	} else if err != nil {
		return nil, err
	}
	lock.Bundles = replaceLocalBundle(lock.Bundles, bundle)
	return lock.Bundles, s.write(lock)
}

// Remove deletes a previously explicit local registration.
func (s *LocalStore) Remove(id string) ([]LocalBundle, error) {
	if !s.isDeveloperMode {
		return nil, ErrDeveloperModeRequired
	}
	if !isLocalID(id) {
		return nil, errors.New("invalid local bundle id")
	}
	lock, err := s.read()
	if err != nil {
		return nil, err
	}
	bundles := make([]LocalBundle, 0, len(lock.Bundles))
	found := false
	for _, bundle := range lock.Bundles {
		if bundle.ID == id {
			found = true
		} else {
			bundles = append(bundles, bundle)
		}
	}
	if !found {
		return nil, ErrBundleNotFound
	}
	lock.Bundles = bundles
	return bundles, s.write(lock)
}

func (s *LocalStore) read() (localLock, error) {
	content, err := os.ReadFile(filepath.Join(s.root, localLockName))
	if err != nil {
		return localLock{}, err
	}
	var lock localLock
	if err := json.Unmarshal(content, &lock); err != nil {
		return localLock{}, fmt.Errorf("decode local bundle lock: %w", err)
	}
	if lock.Version != 1 {
		return localLock{}, errors.New("invalid local bundle lock")
	}
	return lock, nil
}
func (s *LocalStore) write(lock localLock) error {
	sort.Slice(lock.Bundles, func(i, j int) bool { return lock.Bundles[i].ID < lock.Bundles[j].ID })
	content, err := json.Marshal(lock)
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(s.root, localLockName), content, 0o600)
}
func buildLocalBundle(id, root string) (LocalBundle, error) {
	canonical, err := filepath.EvalSymlinks(root)
	if err != nil {
		return LocalBundle{}, fmt.Errorf("resolve local bundle: %w", err)
	}
	info, err := os.Stat(canonical)
	if err != nil || !info.IsDir() {
		return LocalBundle{}, errors.New("local bundle must be a directory")
	}
	entries, err := readLocalPluginEntries(canonical)
	if err != nil {
		return LocalBundle{}, err
	}
	files, err := hashLocalTree(canonical)
	if err != nil {
		return LocalBundle{}, err
	}
	return LocalBundle{ID: id, Root: canonical, TreeSHA256: hashTree(files), Entries: entries}, nil
}
func readLocalPluginEntries(root string) ([]PluginEntry, error) {
	file, err := os.Open(filepath.Join(root, localPluginManifestName))
	if err != nil {
		return nil, ErrBundleNotLoadable
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var manifest struct {
		Version int           `json:"version"`
		Entries []PluginEntry `json:"entries"`
	}
	if err := decoder.Decode(&manifest); err != nil || manifest.Version != 1 {
		return nil, ErrBundleNotLoadable
	}
	entries, err := validatePluginEntries(manifest.Entries)
	if err != nil || validatePluginEntrypoints(root, entries) != nil {
		return nil, ErrBundleNotLoadable
	}
	return entries, nil
}

func hashLocalTree(root string) ([]FileHash, error) {
	files := []FileHash{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 || (!entry.IsDir() && !entry.Type().IsRegular()) {
			return ErrInvalidArchive
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(content)
		files = append(files, FileHash{Path: filepath.ToSlash(relative), SHA256: hex.EncodeToString(sum[:])})
		return nil
	})
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, err
}
func replaceLocalBundle(bundles []LocalBundle, replacement LocalBundle) []LocalBundle {
	updated := []LocalBundle{}
	for _, bundle := range bundles {
		if bundle.ID != replacement.ID {
			updated = append(updated, bundle)
		}
	}
	return append(updated, replacement)
}
func isLocalID(id string) bool {
	if len(id) == 0 || len(id) > 64 {
		return false
	}
	for index, char := range id {
		if !(char == '.' || char == '-' || char == '_' || char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9') || (index == 0 && (char == '.' || char == '-' || char == '_')) {
			return false
		}
	}
	return true
}
