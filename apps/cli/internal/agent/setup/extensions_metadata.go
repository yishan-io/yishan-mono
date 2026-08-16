package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/platform/config"
)

// Installed-extension metadata: reading package.json / README state from the
// managed install dirs (npm node_modules for npm specs, the git tree for git
// specs). No registry access (extensions_registry.go) and no filesystem
// mutation live here.

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
