package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/config"
)

// enumeratePackageSkills scans the skills/ dirs of every package listed in
// the agent settings.json packages array (npm: prefix stripped). Package
// entries may be plain strings or objects ({source, filter}); only string
// sources are enumerated.
func enumeratePackageSkills() ([]DiscoveredSkill, error) {
	settings, err := agentSettingsLoader()
	if err != nil {
		return nil, err
	}
	npmRoot, err := npmPackagesRootResolver()
	if err != nil {
		return nil, err
	}
	var skills []DiscoveredSkill
	for _, raw := range settings.Packages {
		var pkgName string
		if err := json.Unmarshal(raw, &pkgName); err != nil {
			continue // object entries with filters are not enumerated
		}
		pkgName = strings.TrimSpace(strings.TrimPrefix(pkgName, "npm:"))
		if pkgName == "" {
			continue
		}
		pkgDir := filepath.Join(npmRoot, filepath.FromSlash(pkgName))
		if _, err := os.Stat(pkgDir); err != nil {
			continue // package not installed — nothing to scan
		}
		pkgSkills, err := scanPackageSkills(pkgDir, pkgName)
		if err != nil {
			return nil, err
		}
		skills = append(skills, pkgSkills...)
	}
	return skills, nil
}

// scanPackageSkills collects skills from one installed package: the pi
// manifest's skills entries when present, otherwise the conventional
// <pkg>/skills/ directory. Scanning mirrors pi's collectSkillEntries with
// mode "pi" — SKILL.md at a dir root is one skill, root-level .md files
// count, subdirectories recurse.
func scanPackageSkills(pkgDir, pkgName string) ([]DiscoveredSkill, error) {
	manifest, err := readPiManifestSkills(pkgDir)
	if err != nil {
		return nil, err
	}
	var roots []string
	if manifest != nil {
		for _, entry := range manifest {
			if isOverridePattern(entry) || hasGlobPattern(entry) {
				continue // override/glob entries are not plain skill paths
			}
			roots = append(roots, filepath.Join(pkgDir, filepath.FromSlash(entry)))
		}
	} else {
		roots = append(roots, filepath.Join(pkgDir, "skills"))
	}
	var skills []DiscoveredSkill
	for _, root := range roots {
		rootSkills, err := scanPackageSkillPath(root, pkgName, pkgDir)
		if err != nil {
			return nil, err
		}
		skills = append(skills, rootSkills...)
	}
	return skills, nil
}

func scanPackageSkillPath(path, pkgName, pkgDir string) ([]DiscoveredSkill, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, nil // missing skill path in a package is not an error
	}
	if !info.IsDir() {
		if strings.HasSuffix(path, ".md") {
			if skill, ok := loadSkillFile(path, SkillSourcePackage); ok {
				skill.Source = pkgName
				return []DiscoveredSkill{skill}, nil
			}
		}
		return nil, nil
	}
	version := packageVersion(pkgDir)
	skills, err := scanSkillDir(path, SkillSourcePackage, true)
	if err != nil {
		return nil, err
	}
	for idx := range skills {
		skills[idx].Version = version
		skills[idx].Source = pkgName
	}
	return skills, nil
}

func readPiManifestSkills(pkgDir string) ([]string, error) {
	content, err := os.ReadFile(filepath.Join(pkgDir, "package.json"))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var manifest struct {
		Pi struct {
			Skills []string `json:"skills"`
		} `json:"pi"`
	}
	if err := json.Unmarshal(content, &manifest); err != nil {
		return nil, fmt.Errorf("decode package.json for %s: %w", pkgDir, err)
	}
	return manifest.Pi.Skills, nil
}

func packageVersion(pkgDir string) string {
	content, err := os.ReadFile(filepath.Join(pkgDir, "package.json"))
	if err != nil {
		return ""
	}
	var metadata struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(content, &metadata); err != nil {
		return ""
	}
	return metadata.Version
}

func isOverridePattern(entry string) bool {
	return strings.HasPrefix(entry, "!") || strings.HasPrefix(entry, "+") || strings.HasPrefix(entry, "-")
}

func hasGlobPattern(entry string) bool {
	return strings.Contains(entry, "*") || strings.Contains(entry, "?")
}

// scanSettingsSkills resolves the settings.json skills array entries (file or
// dir paths) as additional skill sources. In pi's precedence they rank above
// the auto-discovered user dirs and packages.
func scanSettingsSkills() ([]DiscoveredSkill, error) {
	settings, err := agentSettingsLoader()
	if err != nil {
		return nil, err
	}
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, err
	}
	var skills []DiscoveredSkill
	for _, raw := range settings.Skills {
		resolved := resolveSettingsSkillPath(raw, agentDir)
		info, statErr := os.Stat(resolved)
		if statErr != nil {
			continue
		}
		if info.IsDir() {
			dirSkills, err := scanSkillDir(resolved, SkillSourceSettings, true)
			if err != nil {
				return nil, err
			}
			skills = append(skills, dirSkills...)
			continue
		}
		if strings.HasSuffix(resolved, ".md") {
			if skill, ok := loadSkillFile(resolved, SkillSourceSettings); ok {
				skills = append(skills, skill)
			}
		}
	}
	return skills, nil
}

// resolveSettingsSkillPath resolves a settings.json skills entry the same way
// pi does: absolute paths and ~/ expansions pass through, relative paths are
// joined to the agent home dir.
func resolveSettingsSkillPath(raw, agentDir string) string {
	trimmed := strings.TrimSpace(raw)
	home, _ := os.UserHomeDir()
	switch {
	case trimmed == "~":
		return home
	case strings.HasPrefix(trimmed, "~/"):
		return filepath.Join(home, trimmed[2:])
	case filepath.IsAbs(trimmed):
		return filepath.Clean(trimmed)
	default:
		return filepath.Join(agentDir, filepath.FromSlash(trimmed))
	}
}
