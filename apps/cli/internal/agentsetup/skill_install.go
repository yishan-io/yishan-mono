package setup

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"yishan/apps/cli/internal/config"
)

type skillDefinition struct {
	Name        string
	Description string
	Version     string
	Source      string
	SourceKind  SkillSourceKind
	Official    bool
	Files       map[string][]byte
}

func AddSkill(source string) (*SkillInstallResult, error) {
	definition, err := resolveSkillDefinition(source)
	if err != nil {
		return nil, err
	}
	result, err := installSkillDefinition(definition)
	if err != nil {
		return nil, err
	}
	if err := upsertInstalledSkill(InstalledSkillRecord{
		Name:        definition.Name,
		Description: definition.Description,
		Version:     definition.Version,
		Source:      definition.Source,
		SourceKind:  definition.SourceKind,
		Official:    definition.Official,
	}); err != nil {
		return nil, err
	}
	if definition.Official && hasOpenCodeCommand(definition.Name) {
		if err := EnsureOpenCodeCommand(definition.Name); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func RemoveSkill(name string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return fmt.Errorf("skill name is required")
	}
	if err := removeSkillMaterialization(trimmed); err != nil {
		return err
	}
	if err := removeInstalledSkill(trimmed); err != nil {
		return err
	}
	if hasOpenCodeCommand(trimmed) {
		return RemoveOpenCodeCommand(trimmed)
	}
	return nil
}

func UpdateSkill(name string) (*SkillInstallResult, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("skill name is required")
	}
	if isOfficialSkillName(trimmed) {
		return AddSkill(trimmed)
	}
	record, err := installedSkillRecord(trimmed)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, fmt.Errorf("skill %q is not installed", trimmed)
	}
	return AddSkill(record.Source)
}

func resolveSkillDefinition(source string) (*skillDefinition, error) {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" {
		return nil, fmt.Errorf("skill source is required")
	}
	if isOfficialSkillName(trimmed) {
		return officialSkillDefinition(trimmed)
	}
	if def, err := tryGitHubInstall(trimmed); err == nil {
		return def, nil
	} else if isGitHubSource(trimmed) {
		return nil, err
	}
	return nil, fmt.Errorf("skill source must be an official skill name, GitHub URL, or owner/repo shorthand")
}

func tryGitHubInstall(source string) (*skillDefinition, error) {
	owner, repo, ref, subPath, ok := parseGitHubSource(source)
	if !ok {
		return nil, fmt.Errorf("not a GitHub source")
	}
	cloneURL := fmt.Sprintf("https://github.com/%s/%s.git", owner, repo)
	cloneDir, err := os.MkdirTemp("", "yishan-skill-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(cloneDir)

	args := []string{"clone", "--depth=1", "--single-branch"}
	if ref != "" && ref != "HEAD" {
		args = append(args, "--branch="+ref)
	}
	args = append(args, cloneURL, cloneDir)
	if output, err := exec.Command("git", args...).CombinedOutput(); err != nil {
		return nil, fmt.Errorf("git clone: %s", string(output))
	}
	if subPath != "" {
		return readSkillDirDefinition(filepath.Join(cloneDir, subPath), source)
	}
	def, err := discoverSkillFromClone(cloneDir, source)
	if err == nil {
		return def, nil
	}
	return readSkillDirDefinition(cloneDir, source)
}

func isGitHubSource(source string) bool {
	_, _, _, _, ok := parseGitHubSource(source)
	return ok
}

func parseGitHubSource(source string) (owner, repo, ref, subPath string, ok bool) {
	for _, prefix := range []string{"https://github.com/", "http://github.com/"} {
		if !strings.HasPrefix(source, prefix) {
			continue
		}
		rest := strings.TrimPrefix(source, prefix)
		rest = strings.TrimSuffix(rest, ".git")
		parts := strings.SplitN(rest, "/", 4)
		if len(parts) < 2 {
			return
		}
		owner = parts[0]
		repo = parts[1]
		if len(parts) >= 3 && len(parts) >= 4 {
			ref = parts[3]
			if idx := strings.Index(ref, "/"); idx >= 0 {
				subPath = ref[idx+1:]
				ref = ref[:idx]
			}
		}
		ok = true
		return
	}
	if shorthandParts := strings.SplitN(source, "/", 2); len(shorthandParts) == 2 && !strings.Contains(shorthandParts[0], ".") {
		owner = shorthandParts[0]
		repo = shorthandParts[1]
		ok = true
	}
	return
}

func discoverSkillFromClone(cloneDir string, source string) (*skillDefinition, error) {
	skillDir := filepath.Join(cloneDir, "skills")
	if _, err := os.Stat(skillDir); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(skillDir)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(skillDir, entry.Name())
		skillPath := filepath.Join(dir, "SKILL.md")
		if _, err := os.Stat(skillPath); err == nil {
			return readSkillDirDefinition(dir, source)
		}
	}
	return nil, fmt.Errorf("no skills found in %s", cloneDir)
}

func readSkillDirDefinition(dir string, source string) (*skillDefinition, error) {
	files, err := readSkillDir(dir)
	if err != nil {
		return nil, err
	}
	return definitionFromFiles(source, SkillSourceURL, files)
}

