package setup

import (
	"encoding/json"
	"net/url"
	"path/filepath"
	"strings"
)

// Extension source-spec parsing: turning pi package source strings (npm:,
// git:, https:, local paths) and settings.json entries into display names,
// install sources, and managed dir keys. Registry access (extensions_registry.go)
// and installed-package metadata (extensions_metadata.go) build on these rules;
// nothing here touches the filesystem or the network.

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
