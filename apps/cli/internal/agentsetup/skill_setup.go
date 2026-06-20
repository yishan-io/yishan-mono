package setup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/memory"
)

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
	return AddSkill(workspaceSkillName)
}

func EnsureMemorySkill() (*SkillInstallResult, error) {
	return AddSkill(memorySkillName)
}

func EnsureStartSkill() (*SkillInstallResult, error) {
	return AddSkill(startSkillName)
}

func EnsureResearchSkill() (*SkillInstallResult, error) {
	return AddSkill(researchSkillName)
}

func EnsurePlanSkill() (*SkillInstallResult, error) {
	return AddSkill(planSkillName)
}

func EnsureBuildSkill() (*SkillInstallResult, error) {
	return AddSkill(buildSkillName)
}

func EnsureVerifySkill() (*SkillInstallResult, error) {
	return AddSkill(verifySkillName)
}

func EnsureDoneSkill() (*SkillInstallResult, error) {
	return AddSkill(doneSkillName)
}

// MemoryFileTemplate returns the starter MEMORY.md content to be written into a
// new project's .my-context/ directory.
func MemoryFileTemplate() string {
	content, err := readCanonicalSkillFile(memorySkillName, "MEMORY.md.tmpl")
	if err != nil {
		return ""
	}
	return string(content)
}

func RemoveWorkspaceSkill() error {
	return RemoveSkill(workspaceSkillName)
}

func RemoveMemorySkill() error {
	return RemoveSkill(memorySkillName)
}

func RemoveStartSkill() error {
	return RemoveSkill(startSkillName)
}

func RemoveResearchSkill() error {
	return RemoveSkill(researchSkillName)
}

func RemovePlanSkill() error {
	return RemoveSkill(planSkillName)
}

func RemoveBuildSkill() error {
	return RemoveSkill(buildSkillName)
}

func RemoveVerifySkill() error {
	return RemoveSkill(verifySkillName)
}

func RemoveDoneSkill() error {
	return RemoveSkill(doneSkillName)
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

// EnsurePersonaSetup writes the initial PERSONA.md template to
// ~/.yishan/memory/PERSONA.md if the file does not already exist.
// This is called during `yishan setup` so new users get a starter file.
func EnsurePersonaSetup(disablePersona bool) error {
	if disablePersona {
		return nil
	}
	personaPath, err := memory.PersonaFilePath()
	if err != nil {
		return fmt.Errorf("resolve persona path: %w", err)
	}
	if _, err := os.Stat(personaPath); err == nil {
		return nil // already exists — don't overwrite user edits
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("check persona file: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(personaPath), 0o755); err != nil {
		return fmt.Errorf("create persona dir: %w", err)
	}
	content := memory.BuildEmptyPersonaMarkdown()
	if err := os.WriteFile(personaPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write persona template: %w", err)
	}
	return nil
}
