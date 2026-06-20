package setup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"yishan/apps/cli/internal/config"
)

type SkillSourceKind string

const (
	SkillSourceOfficial SkillSourceKind = "official"
	SkillSourceURL      SkillSourceKind = "url"
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

func OfficialSkillNames() []string {
	return []string{
		workspaceSkillName,
		memorySkillName,
		startSkillName,
		researchSkillName,
		planSkillName,
		buildSkillName,
		verifySkillName,
		doneSkillName,
	}
}

func ListSkills() ([]SkillInfo, error) {
	registry, err := loadSkillRegistry()
	if err != nil {
		return nil, err
	}

	installedByName := make(map[string]InstalledSkillRecord, len(registry.Skills))
	for _, record := range registry.Skills {
		installedByName[record.Name] = record
	}

	infos := make([]SkillInfo, 0, len(registry.Skills)+len(OfficialSkillNames()))
	for _, name := range OfficialSkillNames() {
		info := buildOfficialSkillInfo(name, installedByName[name])
		infos = append(infos, info)
	}

	for _, record := range registry.Skills {
		if isOfficialSkillName(record.Name) {
			continue
		}
		infos = append(infos, buildInstalledSkillInfo(record))
	}

	sort.SliceStable(infos, func(i, j int) bool {
		if infos[i].Official != infos[j].Official {
			return infos[i].Official
		}
		return infos[i].Name < infos[j].Name
	})

	return infos, nil
}

func GetSkillInfo(name string) (*SkillInfo, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("skill name is required")
	}
	infos, err := ListSkills()
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

func GetSkillDetail(name string) (*SkillDetail, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, fmt.Errorf("skill name is required")
	}
	info, err := GetSkillInfo(trimmed)
	if err != nil {
		return nil, err
	}
	var fileMap map[string][]byte
	if info.Official {
		fileMap, _, err = loadOfficialSkillFiles(trimmed)
	} else {
		fileMap, err = readInstalledSkillFiles(trimmed)
	}
	if err != nil {
		return nil, err
	}
	files := make(map[string]string, len(fileMap))
	for path, content := range fileMap {
		files[path] = string(content)
	}
	return &SkillDetail{SkillInfo: *info, Files: files}, nil
}

func readInstalledSkillFiles(name string) (map[string][]byte, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve yishan home: %w", err)
	}
	dir := filepath.Join(yishanHome, "skills", name)
	if _, statErr := os.Stat(filepath.Join(dir, "SKILL.md")); statErr != nil {
		return nil, fmt.Errorf("skill %q is not installed: %w", name, statErr)
	}
	return readSkillDir(dir)
}

func buildOfficialSkillInfo(name string, record InstalledSkillRecord) SkillInfo {
	files, version, err := loadOfficialSkillFiles(name)
	description := ""
	if err == nil {
		frontMatter := parseSkillFrontMatter(files["SKILL.md"])
		description = frontMatter.Description
	}
	info := SkillInfo{
		Name:               name,
		Description:        description,
		Version:            version,
		Source:             string(SkillSourceOfficial),
		SourceKind:         SkillSourceOfficial,
		Installed:          record.Name == name || installedSkillDirExists(name),
		InstalledForAgents: installedAgentsForSkill(name),
		Official:           true,
		CanUpdate:          true,
	}
	if err != nil {
		info.CanUpdate = installedSkillDirExists(name)
	}
	if record.Version != "" {
		info.Version = record.Version
	}
	return info
}

func buildInstalledSkillInfo(record InstalledSkillRecord) SkillInfo {
	return SkillInfo{
		Name:               record.Name,
		Description:        record.Description,
		Version:            record.Version,
		Source:             record.Source,
		SourceKind:         record.SourceKind,
		Installed:          true,
		InstalledForAgents: installedAgentsForSkill(record.Name),
		Official:           record.Official,
		CanUpdate:          record.Source != "",
	}
}

func loadOfficialSkillFiles(name string) (map[string][]byte, string, error) {
	dir, err := resolveCanonicalSkillDir(name)
	if err != nil {
		return readInstalledSkillFilesFallback(name)
	}
	files, err := readSkillDir(dir)
	if err != nil {
		return readInstalledSkillFilesFallback(name)
	}
	return files, "workspace", nil
}

func readInstalledSkillFilesFallback(name string) (map[string][]byte, string, error) {
	files, err := readInstalledSkillFiles(name)
	if err != nil {
		return nil, "", fmt.Errorf("unknown official skill %q: %w", name, err)
	}
	return files, "workspace", nil
}

func resolveCanonicalSkillDir(name string) (string, error) {
	root, err := resolveCanonicalSkillsRoot()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, name)
	if _, statErr := os.Stat(filepath.Join(dir, "SKILL.md")); statErr != nil {
		return "", statErr
	}
	return dir, nil
}

func resolveCanonicalSkillsRoot() (string, error) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", errors.New("resolve source location")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "../../../../skills"))
	if _, err := os.Stat(root); err != nil {
		return "", err
	}
	return root, nil
}

func readCanonicalSkillFile(name string, relPath string) ([]byte, error) {
	dir, err := resolveCanonicalSkillDir(name)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(dir, filepath.FromSlash(relPath)))
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
	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			break
		}
		key, value, ok := strings.Cut(trimmed, ":")
		if !ok {
			continue
		}
		switch strings.TrimSpace(key) {
		case "name":
			meta.Name = strings.TrimSpace(value)
		case "description":
			meta.Description = strings.TrimSpace(value)
		}
	}
	return meta
}

func isOfficialSkillName(name string) bool {
	for _, official := range OfficialSkillNames() {
		if official == name {
			return true
		}
	}
	return false
}

func installedSkillDirExists(name string) bool {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(yishanHome, "skills", name, "SKILL.md"))
	return err == nil
}