func officialSkillDefinition(name string) (*skillDefinition, error) {
	trimmed := strings.TrimSpace(name)
	files, version, err := loadOfficialSkillFiles(trimmed)
	if err != nil {
		return nil, err
	}
	frontMatter := parseSkillFrontMatter(files["SKILL.md"])
	return &skillDefinition{
		Name:        trimmed,
		Description: frontMatter.Description,
		Version:     version,
		Source:      string(SkillSourceOfficial),
		SourceKind:  SkillSourceOfficial,
		Official:    true,
		Files:       files,
	}, nil
}

func definitionFromFiles(source string, sourceKind SkillSourceKind, files map[string][]byte) (*skillDefinition, error) {
	content, ok := files["SKILL.md"]
	if !ok {
		return nil, errors.New("skill source must contain SKILL.md")
	}
	frontMatter := parseSkillFrontMatter(content)
	name := strings.TrimSpace(frontMatter.Name)
	if name == "" {
		name = deriveSkillName(source)
	}
	if name == "" {
		return nil, fmt.Errorf("could not determine skill name from %q", source)
	}
	return &skillDefinition{
		Name:        name,
		Description: frontMatter.Description,
		Version:     "external",
		Source:      source,
		SourceKind:  sourceKind,
		Files:       files,
	}, nil
}

func deriveSkillName(source string) string {
	base := filepath.Base(source)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.TrimSpace(base)
	return strings.ReplaceAll(base, " ", "-")
}

func installSkillDefinition(definition *skillDefinition) (*SkillInstallResult, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve yishan home: %w", err)
	}
	skillDir := filepath.Join(yishanHome, "skills", definition.Name)
	if err := writeSkillFiles(skillDir, definition.Files); err != nil {
		return nil, err
	}
	symlinks, err := ensureAgentSkillSymlinks(skillDir, definition.Name)
	if err != nil {
		return nil, err
	}
	return &SkillInstallResult{SkillPath: filepath.Join(skillDir, "SKILL.md"), Symlinks: symlinks}, nil
}

func writeSkillFiles(skillDir string, files map[string][]byte) error {
	if err := os.RemoveAll(skillDir); err != nil {
		return fmt.Errorf("clear skill dir: %w", err)
	}
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return fmt.Errorf("create skill dir: %w", err)
	}
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, relPath := range paths {
		targetPath := filepath.Join(skillDir, filepath.FromSlash(relPath))
		if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
			return fmt.Errorf("create skill subdir: %w", err)
		}
		if err := os.WriteFile(targetPath, files[relPath], 0o644); err != nil {
			return fmt.Errorf("write skill file: %w", err)
		}
	}
	return nil
}

func ensureAgentSkillSymlinks(skillDir string, name string) ([]string, error) {
	linkDirs, err := agentSkillLinkDirs(name)
	if err != nil {
		return nil, err
	}
	symlinks := make([]string, 0, len(linkDirs))
	for _, linkDir := range linkDirs {
		if err := ensureSkillSymlink(linkDir, skillDir); err != nil {
			return nil, fmt.Errorf("symlink %s: %w", linkDir, err)
		}
		symlinks = append(symlinks, linkDir)
	}
	return symlinks, nil
}

func removeSkillMaterialization(name string) error {
	linkDirs, err := agentSkillLinkDirs(name)
	if err != nil {
		return err
	}
	for _, linkDir := range linkDirs {
		if err := removeSymlink(linkDir); err != nil {
			return err
		}
	}
	yishanHome, err := config.HomeDir()
	if err != nil {
		return fmt.Errorf("resolve yishan home: %w", err)
	}
	if err := os.RemoveAll(filepath.Join(yishanHome, "skills", name)); err != nil {
		return fmt.Errorf("remove skill dir: %w", err)
	}
	return nil
}

func removeSymlink(path string) error {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink == 0 {
		return fmt.Errorf("expected symlink at %s but found regular entry; refusing to remove", path)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove symlink %s: %w", path, err)
	}
	return nil
}

func agentSkillLinkDirs(name string) ([]string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve home dir: %w", err)
	}
	yishanHome, err := config.HomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve yishan home: %w", err)
	}
	return []string{
		filepath.Join(yishanHome, "opencode-config-home", "skills", name),
		filepath.Join(homeDir, ".claude", "skills", name),
		filepath.Join(homeDir, ".codex", "skills", name),
		filepath.Join(homeDir, ".agents", "skills", name),
	}, nil
}

func installedAgentsForSkill(name string) []string {
	linkDirs, err := agentSkillLinkDirs(name)
	if err != nil {
		return []string{}
	}
	agents := []string{}
	labels := []string{"opencode", "claude", "codex", "agents"}
	for idx, linkDir := range linkDirs {
		if info, statErr := os.Lstat(linkDir); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
			agents = append(agents, labels[idx])
		}
	}
	return agents
}

func hasOpenCodeCommand(name string) bool {
	_, ok := openCodeCommands[name]
	return ok
}
