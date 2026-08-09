package setup

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"yishan/apps/cli/internal/config"
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
// when not installed or absent).
type PiExtensionInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Source      string `json:"source"`
	Version     string `json:"version"`
	Official    bool   `json:"official"`
	Installed   bool   `json:"installed"`
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

// packageEntrySource extracts the source spec from a packages array entry:
// plain strings pass through, object entries ({source, filter}) normalize to
// their source field. Empty for entries that are neither.
func packageEntrySource(raw json.RawMessage) string {
	var source string
	if err := json.Unmarshal(raw, &source); err == nil {
		return strings.TrimSpace(source)
	}
	var entry struct {
		Source string `json:"source"`
	}
	if err := json.Unmarshal(raw, &entry); err != nil {
		return ""
	}
	return strings.TrimSpace(entry.Source)
}

// extensionNameFromSource derives the display name from a pi source spec:
// npm: specs keep the npm package name (scope included, version pins
// stripped); git:/https:/local specs fall back to the last path segment.
func extensionNameFromSource(source string) string {
	if strings.HasPrefix(source, "npm:") {
		return stripVersionPin(strings.TrimPrefix(source, "npm:"))
	}
	spec := source
	for _, prefix := range []string{"git:", "https://", "http://"} {
		spec = strings.TrimPrefix(spec, prefix)
	}
	spec = stripVersionPin(spec)
	return strings.TrimSuffix(filepath.Base(spec), ".git")
}

// stripVersionPin removes a trailing @version/@ref pin (pkg@1.2.3, repo@v1)
// while keeping scoped package names (@scope/pkg) and scp-style git hosts
// (git@host:path) intact: the pin is only stripped when the part after the
// last @ contains no path separator.
func stripVersionPin(spec string) string {
	if at := strings.LastIndex(spec, "@"); at > 0 && !strings.Contains(spec[at+1:], "/") {
		return spec[:at]
	}
	return spec
}

// isDefaultPiExtensionName reports whether name is one of the managed default
// extensions.
func isDefaultPiExtensionName(name string) bool {
	for _, candidate := range defaultPiExtensionNames {
		if candidate == name {
			return true
		}
	}
	return false
}

// isExtensionPackageInstalled reports whether the package for source has an
// installed package.json in its managed install dir.
func isExtensionPackageInstalled(name string, source string) bool {
	pkgDir, err := extensionPackageDir(name, source)
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(pkgDir, "package.json"))
	return err == nil
}

// installedExtensionVersion reads the installed version of a package from its
// package.json; empty when not installed.
func installedExtensionVersion(name string, source string) string {
	pkgDir, err := extensionPackageDir(name, source)
	if err != nil {
		return ""
	}
	return packageVersion(pkgDir)
}

// installedExtensionDescription reads the installed package's description
// from its package.json; empty when not installed or absent.
func installedExtensionDescription(name string, source string) string {
	pkgDir, err := extensionPackageDir(name, source)
	if err != nil {
		return ""
	}
	return packageDescription(pkgDir)
}

// packageDescription reads the description of an installed package: the
// package.json description field, falling back to the first non-title line of
// the package's README.md when it is absent (the official @yishan-io packages
// ship no package.json description).
func packageDescription(pkgDir string) string {
	content, err := os.ReadFile(filepath.Join(pkgDir, "package.json"))
	if err == nil {
		var metadata struct {
			Description string `json:"description"`
		}
		if err := json.Unmarshal(content, &metadata); err == nil {
			if description := strings.TrimSpace(metadata.Description); description != "" {
				return description
			}
		}
	}
	return readmeSummary(pkgDir)
}

// readmeSummary extracts the first non-title content line of README.md as a
// one-line description (the line right after the leading # heading).
func readmeSummary(pkgDir string) string {
	content, err := os.ReadFile(filepath.Join(pkgDir, "README.md"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		trimmed = strings.TrimPrefix(trimmed, "-")
		trimmed = strings.TrimSpace(trimmed)
		if trimmed == "" {
			continue
		}
		if len(trimmed) > 200 {
			trimmed = trimmed[:200]
		}
		return trimmed
	}
	return ""
}

// extensionPackageDir resolves the managed install directory for a package
// source spec, mirroring pi's layout: npm specs under npm/node_modules, git
// specs under git/<host>/<path>. Unsupported specs (local paths, extensions
// array entries) have no install dir.
func extensionPackageDir(name string, source string) (string, error) {
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(source, "npm:") {
		npmRoot := filepath.Join(agentDir, "npm", "node_modules")
		return filepath.Join(npmRoot, filepath.FromSlash(name)), nil
	}
	if strings.HasPrefix(source, "git:") {
		host, path := parseGitSourceParts(strings.TrimPrefix(source, "git:"))
		if host == "" || path == "" {
			return "", fmt.Errorf("cannot resolve install dir for source %q", source)
		}
		return filepath.Join(agentDir, "git", host, filepath.FromSlash(path)), nil
	}
	return "", fmt.Errorf("source %q has no managed install dir", source)
}

// parseGitSourceParts splits a git repo spec (the part after "git:") into its
// host and path, mirroring pi's managed layout git/<host>/<path>. Shorthand
// owner/repo specs default to github.com (pi's hosted-git-info behavior);
// https/ssh/git URLs and scp-style git@host:path specs keep their host.
func parseGitSourceParts(spec string) (host string, path string) {
	repo := stripVersionPin(spec)
	if u, err := url.Parse(repo); err == nil && u.Host != "" {
		switch u.Scheme {
		case "https", "http", "ssh", "git":
			return u.Hostname(), strings.TrimPrefix(u.Path, "/")
		}
	}
	if scpHost, scpPath, ok := strings.Cut(repo, ":"); ok && strings.HasPrefix(scpHost, "git@") {
		return strings.TrimPrefix(scpHost, "git@"), scpPath
	}
	slashHost, slashPath, found := strings.Cut(repo, "/")
	if !found || slashHost == "" || slashPath == "" {
		return "", ""
	}
	if !strings.Contains(slashHost, ".") && slashHost != "localhost" {
		// owner/repo shorthand without a host — pi's hosted-git-info defaults
		// to github.com for these.
		return "github.com", strings.TrimSuffix(repo, ".git")
	}
	return slashHost, strings.TrimSuffix(slashPath, ".git")
}
