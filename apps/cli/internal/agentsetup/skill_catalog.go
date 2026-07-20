package setup

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"yishan/apps/cli/internal/config"
)

var canonicalSkillsRootResolver = defaultCanonicalSkillsRootResolver
var remoteOfficialSkillFilesLoader = defaultRemoteOfficialSkillFilesLoader

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
		brainstormSkillName,
		contextMemorySkillName,
		contextTaskSkillName,
		dispatchingParallelAgentsSkillName,
		executingPlansSkillName,
		finishingTaskSkillName,
		receivingCodeReviewSkillName,
		requestingCodeReviewSkillName,
		startingTaskSkillName,
		subagentDrivenDevelopmentSkillName,
		systematicDebuggingSkillName,
		testDrivenDevelopmentSkillName,
		writingPlansSkillName,
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
	if isOfficialSkillName(trimmed) {
		return getLocalOfficialSkillInfo(trimmed)
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
		fileMap, _, err = loadLocalOfficialSkillFiles(trimmed)
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

func buildOfficialSkillInfo(name string, record InstalledSkillRecord) SkillInfo {
	description := record.Description
	version := record.Version
	files, localVersion, err := loadLocalOfficialSkillFiles(name)
	if err == nil {
		frontMatter := parseSkillFrontMatter(files["SKILL.md"])
		if frontMatter.Description != "" {
			description = frontMatter.Description
		}
		if version == "" {
			version = localVersion
		}
	}
	installed := record.Name == name || installedSkillDirExists(name)
	return SkillInfo{
		Name:               name,
		Description:        description,
		Version:            version,
		Source:             string(SkillSourceOfficial),
		SourceKind:         SkillSourceOfficial,
		Installed:          installed,
		InstalledForAgents: installedAgentsForSkill(name),
		Official:           true,
		CanUpdate:          installed || err == nil,
	}
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
	files, version, err := loadLocalOfficialSkillFiles(name)
	if err == nil {
		return files, version, nil
	}
	return nil, "", err
}

func loadLocalOfficialSkillFiles(name string) (map[string][]byte, string, error) {
	dir, err := resolveCanonicalSkillDir(name)
	if err == nil {
		files, readErr := readSkillDir(dir)
		if readErr == nil {
			return files, "workspace", nil
		}
	}
	return readInstalledSkillFilesFallback(name)
}

func loadAuthoritativeOfficialSkillFiles(name string) (map[string][]byte, string, error) {
	dir, err := resolveCanonicalSkillDir(name)
	if err == nil {
		files, readErr := readSkillDir(dir)
		if readErr == nil {
			return files, "workspace", nil
		}
		err = readErr
	}
	files, version, remoteErr := remoteOfficialSkillFilesLoader(name)
	if remoteErr == nil {
		return files, version, nil
	}
	return nil, "", fmt.Errorf("official skill %q source unavailable: workspace=%v remote=%v", name, err, remoteErr)
}

func readInstalledSkillFilesFallback(name string) (map[string][]byte, string, error) {
	files, err := readInstalledSkillFiles(name)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, "", fmt.Errorf("official skill %q not found locally", name)
		}
		return nil, "", err
	}
	return files, "installed", nil
}

func getLocalOfficialSkillInfo(name string) (*SkillInfo, error) {
	registry, err := loadSkillRegistry()
	if err != nil {
		return nil, err
	}
	var record InstalledSkillRecord
	for _, installedRecord := range registry.Skills {
		if installedRecord.Name == name {
			record = installedRecord
			break
		}
	}
	if _, _, err := loadLocalOfficialSkillFiles(name); err != nil {
		if isOfficialSkillNotFoundLocallyError(err) {
			return nil, fmt.Errorf("unknown skill %q", name)
		}
		return nil, err
	}
	info := buildOfficialSkillInfo(name, record)
	return &info, nil
}

func isOfficialSkillNotFoundLocallyError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "not found locally")
}

func resolveCanonicalSkillDir(name string) (string, error) {
	root, err := canonicalSkillsRootResolver()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, name)
	if _, statErr := os.Stat(filepath.Join(dir, "SKILL.md")); statErr != nil {
		return "", statErr
	}
	return dir, nil
}

func defaultCanonicalSkillsRootResolver() (string, error) {
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
		if value == "" {
			var parts []string
			for i+1 < len(lines) {
				next := lines[i+1]
				nextTrimmed := strings.TrimSpace(next)
				if strings.TrimSpace(next) == "---" {
					break
				}
				if nextTrimmed == "" {
					i++
					continue
				}
				if next[0] != ' ' && next[0] != '\t' {
					break
				}
				parts = append(parts, nextTrimmed)
				i++
			}
			value = strings.Join(parts, " ")
		}
		switch key {
		case "name":
			meta.Name = value
		case "description":
			meta.Description = value
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
	piSkillsDir, err := config.ManagedPiSkillsDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(filepath.Join(piSkillsDir, name, "SKILL.md"))
	return err == nil
}
