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

	result, err := AddSkill(StartSkillName)
	if err != nil {
		t.Fatalf("add official skill: %v", err)
	}

	if !strings.HasSuffix(result.SkillPath, filepath.Join(".yishan", "skills", StartSkillName, "SKILL.md")) {
		t.Fatalf("unexpected skill path: %s", result.SkillPath)
	}

	content, err := os.ReadFile(result.SkillPath)
	if err != nil {
		t.Fatalf("read installed skill: %v", err)
	}
	if !strings.Contains(string(content), "name: ys-start") {
		t.Fatalf("expected installed official skill content, got %q", string(content))
	}

	registry, err := loadSkillRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(registry.Skills) != 1 || registry.Skills[0].SourceKind != SkillSourceOfficial {
		t.Fatalf("expected one official registry entry, got %#v", registry.Skills)
	}

	expectedPiSkillPath := filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", StartSkillName)
	if _, err := os.Lstat(expectedPiSkillPath); err != nil {
		t.Fatalf("expected pi skill symlink: %v", err)
	}
	if !containsString(result.Symlinks, expectedPiSkillPath) {
		t.Fatalf("expected install result symlinks to contain %s, got %v", expectedPiSkillPath, result.Symlinks)
	}

	commandsPath := filepath.Join(homeDir, ".yishan", "opencode-config-home", "commands", StartSkillName+".md")
	if _, err := os.Stat(commandsPath); err != nil {
		t.Fatalf("expected opencode command file: %v", err)
	}
	commandContent, err := os.ReadFile(commandsPath)
	if err != nil {
		t.Fatalf("read opencode command file: %v", err)
	}
	if !strings.Contains(string(commandContent), "YISHAN_COMMAND: ys-start") {
		t.Fatalf("expected path-free opencode command marker, got %q", string(commandContent))
	}
	if strings.Contains(string(commandContent), "Read ~/.agents/skills/") {
		t.Fatalf("expected command body to avoid installed skill paths, got %q", string(commandContent))
	}

	info, err := GetSkillInfo(StartSkillName)
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

func TestRemoveSkill_RemovesRegistryAndSymlinks(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	if _, err := AddSkill(StartSkillName); err != nil {
		t.Fatalf("add skill: %v", err)
	}

	if err := RemoveSkill(StartSkillName); err != nil {
		t.Fatalf("remove skill: %v", err)
	}

	if _, err := os.Stat(filepath.Join(homeDir, ".yishan", "skills", StartSkillName)); !os.IsNotExist(err) {
		t.Fatalf("expected installed skill dir removed, got err=%v", err)
	}

	registry, err := loadSkillRegistry()
	if err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(registry.Skills) != 0 {
		t.Fatalf("expected empty registry after removal, got %#v", registry.Skills)
	}

	for _, path := range []string{
		filepath.Join(homeDir, ".claude", "skills", StartSkillName),
		filepath.Join(homeDir, ".codex", "skills", StartSkillName),
		filepath.Join(homeDir, ".agents", "skills", StartSkillName),
		filepath.Join(homeDir, ".yishan", "pi", "agent", "skills", StartSkillName),
	} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Fatalf("expected symlink removed at %s, err=%v", path, err)
		}
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

func TestEnsureMemorySkill_InstallsCanonicalSkillInstructions(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)

	result, err := EnsureMemorySkill()
	if err != nil {
		t.Fatalf("ensure memory skill: %v", err)
	}

	content, err := os.ReadFile(result.SkillPath)
	if err != nil {
		t.Fatalf("read installed skill: %v", err)
	}
	text := string(content)
	if !strings.Contains(text, "skip PERSONA.md entirely") {
		t.Fatal("expected canonical memory skill to mention remote-host persona skip")
	}
	if !strings.Contains(text, "YISHAN_REMOTE_HOST_POLICY=1") {
		t.Fatal("expected canonical memory skill to mention remote host policy env key")
	}
	if !strings.Contains(text, "Read `~/.yishan/memory/PERSONA.md` if it exists") {
		t.Fatal("expected canonical memory skill to retain persona guidance")
	}
}
