package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"yishan/apps/cli/internal/platform/config"
)

// SkillSourceKind classifies where a skill lives. Skills are read-only from
// the daemon's perspective — they are installed via the pi ecosystem (npm
// packages, `npx skill add`) and enumerated here for the skill surfaces.
type SkillSourceKind string

const (
	SkillSourceProject  SkillSourceKind = "project"
	SkillSourceGlobal   SkillSourceKind = "global"
	SkillSourcePackage  SkillSourceKind = "package"
	SkillSourceSettings SkillSourceKind = "settings"
)

// DiscoveredSkill is one skill found in a pi source location. SourcePath is
// the absolute path to the skill file (SKILL.md or a root .md file); Source
// is a user-facing location label (package name for package skills).
type DiscoveredSkill struct {
	Name        string
	Description string
	Version     string
	Source      string
	SourcePath  string
	SourceKind  SkillSourceKind
}

// Root resolvers are injectable so tests can point them at temp dirs.
var (
	agentHomeSkillsRootResolver = defaultAgentHomeSkillsRootResolver
	userSkillsRootResolver      = defaultUserSkillsRootResolver
	npmPackagesRootResolver     = defaultNPMPackagesRootResolver
	agentSettingsLoader         = defaultAgentSettingsLoader
	trustStoreLoader            = defaultTrustStoreLoader
)

func defaultAgentHomeSkillsRootResolver() (string, error) {
	return config.ManagedPiSkillsDir()
}

func defaultUserSkillsRootResolver() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".agents", "skills"), nil
}

func defaultNPMPackagesRootResolver() (string, error) {
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(agentDir, "npm", "node_modules"), nil
}

// agentSettings mirrors the subset of pi's agent settings.json the daemon
// needs for skill discovery and extension management. Package entries can be
// plain strings or objects ({source, filter}); only string sources are
// enumerated. Extensions are local .ts/dir paths listed read-only.
type agentSettings struct {
	Packages   []json.RawMessage `json:"packages"`
	Skills     []string          `json:"skills"`
	Extensions []string          `json:"extensions"`
}

func defaultAgentSettingsLoader() (*agentSettings, error) {
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(filepath.Join(agentDir, "settings.json"))
	if os.IsNotExist(err) {
		return &agentSettings{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read agent settings: %w", err)
	}
	var settings agentSettings
	if err := json.Unmarshal(content, &settings); err != nil {
		return nil, fmt.Errorf("decode agent settings: %w", err)
	}
	return &settings, nil
}

// defaultTrustStoreLoader reads pi's trust store
// (~/.yishan/pi/agent/trust.json), which maps absolute project paths to a
// trust decision. Null entries mean "no decision recorded here".
func defaultTrustStoreLoader() (map[string]any, error) {
	agentDir, err := config.ManagedPiAgentDir()
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(filepath.Join(agentDir, "trust.json"))
	if os.IsNotExist(err) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read trust store: %w", err)
	}
	var data map[string]any
	if err := json.Unmarshal(content, &data); err != nil {
		return nil, fmt.Errorf("decode trust store: %w", err)
	}
	return data, nil
}

// EnumeratePiSkills returns every skill pi would load for a session rooted at
// workspaceRoot, mirroring pi's discovery precedence: project (trust-gated)
// → user settings skills array → agent-home skills dir → ~/.agents/skills →
// npm package skills, first-found-wins per name. Results are sorted by name.
// (pi also reads project-scope `.pi/settings.json` skills; the daemon does
// not, since it has no project settings store — a known fidelity gap.)
func EnumeratePiSkills(workspaceRoot string) ([]DiscoveredSkill, error) {
	var discovered []DiscoveredSkill
	appendAll := func(skills []DiscoveredSkill) {
		discovered = append(discovered, skills...)
	}

	if workspaceRoot != "" && isWorkspaceTrusted(workspaceRoot) {
		projectSkills, err := scanProjectSkills(workspaceRoot)
		if err != nil {
			return nil, err
		}
		appendAll(projectSkills)
	}

	settingsSkills, err := scanSettingsSkills()
	if err != nil {
		return nil, err
	}
	appendAll(settingsSkills)

	agentHomeSkills, err := scanAgentHomeSkills()
	if err != nil {
		return nil, err
	}
	appendAll(agentHomeSkills)

	userSkills, err := scanUserSkillsDir()
	if err != nil {
		return nil, err
	}
	appendAll(userSkills)

	packageSkills, err := enumeratePackageSkills()
	if err != nil {
		return nil, err
	}
	appendAll(packageSkills)

	return mergeDiscovered(discovered), nil
}

// isWorkspaceTrusted reports whether pi's trust store grants trust to
// workspaceRoot or one of its ancestors (nearest recorded decision wins).
// Paths are symlink-resolved to match how pi keys the store.
func isWorkspaceTrusted(workspaceRoot string) bool {
	trust, err := trustStoreLoader()
	if err != nil {
		return false
	}
	root, err := filepath.Abs(workspaceRoot)
	if err != nil {
		return false
	}
	if resolved, resolveErr := filepath.EvalSymlinks(root); resolveErr == nil {
		root = resolved
	}
	for {
		if decision, exists := trust[filepath.Clean(root)]; exists {
			trusted, isBool := decision.(bool)
			if isBool {
				return trusted
			}
		}
		parent := filepath.Dir(root)
		if parent == root {
			return false
		}
		root = parent
	}
}

