package setup

import (
	"os"
	"path/filepath"
	"testing"
)

func useTempClaudeSkillsRoot(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), ".claude", "skills")
	previous := claudeSkillsRootResolver
	claudeSkillsRootResolver = func() (string, error) { return root, nil }
	t.Cleanup(func() { claudeSkillsRootResolver = previous })
	return root
}

func TestEnsureClaudeSkillsInstallsBundledSkills(t *testing.T) {
	root := useTempClaudeSkillsRoot(t)

	result, err := EnsureClaudeSkills()
	if err != nil {
		t.Fatalf("EnsureClaudeSkills: %v", err)
	}
	want := []string{"yishan-memory", "yishan-task", "yishan-workspace"}
	if len(result.Installed) != len(want) {
		t.Fatalf("installed = %v, want %v", result.Installed, want)
	}
	for _, name := range want {
		for _, file := range []string{"SKILL.md", claudeSkillMarkerFile} {
			if _, err := os.Stat(filepath.Join(root, name, file)); err != nil {
				t.Fatalf("missing %s/%s: %v", name, file, err)
			}
		}
	}
}

func TestEnsureClaudeSkillsIsIdempotentAndUpgrades(t *testing.T) {
	root := useTempClaudeSkillsRoot(t)
	if _, err := EnsureClaudeSkills(); err != nil {
		t.Fatal(err)
	}

	second, err := EnsureClaudeSkills()
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Installed) != 0 || len(second.Unchanged) != 3 {
		t.Fatalf("second run = %+v, want all unchanged", second)
	}

	taskDir := filepath.Join(root, "yishan-task")
	if err := os.WriteFile(filepath.Join(taskDir, claudeSkillMarkerFile), []byte("stale\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(taskDir, "SKILL.md"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	third, err := EnsureClaudeSkills()
	if err != nil {
		t.Fatal(err)
	}
	if len(third.Installed) != 1 || third.Installed[0] != "yishan-task" {
		t.Fatalf("third run = %+v, want yishan-task upgraded", third)
	}
	content, _ := os.ReadFile(filepath.Join(taskDir, "SKILL.md"))
	if string(content) == "old" {
		t.Fatal("stale managed skill was not replaced")
	}
}

func TestEnsureClaudeSkillsLeavesUnmanagedDirectories(t *testing.T) {
	root := useTempClaudeSkillsRoot(t)
	userDir := filepath.Join(root, "yishan-task")
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userDir, "SKILL.md"), []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := EnsureClaudeSkills()
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Skipped) != 1 || result.Skipped[0] != "yishan-task" {
		t.Fatalf("skipped = %v, want yishan-task", result.Skipped)
	}
	content, _ := os.ReadFile(filepath.Join(userDir, "SKILL.md"))
	if string(content) != "mine" {
		t.Fatalf("user skill modified: %q", content)
	}
	removed, err := RemoveClaudeSkills()
	if err != nil {
		t.Fatal(err)
	}
	if len(removed.Removed) != 2 || len(removed.Skipped) != 1 {
		t.Fatalf("remove = %+v, want 2 removed and 1 skipped", removed)
	}
	if _, err := os.Stat(userDir); err != nil {
		t.Fatalf("user skill removed: %v", err)
	}
}

func TestEnsureClaudeSkillsDoesNotFollowSymlinks(t *testing.T) {
	root := useTempClaudeSkillsRoot(t)
	external := t.TempDir()
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, filepath.Join(root, "yishan-memory")); err != nil {
		t.Fatal(err)
	}

	result, err := EnsureClaudeSkills()
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Skipped) != 1 || result.Skipped[0] != "yishan-memory" {
		t.Fatalf("skipped = %v, want yishan-memory", result.Skipped)
	}
	if entries, _ := os.ReadDir(external); len(entries) != 0 {
		t.Fatalf("symlink target modified: %v", entries)
	}
	if _, err := RemoveClaudeSkills(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(root, "yishan-memory")); err != nil {
		t.Fatalf("symlink removed: %v", err)
	}
}

func TestFillClaudeSkillsState(t *testing.T) {
	useTempClaudeSkillsRoot(t)
	state := &InstalledState{}
	fillClaudeSkillsState(state)
	if state.ClaudeSkills.Installed {
		t.Fatal("expected not installed")
	}
	if _, err := EnsureClaudeSkills(); err != nil {
		t.Fatal(err)
	}
	fillClaudeSkillsState(state)
	if !state.ClaudeSkills.Installed || len(state.ClaudeSkills.Skills) != 3 {
		t.Fatalf("state = %+v", state.ClaudeSkills)
	}
}
