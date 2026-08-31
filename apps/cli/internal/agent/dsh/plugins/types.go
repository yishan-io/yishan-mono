// Package plugins installs daemon-approved DSH npm bundles without invoking npm.
package plugins

import (
	"context"
	"crypto/ed25519"
	"errors"
	"path/filepath"
	"strings"
)

const (
	maxArchiveBytes      = 64 << 20
	maxDecompressedBytes = 256 << 20
	maxTarHeaders        = 10000
	maxTreeFiles         = 10000
)

var (
	ErrBundleNotAllowed  = errors.New("npm bundle is not daemon-approved")
	ErrInvalidArchive    = errors.New("invalid npm bundle archive")
	ErrInventoryTampered = errors.New("plugin inventory signature is invalid")
	ErrBundleNotLoadable = errors.New("npm bundle has an invalid Yishan plugin declaration")
	ErrBundleNotFound    = errors.New("DSH plugin bundle is not installed")
)

// Request identifies the exact npm package and version to install.
type Request struct{ Name, Version string }

// PluginEntry is one reviewed data-only Cordis declaration bound to a release.
type PluginEntry struct {
	ID         string `json:"id"`
	Entrypoint string `json:"entrypoint"`
	Config     any    `json:"config"`
	Disabled   bool   `json:"disabled"`
	Inject     any    `json:"inject"`
}

// ApprovedBundle binds one exact upstream release to reviewed Cordis entries.
type ApprovedBundle struct {
	Name, Version, Integrity string
	Entries                  []PluginEntry
}

// Bundle is the registry metadata for one npm tarball.
type Bundle struct{ Name, Version, TarballURL, Integrity string }

// Registry resolves a requested package to its registry metadata.
type Registry interface {
	ResolveBundle(context.Context, Request) (Bundle, error)
}

// Downloader retrieves a tarball. Implementations must honor ctx.
type Downloader interface {
	Download(context.Context, string) ([]byte, error)
}

// FileHash is one internal regular-file record used to calculate a tree hash.
type FileHash struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

// Plugin is an installed bundle in the signed inventory.
type Plugin struct {
	Name       string        `json:"name"`
	Version    string        `json:"version"`
	Enabled    bool          `json:"enabled"`
	TreeSHA256 string        `json:"treeSha256"`
	Entries    []PluginEntry `json:"entries"`
}

// Inventory is the deterministic lock data signed by the daemon.
type Inventory struct {
	Version int      `json:"version"`
	Plugins []Plugin `json:"plugins"`
}

// Snapshot identifies an immutable signed bundle snapshot for rollback.
type Snapshot struct{ name string }

// Installer owns bundle verification, extraction, promotion, and lock signing.
type Installer struct {
	root       string
	key        ed25519.PrivateKey
	approved   map[string]ApprovedBundle
	registry   Registry
	downloader Downloader
}

// NewInstaller creates an installer rooted at the daemon-owned DSH data directory.
func NewInstaller(root string, key ed25519.PrivateKey, approved []ApprovedBundle, registry Registry, downloader Downloader) (*Installer, error) {
	if len(key) != ed25519.PrivateKeySize {
		return nil, errors.New("invalid DSH plugin signing key")
	}
	if strings.TrimSpace(root) == "" || !filepath.IsAbs(root) {
		return nil, errors.New("DSH plugin root must be absolute")
	}
	if registry == nil || downloader == nil {
		return nil, errors.New("DSH plugin registry and downloader are required")
	}
	allowlist, err := buildAllowlist(approved)
	if err != nil {
		return nil, err
	}
	canonicalRoot, err := canonicalPluginRoot(root)
	if err != nil {
		return nil, err
	}
	return &Installer{root: canonicalRoot, key: key, approved: allowlist, registry: registry, downloader: downloader}, nil
}

func buildAllowlist(bundles []ApprovedBundle) (map[string]ApprovedBundle, error) {
	allowlist := make(map[string]ApprovedBundle, len(bundles))
	for _, bundle := range bundles {
		if err := validateRequest(Request{Name: bundle.Name, Version: bundle.Version}); err != nil || bundle.Integrity == "" {
			return nil, errors.New("invalid DSH plugin allowlist")
		}
		entries, err := validatePluginEntries(bundle.Entries)
		if err != nil {
			return nil, errors.New("invalid DSH plugin allowlist")
		}
		bundle.Entries = entries
		key := bundleKey(bundle.Name, bundle.Version)
		if _, exists := allowlist[key]; exists {
			return nil, errors.New("duplicate DSH plugin allowlist entry")
		}
		allowlist[key] = bundle
	}
	return allowlist, nil
}

func bundleKey(name, version string) string { return name + "@" + version }
