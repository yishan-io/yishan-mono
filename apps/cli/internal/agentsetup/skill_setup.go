package setup

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/config"
)

//go:embed assets/skills/ys-workspace/SKILL.md
var workspaceSkillContent string

//go:embed assets/skills/ys-memory/SKILL.md
var memorySkillContent string

//go:embed assets/skills/ys-memory/MEMORY.md.tmpl
var memoryFileTemplate string

//go:embed assets/skills/ys-start/SKILL.md
var startSkillContent string

//go:embed assets/skills/ys-research/SKILL.md
var researchSkillContent string

//go:embed assets/skills/ys-plan/SKILL.md
var planSkillContent string

//go:embed assets/skills/ys-build/SKILL.md
var buildSkillContent string

//go:embed assets/skills/ys-verify/SKILL.md
var verifySkillContent string

//go:embed assets/skills/ys-done/SKILL.md
var doneSkillContent string

const (
	workspaceSkillName = "ys-workspace"
	memorySkillName    = "ys-memory"
	startSkillName     = "ys-start"
	researchSkillName  = "ys-research"
	planSkillName      = "ys-plan"
	buildSkillName     = "ys-build"
	verifySkillName    = "ys-verify"
	doneSkillName      = "ys-done"

	// Exported for use by the daemon dispatcher.
	WorkspaceSkillName = workspaceSkillName
	MemorySkillName    = memorySkillName
	StartSkillName     = startSkillName
	ResearchSkillName  = researchSkillName
	PlanSkillName      = planSkillName
	BuildSkillName     = buildSkillName
	VerifySkillName    = verifySkillName
	DoneSkillName      = doneSkillName
)

type SkillInstallResult struct {
	SkillPath string
	Symlinks  []string
}

func EnsureWorkspaceSkill() (*SkillInstallResult, error) {
	return ensureSkill(workspaceSkillName, workspaceSkillContent)
}

func EnsureMemorySkill() (*SkillInstallResult, error) {
	return ensureSkill(memorySkillName, memorySkillContent)
}

func EnsureStartSkill() (*SkillInstallResult, error) {
	return ensureSkill(startSkillName, startSkillContent)
}

func EnsureResearchSkill() (*SkillInstallResult, error) {
	return ensureSkill(researchSkillName, researchSkillContent)
}

func EnsurePlanSkill() (*SkillInstallResult, error) {
	return ensureSkill(planSkillName, planSkillContent)
}

func EnsureBuildSkill() (*SkillInstallResult, error) {
	return ensureSkill(buildSkillName, buildSkillContent)
}

func EnsureVerifySkill() (*SkillInstallResult, error) {
	return ensureSkill(verifySkillName, verifySkillContent)
}

func EnsureDoneSkill() (*SkillInstallResult, error) {
	return ensureSkill(doneSkillName, doneSkillContent)
}

// MemoryFileTemplate returns the starter MEMORY.md content to be written into a
// new project's .my-context/ directory.
func MemoryFileTemplate() string {
	return memoryFileTemplate
}

func ensureSkill(name string, content string) (*SkillInstallResult, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve yishan home: %w", err)
	}

	skillDir := filepath.Join(yishanHome, "skills", name)
	skillPath := filepath.Join(skillDir, "SKILL.md")

	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return nil, fmt.Errorf("create skill dir: %w", err)
	}
	if err := os.WriteFile(skillPath, []byte(content), 0o644); err != nil {
		return nil, fmt.Errorf("write skill file: %w", err)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve home dir: %w", err)
	}

	linkDirs := []string{
		filepath.Join(homeDir, ".config", "opencode", "skills", name),
		filepath.Join(homeDir, ".claude", "skills", name),
		filepath.Join(homeDir, ".agents", "skills", name),
	}

	result := &SkillInstallResult{SkillPath: skillPath}

	for _, linkDir := range linkDirs {
		if err := ensureSkillSymlink(linkDir, skillDir); err != nil {
			return result, fmt.Errorf("symlink %s: %w", linkDir, err)
		}
		result.Symlinks = append(result.Symlinks, linkDir)
	}

	return result, nil
}

func RemoveWorkspaceSkill() error {
	return removeSkill(workspaceSkillName)
}

func RemoveMemorySkill() error {
	return removeSkill(memorySkillName)
}

func RemoveStartSkill() error {
	return removeSkill(startSkillName)
}

func RemoveResearchSkill() error {
	return removeSkill(researchSkillName)
}

func RemovePlanSkill() error {
	return removeSkill(planSkillName)
}

func RemoveBuildSkill() error {
	return removeSkill(buildSkillName)
}

func RemoveVerifySkill() error {
	return removeSkill(verifySkillName)
}

func RemoveDoneSkill() error {
	return removeSkill(doneSkillName)
}

func removeSkill(name string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home dir: %w", err)
	}

	linkDirs := []string{
		filepath.Join(homeDir, ".config", "opencode", "skills", name),
		filepath.Join(homeDir, ".claude", "skills", name),
		filepath.Join(homeDir, ".agents", "skills", name),
	}

	for _, linkDir := range linkDirs {
		if info, err := os.Lstat(linkDir); err == nil && info.Mode()&os.ModeSymlink != 0 {
			if err := os.Remove(linkDir); err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("remove symlink %s: %w", linkDir, err)
			}
		} else if err == nil {
			return fmt.Errorf("expected symlink at %s but found regular entry; refusing to remove", linkDir)
		} else if !os.IsNotExist(err) {
			return err
		}
	}

	yishanHome, err := config.HomeDir()
	if err != nil {
		return fmt.Errorf("resolve yishan home: %w", err)
	}

	skillDir := filepath.Join(yishanHome, "skills", name)
	if err := os.RemoveAll(skillDir); err != nil {
		return fmt.Errorf("remove skill dir: %w", err)
	}

	return nil
}

func ensureSkillSymlink(linkPath string, target string) error {
	if err := os.MkdirAll(filepath.Dir(linkPath), 0o755); err != nil {
		return err
	}

	if existing, err := os.Lstat(linkPath); err == nil {
		if existing.Mode()&os.ModeSymlink != 0 {
			currentTarget, readErr := os.Readlink(linkPath)
			if readErr == nil && strings.TrimRight(currentTarget, string(filepath.Separator)) == strings.TrimRight(target, string(filepath.Separator)) {
				return nil
			}
			if err := os.Remove(linkPath); err != nil {
				return err
			}
		} else {
			return fmt.Errorf("path %s exists and is not a symlink", linkPath)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	return os.Symlink(target, linkPath)
}