// scanProjectSkills scans .pi/skills at the workspace root and .agents/skills
// at the root and every ancestor up to the git root (mirroring pi's
// collectAncestorAgentsSkillDirs). The user's own ~/.agents/skills dir is
// excluded so it is not double-counted as a project source.
func scanProjectSkills(workspaceRoot string) ([]DiscoveredSkill, error) {
	root, err := filepath.Abs(workspaceRoot)
	if err != nil {
		return nil, err
	}
	var skills []DiscoveredSkill

	piSkills, err := scanSkillDir(filepath.Join(root, ".pi", "skills"), SkillSourceProject, true)
	if err != nil {
		return nil, err
	}
	skills = append(skills, piSkills...)

	userAgentsDir, err := userSkillsRootResolver()
	if err != nil {
		return nil, err
	}
	for _, dir := range ancestorAgentsSkillDirs(root, userAgentsDir) {
		dirSkills, err := scanSkillDir(dir, SkillSourceProject, false)
		if err != nil {
			return nil, err
		}
		skills = append(skills, dirSkills...)
	}
	return skills, nil
}

// ancestorAgentsSkillDirs lists <dir>/.agents/skills for dir and its ancestors
// up to the git root (or the filesystem root when no git root exists),
// excluding the user-level ~/.agents/skills directory.
func ancestorAgentsSkillDirs(startDir, userAgentsDir string) []string {
	var dirs []string
	current := startDir
	for {
		dirs = append(dirs, filepath.Join(current, ".agents", "skills"))
		if isGitRoot(current) {
			break
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	userResolved := filepath.Clean(userAgentsDir)
	filtered := make([]string, 0, len(dirs))
	for _, dir := range dirs {
		if filepath.Clean(dir) != userResolved {
			filtered = append(filtered, dir)
		}
	}
	return filtered
}

func isGitRoot(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
}

func scanAgentHomeSkills() ([]DiscoveredSkill, error) {
	dir, err := agentHomeSkillsRootResolver()
	if err != nil {
		return nil, err
	}
	return scanSkillDir(dir, SkillSourceGlobal, true)
}

func scanUserSkillsDir() ([]DiscoveredSkill, error) {
	dir, err := userSkillsRootResolver()
	if err != nil {
		return nil, err
	}
	return scanSkillDir(dir, SkillSourceGlobal, false)
}

// scanSkillDir finds skills under dir, mirroring pi's collectSkillEntries: a
// SKILL.md at a directory's root makes that directory one skill root (no
// recursion past it); otherwise subdirectories are scanned recursively and,
// when allowRootMD is set, root-level .md files with skill frontmatter count
// as individual skills.
func scanSkillDir(dir string, kind SkillSourceKind, allowRootMD bool) ([]DiscoveredSkill, error) {
	if _, err := os.Stat(dir); err != nil {
		return nil, nil // missing source dirs are normal, not errors
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if entry.Name() != "SKILL.md" {
			continue
		}
		path := filepath.Join(dir, "SKILL.md")
		if entryIsFile(entry, path) {
			if skill, ok := loadSkillFile(path, kind); ok {
				return []DiscoveredSkill{skill}, nil
			}
			return nil, nil
		}
		// SKILL.md is not a file here — keep scanning for skill dirs.
	}
	var skills []DiscoveredSkill
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			continue
		}
		path := filepath.Join(dir, name)
		if entryIsDir(entry, path) {
			sub, err := scanSkillDir(path, kind, false)
			if err != nil {
				return nil, err
			}
			skills = append(skills, sub...)
			continue
		}
		if allowRootMD && strings.HasSuffix(name, ".md") {
			if skill, ok := loadSkillFile(path, kind); ok {
				skills = append(skills, skill)
			}
		}
	}
	return skills, nil
}

// entryIsDir follows symlinks when classifying a directory entry (pi stats
// symlinks the same way).
func entryIsDir(entry os.DirEntry, path string) bool {
	if entry.IsDir() {
		return true
	}
	if entry.Type()&os.ModeSymlink != 0 {
		if info, statErr := os.Stat(path); statErr == nil {
			return info.IsDir()
		}
	}
	return false
}

// entryIsFile follows symlinks when classifying a directory entry.
func entryIsFile(entry os.DirEntry, path string) bool {
	if entry.Type().IsRegular() {
		return true
	}
	if entry.Type()&os.ModeSymlink != 0 {
		if info, statErr := os.Stat(path); statErr == nil {
			return info.Mode().IsRegular()
		}
	}
	return false
}

// loadSkillFile parses one skill file. A file without a description in its
// frontmatter is not a loadable skill (pi skips those).
func loadSkillFile(path string, kind SkillSourceKind) (DiscoveredSkill, bool) {
	content, err := os.ReadFile(path)
	if err != nil {
		return DiscoveredSkill{}, false
	}
	frontMatter := parseSkillFrontMatter(content)
	if strings.TrimSpace(frontMatter.Description) == "" {
		return DiscoveredSkill{}, false
	}
	name := strings.TrimSpace(frontMatter.Name)
	if name == "" {
		// pi falls back to the parent directory name of the skill file.
		name = filepath.Base(filepath.Dir(path))
	}
	return DiscoveredSkill{
		Name:        name,
		Description: strings.TrimSpace(frontMatter.Description),
		Source:      filepath.Dir(path),
		SourcePath:  path,
		SourceKind:  kind,
	}, true
}

// mergeDiscovered dedupes by name keeping the first occurrence (sources are
// enumerated in pi precedence order) and returns a deterministic name-sorted
// list.
func mergeDiscovered(discovered []DiscoveredSkill) []DiscoveredSkill {
	byName := make(map[string]DiscoveredSkill, len(discovered))
	for _, skill := range discovered {
		if _, exists := byName[skill.Name]; exists {
			continue
		}
		byName[skill.Name] = skill
	}
	names := make([]string, 0, len(byName))
	for name := range byName {
		names = append(names, name)
	}
	sort.Strings(names)
	merged := make([]DiscoveredSkill, 0, len(names))
	for _, name := range names {
		merged = append(merged, byName[name])
	}
	return merged
}
