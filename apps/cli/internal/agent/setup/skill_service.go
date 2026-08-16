package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"yishan/apps/cli/internal/platform/config"
)

type SkillInfo struct {
	Name               string          `json:"name"`
	Description        string          `json:"description"`
	Version            string          `json:"version"`
	Source             string          `json:"source"`
	SourceKind         SkillSourceKind `json:"sourceKind"`
	Installed          bool            `json:"installed"`
	InstalledForAgents []string        `json:"installedForAgents"`
	Official           bool            `json:"official"`
	CanUpdate          bool            `json:"canUpdate"`
	HasUpdate          bool            `json:"hasUpdate"`
}

type SkillDetail struct {
	SkillInfo
	Files map[string]string `json:"files"`
}

type skillFrontMatter struct {
	Name        string
	Description string
}

// ListSkills returns every skill pi loads at runtime — discovered from all pi
// sources (project, agent-home, ~/.agents/skills, npm packages, settings).
// Ordering is deterministic: name ascending.
func ListSkills(workspaceRoot string) ([]SkillInfo, error) {
	discovered, err := EnumeratePiSkills(workspaceRoot)
	if err != nil {
		return nil, err
	}

	infos := make([]SkillInfo, 0, len(discovered))
	for _, skill := range discovered {
		infos = append(infos, buildDiscoveredSkillInfo(skill))
	}

	sort.SliceStable(infos, func(i, j int) bool {
		return infos[i].Name < infos[j].Name
	})

	return infos, nil
}

func GetSkillInfo(name string, workspaceRoot string) (*SkillInfo, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("skill name is required")
	}
	infos, err := ListSkills(workspaceRoot)
	if err != nil {
		return nil, err
	}
	for _, info := range infos {
		if info.Name == trimmed {
			infoCopy := info
			return &infoCopy, nil
		}
	}
	return nil, fmt.Errorf("unknown skill %q", trimmed)
}

func GetSkillDetail(name string, workspaceRoot string) (*SkillDetail, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("skill name is required")
	}
	info, err := GetSkillInfo(trimmed, workspaceRoot)
	if err != nil {
		return nil, err
	}
	fileMap, err := resolveSkillFiles(info, workspaceRoot)
	if err != nil {
		return nil, err
	}
	files := make(map[string]string, len(fileMap))
	for path, content := range fileMap {
		files[path] = string(content)
	}
	return &SkillDetail{SkillInfo: *info, Files: files}, nil
}

// resolveSkillFiles reads a skill's content from its real location: the
// discovered source path first, then the managed install dir (which holds
// skills materialized by the agent runtime). Root-level .md skills are served
// as single files (they have no SKILL.md), everything else as a full dir.
func resolveSkillFiles(info *SkillInfo, workspaceRoot string) (map[string][]byte, error) {
	discovered, ok := findDiscoveredSkill(info.Name, workspaceRoot)
	if ok {
		if filepath.Base(discovered.SourcePath) != "SKILL.md" {
			content, err := os.ReadFile(discovered.SourcePath)
			if err != nil {
				return nil, err
			}
			return map[string][]byte{filepath.Base(discovered.SourcePath): content}, nil
		}
		return readSkillDir(filepath.Dir(discovered.SourcePath))
	}
	return readInstalledSkillFiles(info.Name)
}

// findDiscoveredSkill returns the discovered skill record for name, if any
// pi source provides it.
func findDiscoveredSkill(name string, workspaceRoot string) (DiscoveredSkill, bool) {
	discovered, err := EnumeratePiSkills(workspaceRoot)
	if err != nil {
		return DiscoveredSkill{}, false
	}
	for _, skill := range discovered {
		if skill.Name == name {
			return skill, true
		}
	}
	return DiscoveredSkill{}, false
}

func buildDiscoveredSkillInfo(skill DiscoveredSkill) SkillInfo {
	return SkillInfo{
		Name:               skill.Name,
		Description:        skill.Description,
		Version:            skill.Version,
		Source:             skill.Source,
		SourceKind:         skill.SourceKind,
		Installed:          true,
		InstalledForAgents: installedAgentsForSkill(skill.Name),
		Official:           isOfficialPackageSkill(skill),
		CanUpdate:          false,
	}
}

// isOfficialPackageSkill reports whether a discovered skill ships inside an
// official @yishan-io package (installed via pi and updated through the
// extensions panel) as opposed to being user-installed via the skills CLI.
func isOfficialPackageSkill(skill DiscoveredSkill) bool {
	if skill.SourceKind != SkillSourcePackage {
		return false
	}
	npmRoot, err := npmPackagesRootResolver()
	if err != nil {
		return false
	}
	officialRoot := filepath.Join(npmRoot, "@yishan-io")
	return strings.HasPrefix(skill.SourcePath, officialRoot+string(filepath.Separator))
}

func readInstalledSkillFiles(name string) (map[string][]byte, error) {
	piSkillsDir, err := config.ManagedPiSkillsDir()
	if err != nil {
		return nil, fmt.Errorf("resolve managed pi skills dir: %w", err)
	}
	dir := filepath.Join(piSkillsDir, name)
	if _, statErr := os.Stat(filepath.Join(dir, "SKILL.md")); statErr != nil {
		return nil, fmt.Errorf("skill %q is not installed: %w", name, statErr)
	}
	return readSkillDir(dir)
}

// installedAgentsForSkill reports which agents load the skill. Pi is the only
// agent runtime the daemon manages skill surfaces for.
func installedAgentsForSkill(_name string) []string {
	return []string{"pi"}
}

func readSkillDir(dir string) (map[string][]byte, error) {
	files := make(map[string][]byte)
	err := filepath.Walk(dir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		relPath, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(relPath)] = content
		return nil
	})
	if err != nil {
		return nil, err
	}
	return files, nil
}

func parseSkillFrontMatter(content []byte) skillFrontMatter {
	lines := strings.Split(string(content), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return skillFrontMatter{}
	}
	meta := skillFrontMatter{}
	for i := 1; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed == "---" {
			break
		}
		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		// A YAML block-scalar indicator (|, >, plus chomping variants) means
		// the value continues on the following indented lines.
		if value == "" || isYAMLBlockScalarIndicator(value) {
			value, i = collectBlockScalar(lines, i)
		}
		value = trimQuotedValue(value)
		switch key {
		case "name":
			meta.Name = value
		case "description":
			meta.Description = value
		}
	}
	return meta
}
