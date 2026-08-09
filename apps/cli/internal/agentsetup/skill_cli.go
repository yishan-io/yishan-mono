package setup

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ErrInvalidSkillName is returned when a skill name cannot be a safe
// directory entry in the user skills root (empty, or containing path
// separators / parent references).
var ErrInvalidSkillName = errors.New("invalid skill name")

// Skills CLI integration. The ecosystem `npx skills` command manages skills
// in the user-level ~/.agents/skills root — the same root the daemon scans
// for global skills, so an installed skill appears in the daemon list
// immediately. All operations target the global scope only: never
// project-local installs, never per-CLI-harness (claude/codex/opencode)
// scopes.

// AddSkill installs a skill package (owner/repo, https://github.com/...,
// or a URL the CLI accepts) globally via the skills CLI.
func AddSkill(ctx context.Context, source string) error {
	return runSkillsCommand(ctx, "add", source, "--global", "--yes")
}

// RemoveSkill removes an installed skill by name. The skills CLI only tracks
// skills it installed itself, so hand-installed skills (present on disk but
// unknown to the CLI) are deleted from the user skills root directly as a
// fallback. The fallback locates the skill by its exact name and by the
// CLI-sanitized directory name, since the CLI installs dirs under the
// sanitized form of the skill name (e.g. "Web Design Guidelines" → dir
// web-design-guidelines).
func RemoveSkill(ctx context.Context, name string) error {
	trimmed := strings.TrimSpace(name)
	if err := validateSkillName(trimmed); err != nil {
		return err
	}
	if err := runSkillsCommand(ctx, "remove", trimmed, "--global", "--yes"); err != nil {
		return err
	}
	userSkillsRoot, err := userSkillsRootResolver()
	if err != nil {
		return err
	}
	for _, candidate := range []string{trimmed, sanitizeSkillName(trimmed)} {
		targetDir := filepath.Join(userSkillsRoot, candidate)
		if _, err := os.Stat(targetDir); err != nil {
			continue
		}
		// The sanitized-name fallback can collide with a different skill that
		// happens to sanitize to the same dir; only delete when the skill
		// inside actually matches the requested name.
		if candidate != trimmed && !dirSkillMatchesName(targetDir, trimmed) {
			return nil
		}
		if err := os.RemoveAll(targetDir); err != nil {
			return fmt.Errorf("remove skill dir %s: %w", targetDir, err)
		}
		return nil
	}
	return nil
}

// dirSkillMatchesName reports whether the skill in dir is the one requested:
// the frontmatter name compared case-insensitively (the CLI sanitizes names
// to lowercase on disk).
func dirSkillMatchesName(dir string, name string) bool {
	content, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		return false
	}
	return strings.EqualFold(parseSkillFrontMatter(content).Name, name)
}

// UpdateSkill updates an installed skill to its latest version via the CLI's
// update command, which matches installed skills by name.
func UpdateSkill(ctx context.Context, name string) error {
	trimmed := strings.TrimSpace(name)
	if err := validateSkillName(trimmed); err != nil {
		return err
	}
	return runSkillsCommand(ctx, "update", trimmed, "--global", "--yes")
}

// UpdateAllSkills updates every installed global skill via the CLI.
func UpdateAllSkills(ctx context.Context) error {
	return runSkillsCommand(ctx, "update", "--global", "--yes")
}

// runSkillsCommand runs `npx --yes skills <args...>` and surfaces failures
// with the captured output so the daemon RPC can report a clear error.
func runSkillsCommand(ctx context.Context, args ...string) error {
	cmd, err := newSkillsCommand(ctx, args...)
	if err != nil {
		return err
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("skills %s failed: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}

func newSkillsCommand(ctx context.Context, args ...string) (*exec.Cmd, error) {
	cmd := execCommandContext(ctx, "npx", append([]string{"--yes", "skills"}, args...)...)
	cmd.Env = os.Environ()
	return cmd, nil
}

// validateSkillName guards the direct-delete fallback in RemoveSkill: the
// name becomes a directory name inside the user skills root, so it must not
// contain path separators or escape the root.
func validateSkillName(name string) error {
	if name == "" {
		return fmt.Errorf("%w: empty name", ErrInvalidSkillName)
	}
	if strings.ContainsAny(name, `/\`) || name == "." || name == ".." {
		return fmt.Errorf("%w: %q", ErrInvalidSkillName, name)
	}
	return nil
}

// sanitizeSkillName mirrors the skills CLI's directory-name sanitizer
// (lowercase; runs of characters outside [a-z0-9._] become one dash; leading
// and trailing dashes/dots are trimmed; capped at 255 chars) so the remove
// fallback can find skills whose on-disk directory uses the sanitized form.
func sanitizeSkillName(name string) string {
	var builder strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' {
			builder.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			builder.WriteByte('-')
			prevDash = true
		}
	}
	sanitized := strings.Trim(builder.String(), "-.")
	if len(sanitized) > 255 {
		sanitized = sanitized[:255]
	}
	if sanitized == "" {
		return "unnamed-skill"
	}
	return sanitized
}
