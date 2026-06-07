package setup

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/config"
)

//go:embed assets/skills/yishan-workspace/SKILL.md
var workspaceSkillContent string

const skillName = "yishan-workspace"

type SkillInstallResult struct {
	SkillPath string
	Symlinks  []string
}

func EnsureWorkspaceSkill() (*SkillInstallResult, error) {
	yishanHome, err := config.HomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve yishan home: %w", err)
	}

	skillDir := filepath.Join(yishanHome, "skills", skillName)
	skillPath := filepath.Join(skillDir, "SKILL.md")

	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return nil, fmt.Errorf("create skill dir: %w", err)
	}
	if err := os.WriteFile(skillPath, []byte(workspaceSkillContent), 0o644); err != nil {
		return nil, fmt.Errorf("write skill file: %w", err)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve home dir: %w", err)
	}

	linkDirs := []string{
		filepath.Join(homeDir, ".config", "opencode", "skills", skillName),
		filepath.Join(homeDir, ".claude", "skills", skillName),
		filepath.Join(homeDir, ".agents", "skills", skillName),
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
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve home dir: %w", err)
	}

	linkDirs := []string{
		filepath.Join(homeDir, ".config", "opencode", "skills", skillName),
		filepath.Join(homeDir, ".claude", "skills", skillName),
		filepath.Join(homeDir, ".agents", "skills", skillName),
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

	skillDir := filepath.Join(yishanHome, "skills", skillName)
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
