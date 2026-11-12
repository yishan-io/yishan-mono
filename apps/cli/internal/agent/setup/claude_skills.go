package setup

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

//go:embed assets/claude-skills
var claudeSkillsFS embed.FS

const (
	claudeSkillsAssetRoot = "assets/claude-skills"
	// claudeSkillMarkerFile marks a skill directory as installed by yishan.
	// Only directories carrying it are ever replaced or removed.
	claudeSkillMarkerFile = ".yishan-managed"
)

// claudeSkillsRootResolver is injectable so tests can point it at a temp dir.
var claudeSkillsRootResolver = defaultClaudeSkillsRootResolver

func defaultClaudeSkillsRootResolver() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".claude", "skills"), nil
}

// ClaudeSkillsResult reports what one install or remove run did.
type ClaudeSkillsResult struct {
	Installed []string `json:"installed,omitempty"`
	Unchanged []string `json:"unchanged,omitempty"`
	Removed   []string `json:"removed,omitempty"`
	// Skipped lists skills left alone because an unmanaged directory of the
	// same name already exists.
	Skipped []string `json:"skipped,omitempty"`
}

// ClaudeSkillsState describes the managed Claude skills currently installed.
type ClaudeSkillsState struct {
	Installed bool     `json:"installed"`
	Skills    []string `json:"skills,omitempty"`
}

// EnsureClaudeSkills copies the bundled Claude skills into ~/.claude/skills.
// An existing directory without the yishan marker is never touched.
func EnsureClaudeSkills() (ClaudeSkillsResult, error) {
	root, err := claudeSkillsRootResolver()
	if err != nil {
		return ClaudeSkillsResult{}, err
	}
	names, err := bundledClaudeSkillNames()
	if err != nil {
		return ClaudeSkillsResult{}, err
	}
	var result ClaudeSkillsResult
	var errs []error
	for _, name := range names {
		if err := installClaudeSkill(root, name, &result); err != nil {
			errs = append(errs, fmt.Errorf("install claude skill %s: %w", name, err))
		}
	}
	return result, errors.Join(errs...)
}

// RemoveClaudeSkills deletes only the bundled skills that carry the marker.
func RemoveClaudeSkills() (ClaudeSkillsResult, error) {
	root, err := claudeSkillsRootResolver()
	if err != nil {
		return ClaudeSkillsResult{}, err
	}
	names, err := bundledClaudeSkillNames()
	if err != nil {
		return ClaudeSkillsResult{}, err
	}
	var result ClaudeSkillsResult
	var errs []error
	for _, name := range names {
		target := filepath.Join(root, name)
		switch managed, statErr := isManagedClaudeSkill(target); {
		case statErr != nil:
			errs = append(errs, fmt.Errorf("inspect claude skill %s: %w", name, statErr))
		case managed:
			if err := os.RemoveAll(target); err != nil {
				errs = append(errs, fmt.Errorf("remove claude skill %s: %w", name, err))
				continue
			}
			result.Removed = append(result.Removed, name)
		default:
			if _, err := os.Lstat(target); err == nil {
				result.Skipped = append(result.Skipped, name)
			}
		}
	}
	return result, errors.Join(errs...)
}

func fillClaudeSkillsState(state *InstalledState) {
	root, err := claudeSkillsRootResolver()
	if err != nil {
		return
	}
	names, err := bundledClaudeSkillNames()
	if err != nil {
		return
	}
	for _, name := range names {
		if managed, _ := isManagedClaudeSkill(filepath.Join(root, name)); managed {
			state.ClaudeSkills.Skills = append(state.ClaudeSkills.Skills, name)
		}
	}
	state.ClaudeSkills.Installed = len(state.ClaudeSkills.Skills) > 0
}

func installClaudeSkill(root, name string, result *ClaudeSkillsResult) error {
	files, digest, err := readBundledClaudeSkill(name)
	if err != nil {
		return err
	}
	target := filepath.Join(root, name)
	managed, err := isManagedClaudeSkill(target)
	if err != nil {
		return err
	}
	if _, statErr := os.Lstat(target); statErr == nil && !managed {
		result.Skipped = append(result.Skipped, name)
		return nil
	}
	if managed {
		if current, readErr := os.ReadFile(filepath.Join(target, claudeSkillMarkerFile)); readErr == nil && strings.TrimSpace(string(current)) == digest {
			result.Unchanged = append(result.Unchanged, name)
			return nil
		}
	}
	if err := replaceClaudeSkillDir(root, name, files, digest); err != nil {
		return err
	}
	result.Installed = append(result.Installed, name)
	return nil
}

// replaceClaudeSkillDir stages the skill next to its target, then swaps it in.
func replaceClaudeSkillDir(root, name string, files map[string][]byte, digest string) error {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	staging, err := os.MkdirTemp(root, "."+name+".tmp-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	for rel, content := range files {
		dest := filepath.Join(staging, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(dest, content, 0o644); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(staging, claudeSkillMarkerFile), []byte(digest+"\n"), 0o644); err != nil {
		return err
	}
	target := filepath.Join(root, name)
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	return os.Rename(staging, target)
}

// isManagedClaudeSkill reports whether target is a real directory carrying
// the marker. A symlink is never treated as managed.
func isManagedClaudeSkill(target string) (bool, error) {
	info, err := os.Lstat(target)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.IsDir() {
		return false, nil
	}
	if _, err := os.Lstat(filepath.Join(target, claudeSkillMarkerFile)); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func bundledClaudeSkillNames() ([]string, error) {
	entries, err := claudeSkillsFS.ReadDir(claudeSkillsAssetRoot)
	if err != nil {
		return nil, fmt.Errorf("read bundled claude skills: %w", err)
	}
	var names []string
	for _, entry := range entries {
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

// readBundledClaudeSkill returns the skill files keyed by slash-relative path
// and a content digest that changes whenever any file changes.
func readBundledClaudeSkill(name string) (map[string][]byte, string, error) {
	base := path.Join(claudeSkillsAssetRoot, name)
	files := map[string][]byte{}
	err := fs.WalkDir(claudeSkillsFS, base, func(p string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return walkErr
		}
		content, readErr := claudeSkillsFS.ReadFile(p)
		if readErr != nil {
			return readErr
		}
		files[strings.TrimPrefix(p, base+"/")] = content
		return nil
	})
	if err != nil {
		return nil, "", fmt.Errorf("read bundled claude skill %s: %w", name, err)
	}
	rels := make([]string, 0, len(files))
	for rel := range files {
		rels = append(rels, rel)
	}
	sort.Strings(rels)
	hash := sha256.New()
	for _, rel := range rels {
		hash.Write([]byte(rel))
		hash.Write([]byte{0})
		hash.Write(files[rel])
		hash.Write([]byte{0})
	}
	return files, hex.EncodeToString(hash.Sum(nil)), nil
}
