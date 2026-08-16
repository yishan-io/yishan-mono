package setup

import (
	"context"
	"path/filepath"
	"sort"
)

// PiExtensionSourceLocalFile labels settings.json extensions array entries
// (local .ts files or directories). Local-file extensions are loaded by path,
// so they are read-only from the daemon's perspective: they carry no
// install/remove/update action.
const PiExtensionSourceLocalFile = "local file"

// PiExtensionInfo describes one extension configured in the pi agent
// settings.json. Source is the pi package spec (npm:, git:, https:, local
// path) or PiExtensionSourceLocalFile for extensions array entries;
// Description is the installed package's package.json description (empty
// when not installed or absent). LatestVersion/HasUpdate are filled by
// CheckPiExtensionUpdates.
type PiExtensionInfo struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	Source        string `json:"source"`
	Version       string `json:"version"`
	LatestVersion string `json:"latestVersion"`
	HasUpdate     bool   `json:"hasUpdate"`
	Official      bool   `json:"official"`
	Installed     bool   `json:"installed"`
}

// ListPiExtensions enumerates the extensions pi would load from the agent
// settings.json: packages array entries (plain source strings or {source,
// filter} objects, normalized by source) plus extensions array entries (local
// file/dir paths, listed read-only). Package entries report Installed and
// Version from the managed install dirs (npm node_modules for npm specs, the
// git tree for git specs); official extensions missing from settings are still
// listed with Installed: false so the UI can offer to install them. Results
// are deterministic: official extensions first, then name order, deduplicated
// by source spec (pi itself matches removals by source identity).
func ListPiExtensions() ([]PiExtensionInfo, error) {
	settings, err := agentSettingsLoader()
	if err != nil {
		return nil, err
	}

	extensions := make([]PiExtensionInfo, 0, len(settings.Packages)+len(settings.Extensions)+len(defaultPiExtensionNames))
	seenSources := make(map[string]bool, len(settings.Packages))
	seenLocalNames := make(map[string]bool, len(settings.Extensions))

	for _, raw := range settings.Packages {
		source := packageEntrySource(raw)
		if source == "" || seenSources[source] {
			continue
		}
		seenSources[source] = true
		name := extensionNameFromSource(source)
		extensions = append(extensions, PiExtensionInfo{
			Name:        name,
			Description: installedExtensionDescription(name, source),
			Source:      source,
			Version:     installedExtensionVersion(name, source),
			Official:    isDefaultPiExtensionName(name),
			Installed:   isExtensionPackageInstalled(name, source),
		})
	}

	for _, path := range settings.Extensions {
		name := filepath.Base(path)
		if seenLocalNames[name] {
			continue
		}
		seenLocalNames[name] = true
		extensions = append(extensions, PiExtensionInfo{
			Name:      name,
			Source:    PiExtensionSourceLocalFile,
			Installed: true,
		})
	}

	for _, name := range defaultPiExtensionNames {
		source := piExtensionInstallSource(name)
		if seenSources[source] {
			continue
		}
		extensions = append(extensions, PiExtensionInfo{
			Name:      name,
			Source:    source,
			Official:  true,
			Installed: false,
		})
	}

	sort.Slice(extensions, func(i, j int) bool {
		if extensions[i].Official != extensions[j].Official {
			return extensions[i].Official
		}
		return extensions[i].Name < extensions[j].Name
	})
	return extensions, nil
}

// InstallPiExtension installs a pi package source spec (npm:, git:, https:,
// or a local path) via `pi install`.
func InstallPiExtension(ctx context.Context, source string) error {
	return runPiCommand(ctx, "install", source)
}

// RemovePiExtension uninstalls a package by its full source spec (e.g.
// "npm:pi-web-fetch") via `pi uninstall`. pi matches removals by source
// identity, so a bare package name is not a valid target.
func RemovePiExtension(ctx context.Context, source string) error {
	return runPiCommand(ctx, "uninstall", source)
}

// UpdatePiExtension re-runs `pi install` on the same source spec so pi
// re-fetches the package at its latest version.
func UpdatePiExtension(ctx context.Context, source string) error {
	return runPiCommand(ctx, "install", source)
}

// EnsureDefaultPiExtensions installs every official extension. Setup runs
// outside the RPC request lifecycle, so it uses a background context; the
// RPC-facing mutations receive the caller's context.
func EnsureDefaultPiExtensions() error {
	return installPiExtensions(context.Background(), defaultPiExtensionNames)
}

func RemoveDefaultPiExtensions() error {
	return removePiExtensions(context.Background(), defaultPiExtensionNames)
}

func DefaultPiExtensionNames() []string {
	return append([]string(nil), defaultPiExtensionNames...)
}

func installPiExtensions(ctx context.Context, names []string) error {
	for _, name := range names {
		if err := InstallPiExtension(ctx, piExtensionInstallSource(name)); err != nil {
			return err
		}
	}
	return nil
}

func removePiExtensions(ctx context.Context, names []string) error {
	for _, name := range names {
		// pi uninstall matches by source identity, so the npm: prefix is
		// required — a bare package name never matches (pi reports "No
		// matching package found").
		if err := RemovePiExtension(ctx, piExtensionInstallSource(name)); err != nil {
			return err
		}
	}
	return nil
}

// isManagedPiExtensionInstalled reports whether a default extension is
// installed, using the same rule as the catalog (the package.json presence in
// the managed install dirs). The reconcile state reuses this single
// installed-state rule instead of owning a second discovery check.
func isManagedPiExtensionInstalled(name string) bool {
	return isExtensionPackageInstalled(name, piExtensionInstallSource(name))
}
