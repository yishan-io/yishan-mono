package setup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAddSkill_OfficialSkillUsesCanonicalSource(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	result, err := AddSkill(StartingTaskSkillName)
	if err != nil {
		t.Fatalf("add official skill: %v", err)
	}

	if !strings.HasSuffix(result.SkillPath, filepath.Join(".yishan", "pi", "agent", "skills", StartingTaskSkillName, "SKILL.md")) {
		t.Fatalf("unexpected skill path: %s", result.SkillPath)
	}

	content, err := os.ReadFile(result.SkillPath)
	if err != nil {
		t.Fatalf("read installed skill: %v", err)
	}
	if !strings.Contains(string(content), "name: starting-task") {
		t.Fatalf("expected installed official skill content, got %q", string(content))
	}
	// Verify the skill body has meaningful instructional content, not just frontmatter.
	if !strings.Contains(string(content), ".my-context/tasks/") {
		t.Fatalf("expected skill body to reference .my-context/tasks/, got %q", string(content))
	}
	if !strings.Contains(string(content), "tracked task") {
		t.Fatalf("expected skill body to mention tracked task, got %q", string(content))
	}

	registry, err := loadSkillRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(registry.Skills) != 1 || registry.Skills[0].SourceKind != SkillSourceOfficial {
		t.Fatalf("expected one official registry entry, got %#v", registry.Skills)
	}

	expectedPiSkillPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", StartingTaskSkillName)
	if _, err := os.Lstat(expectedPiSkillPath); err != nil {
		t.Fatalf("expected pi skill dir: %v", err)
	}

	info, err := GetSkillInfo(StartingTaskSkillName)
	if err != nil {
		t.Fatalf("get skill info: %v", err)
	}
	if !info.Installed || info.SourceKind != SkillSourceOfficial || info.Version == "" {
		t.Fatalf("unexpected skill info: %#v", info)
	}
	if !containsString(info.InstalledForAgents, "pi") {
		t.Fatalf("expected pi install target in %#v", info.InstalledForAgents)
	}
}

func TestRemoveSkill_RemovesDirAndRegistry(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	if _, err := AddSkill(StartingTaskSkillName); err != nil {
		t.Fatalf("add skill: %v", err)
	}

	if err := RemoveSkill(StartingTaskSkillName); err != nil {
		t.Fatalf("remove skill: %v", err)
	}

	piSkillsDir := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", StartingTaskSkillName)
	if _, err := os.Stat(piSkillsDir); !os.IsNotExist(err) {
		t.Fatalf("expected installed skill dir removed, got err=%v", err)
	}

	registry, err := loadSkillRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(registry.Skills) != 0 {
		t.Fatalf("expected empty registry after removal, got %#v", registry.Skills)
	}
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func TestEnsureContextMemorySkill_InstallsCanonicalSkillInstructions(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	result, err := AddSkill(ContextMemorySkillName)
	if err != nil {
		t.Fatalf("ensure context memory skill: %v", err)
	}

	content, err := os.ReadFile(result.SkillPath)
	if err != nil {
		t.Fatalf("read installed skill: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, "context-memory") {
		t.Fatal("expected canonical memory skill frontmatter")
	}
	if !strings.Contains(text, "MEMORY.md") {
		t.Fatal("expected canonical memory skill to mention MEMORY.md")
	}
	if !strings.Contains(text, ".my-context/") {
		t.Fatal("expected canonical memory skill to reference .my-context/")
	}
}
