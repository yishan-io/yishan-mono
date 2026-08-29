package plugins

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
)

const signingKeyName = ".plugins.signing-key"

// LoadOrCreateSigningKey returns the daemon-local key used for plugin locks.
func LoadOrCreateSigningKey(ctx context.Context, root string) (ed25519.PrivateKey, error) {
	canonicalRoot, err := canonicalPluginRoot(root)
	if err != nil {
		return nil, err
	}
	lock, err := waitForPluginLock(ctx, canonicalRoot)
	if err != nil {
		return nil, err
	}
	defer lock.Release()
	return loadOrCreateSigningKey(canonicalRoot)
}

func loadOrCreateSigningKey(root string) (ed25519.PrivateKey, error) {
	path := filepath.Join(root, signingKeyName)
	key, err := os.ReadFile(path)
	if err == nil {
		return validateSigningKey(key)
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("read plugin signing key: %w", err)
	}
	return createSigningKey(root, path)
}

func validateSigningKey(key []byte) (ed25519.PrivateKey, error) {
	if len(key) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid DSH plugin signing key")
	}
	return ed25519.PrivateKey(key), nil
}

func createSigningKey(root, path string) (ed25519.PrivateKey, error) {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create plugin root: %w", err)
	}
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate plugin signing key: %w", err)
	}
	if err := writeAtomic(path, key, 0o600); err != nil {
		return nil, err
	}
	return key, nil
}
